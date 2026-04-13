const fs = require('fs');
const path = require('path');
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const dotenv = require("dotenv");
const { execSync } = require("child_process");
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const axios = require('axios');

// Carrega .env do diretório onde o executável está sendo rodado
// (process.cwd() pega o diretório atual de trabalho)
dotenv.config({ path: path.join(process.cwd(), '.env') });

try {
  // Verifica se o banco existe tentando conectar e rodar um comando simples
  // Se falhar (ex: banco não existe), o execSync lança erro e cai no catch
  execSync(`psql "${process.env.DB_CONNECTION_STRING}" -c "SELECT 1"`, { stdio: 'ignore' });
} catch (e) {
  console.log("Banco de dados não encontrado ou inacessível. Tentando criar via psql e dispatch_ddl.sql...");
  try {
    const ddlPath = path.join(__dirname, 'dispatch_ddl.sql');
    
    // Constrói a string de conexão para o banco 'postgres' (banco de manutenção padrão)
    // para poder executar o comando CREATE DATABASE
    const dbUrl = new URL(process.env.DB_CONNECTION_STRING);
    dbUrl.pathname = "postgres"; 
    const postgresUrl = dbUrl.toString();

    console.log(`Executando dispatch_ddl.sql em: ${postgresUrl}`);
    execSync(`psql "${postgresUrl}" -f "${ddlPath}"`, { stdio: 'inherit' });
    console.log("✅ Estrutura do banco de dados criada com sucesso!");
  } catch (initErr) {
    console.error("❌ Falha ao inicializar banco de dados:", initErr.message);
  }
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors({ origin: true, credentials: true })); // preflight para todos os endpoints
app.use(express.json({ limit: "50mb" }));

const pool = new Pool({ connectionString: process.env.DB_CONNECTION_STRING });

// Ensure settings table exists
pool.query(`CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB
)`).catch(console.error);

const auth = {
	headers: {
		"Authorization": `Basic ${Buffer.from(`${process.env.VITE_REST_API_USER}:${process.env.VITE_REST_API_PASS}`).toString("base64")}`,
	}
}
let cameraNamesCache = {};

// Sincroniza ao iniciar e depois a cada 10 minutos
syncCameraNames();
setInterval(syncCameraNames, 10 * 60 * 1000);

async function syncCameraNames() {
  try {
    const response = await fetch(`http://${process.env.IP_SERVER}:8888/api/v2/cameras`, auth);
    const json = await response.json();
    
    if (json.data) {
      const newMap = {};
      json.data.forEach(cam => {
        newMap[cam.id] = cam.name;
      });
      cameraNamesCache = newMap;
      console.log("✅ Nomes das câmeras sincronizados!");
    }
  } catch (e) {
    console.error("❌ Erro ao buscar nomes das câmeras:", e.message);
  }
}

async function addLog(incidentId, operator, event) {
	await pool.query(`INSERT INTO public.logs (incident_id, time, operator, event) VALUES ($1,$2,$3,$4)`, [
		incidentId,
		new Date(),
		operator || null,
		event,
	]);
}

function mustIso(value, field) {
    const d = new Date(value);
	if (!value || Number.isNaN(d.getTime())) {
		const e = new Error(`Parâmetro inválido: ${field}`);
		e.status = 400;
		throw e;
	}
	return d;
}

// --- HELPER: Filtro Reutilizável (Extraído para usar na lista e nos exports) ---
function buildDispatchQuery(query) {
    const { from, to, state, type, action, operator, priority } = query;

    // Se 'from' e 'to' não vierem (caso comum no export global), define intervalo amplo
    // Na listagem normal o frontend costuma mandar.
    let fromDate, toDate;
    if (!from) fromDate = new Date('2000-01-01');
    else fromDate = mustIso(from, "from");

    if (!to) toDate = new Date('2099-12-31');
    else toDate = mustIso(to, "to");

    const where = [`e."time" >= $1`, `e."time" <= $2`];
    const params = [fromDate, toDate];
    let p = 3;

    if (state) {
        where.push(`e."state" = $${p++}`);
        params.push(state);
    }
    if (priority) {
        where.push(`e."priority" = $${p++}`);
        params.push(priority);
    }
    if (type) {
        where.push(`e."type" ILIKE $${p++}`);
        params.push(`%${type}%`);
    }
    if (action) {
        where.push(`e."action" ILIKE $${p++}`);
        params.push(`%${action}%`);
    }
    if (operator) {
        where.push(`e."operator" ILIKE $${p++}`);
        params.push(`%${operator}%`);
    }

    return { whereClause: `WHERE ${where.join(" AND ")}`, params };
}

// ADMIN SETTINGS ENDPOINTS

// 8) Get Settings
app.get("/api/admin/settings", async (req, res, next) => {
    try {
        const result = await pool.query("SELECT key, value FROM public.app_settings");
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json({ status: "success", data: settings });
    } catch (e) {
        next(e);
    }
});

// 9) Save Setting (Generic key-value)
app.post("/api/admin/settings", async (req, res, next) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: "Key is required" });

        // Serializa para JSON válido antes de inserir na coluna JSONB
        const jsonValue = JSON.stringify(value);

        await pool.query(
            `INSERT INTO public.app_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, jsonValue]
        );
        res.json({ status: "success" });
    } catch (e) {
        console.error("[settings] Erro ao salvar:", e.message);
        next(e);
    }
});

// Ensure uploads directory exists
// Substituí path.join(__dirname, ...) por process.cwd() para funcionar com pkgsnapshot
// O pkg coloca os arquivos de código dentro de um snapshot em memória (C:\snapshot\...)
// Mas os uploads devem ser salvos no sistema de arquivos real do usuário.
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 10) Upload Audio
app.post("/api/admin/upload-audio", async (req, res, next) => {
    try {
        const { fileData } = req.body; // Expecting base64 string
        if (!fileData) return res.status(400).json({ error: "File data is required" });

        const filePath = path.join(uploadsDir, 'alert.mp3'); // Fixed name for the alert sound
        
        // Strip base64 header if exists
        const base64Data = fileData.replace(/^data:audio\/\w+;base64,/, "");
        
        fs.writeFileSync(filePath, base64Data, 'base64');
        
        res.json({ status: "success", url: "/uploads/alert.mp3" });
    } catch (e) {
        next(e);
    }
});

// Serve uploads
app.use('/uploads', express.static(uploadsDir));

// Camera names cache endpoint
app.get("/api/cameras", (req, res) => {
    res.json({ status: "success", data: cameraNamesCache });
});

// 1) Callback
app.post("/events", async (req, res, next) => {
	try {
		const b = req.body || {};

		const time = b.time ? new Date(b.time) : new Date();

		const insert = `
      INSERT INTO public.events
      (incident, object_id, params, time, type, operator, state, comment, response_time, resolution_time, priority, procedure, action, name, cam_id)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id
    `;

		const values = [
			b.incident ?? null,
			b.object_id ?? null,
			b.params ? JSON.stringify(b.params) : b.params ?? null,
			time,
			b.type ?? null,
			null,
			"PENDING",
			null,
			null,
			null,
			b.priority ?? req.query.priority ?? null,
			b.procedure ?? null,
			b.action ?? null,
			b.name ?? null,
			b.cam_id ?? null,
		];

		const r = await pool.query(insert, values);
		const id = r.rows[0].id;

		await addLog(id, null, `Evento recebido: type=${b.type ?? "-"} action=${b.action ?? "-"}`);

		res.status(201).json({ status: "ok", id });
	} catch (e) {
		next(e);
	}
});

// 2) Lista da fila de despacho
app.get("/api/dispatch", async (req, res, next) => {
    try {
        const { limit = "50", offset = "0" } = req.query;

        // Usa a função auxiliar
        const { whereClause, params } = buildDispatchQuery(req.query);

        const lim = Math.min(parseInt(limit, 10) || 50, 200);
        const off = Math.max(parseInt(offset, 10) || 0, 0);

        // Removemos a lógica de filtro duplicada daqui e usamos whereClause

        const countQ = `SELECT COUNT(*)::bigint AS total FROM public.events e ${whereClause}`;
        const dataQ = `
      SELECT
        e.id, e.time, e.type, e.action, e.operator, e.state, e.priority,
        e.response_time, e.resolution_time, e.cam_id, e.name, e.incident, e.object_id, e.params
      FROM public.events e
      ${whereClause}
      ORDER BY e.time DESC
      LIMIT ${lim} OFFSET ${off}
    `;

        const [countR, dataR] = await Promise.all([pool.query(countQ, params), pool.query(dataQ, params)]);

        res.json({
            status: "success",
            total: countR.rows[0].total,
            limit: lim,
            offset: off,
            data: dataR.rows,
        });
    } catch (e) {
        next(e);
    }
});

// --- Endpoint CSV ---
app.get("/api/dispatch/export/csv", async (req, res, next) => {
    try {
        const exportLimit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
        const { whereClause, params } = buildDispatchQuery(req.query);

        const dataQ = `
            SELECT e.id, e.time, e.cam_id, e.name, e.type, e.action, e.operator, e.state, e.priority
            FROM public.events e
            ${whereClause}
            ORDER BY e.time DESC
            LIMIT ${exportLimit}
        `;

        const result = await pool.query(dataQ, params);
        const rows = result.rows.map(row => ({
            ID: row.id,
            Data: new Date(row.time).toLocaleString('pt-BR'),
            Camera: row.cam_id || '-',
            Nome: row.name || '-',
            Tipo: row.type || '-',
            Acao: row.action || '-',
            Prioridade: row.priority || '-',
            Estado: row.state || '-',
            Operador: row.operator || '-',
        }));

        const json2csvParser = new Parser({ delimiter: ';' });
        const csv = json2csvParser.parse(rows);

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename=relatorio_${Date.now()}.csv`);
        res.send('\uFEFF' + csv); // BOM para Excel abrir UTF-8 corretamente
    } catch (e) {
        next(e);
    }
});

// --- Endpoint XLSX ---
app.get("/api/dispatch/export/xlsx", async (req, res, next) => {
    try {
        const exportLimit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
        const { whereClause, params } = buildDispatchQuery(req.query);

        const dataQ = `
            SELECT e.id, e.time, e.cam_id, e.name, e.type, e.action, e.operator, e.state, e.priority
            FROM public.events e
            ${whereClause}
            ORDER BY e.time DESC
            LIMIT ${exportLimit}
        `;

        const result = await pool.query(dataQ, params);
        const rows = result.rows.map(row => ({
            ID: row.id,
            Data: new Date(row.time).toLocaleString('pt-BR'),
            Camera: row.cam_id || '-',
            Nome: row.name || '-',
            Tipo: row.type || '-',
            Acao: row.action || '-',
            Prioridade: row.priority || '-',
            Estado: row.state || '-',
            Operador: row.operator || '-',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Eventos');

        const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const buffer = Buffer.from(data);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_${Date.now()}.xlsx`);
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
    } catch (e) {
        next(e);
    }
});

// --- Endpoint PDF ---
app.get("/api/dispatch/export/pdf", async (req, res, next) => {
    try {
        const exportLimit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const generatedBy = req.query.generatedBy || 'Não identificado';
        const { whereClause, params } = buildDispatchQuery(req.query);

        const dataQ = `
            SELECT e.id, e.time, e.cam_id, e.type, e.action, e.state, e.priority, e.name, e.params
            FROM public.events e
            ${whereClause}
            ORDER BY e.time DESC
            LIMIT ${exportLimit}
        `;

        const result = await pool.query(dataQ, params);
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_${Date.now()}.pdf`);
        doc.pipe(res);

        // Título
        doc.fontSize(14).font('Helvetica-Bold').text('Relatório de Eventos — SecurOS GEA', { align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('grey')
           .text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${result.rows.length} evento(s) · Operador: ${generatedBy}`, { align: 'center' });
        doc.fillColor('black').moveDown(0.5);

        // Helpers de imagem
        const FACEX_BASE = process.env.FACEX_URL || `http://${process.env.IP_SERVER}:21093`;
        const LPR_BASE   = process.env.LPR_URL   || `http://${process.env.IP_SERVER}:8899`;

        const fetchUrl = async (url) => {
            try {
                const resp = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 5000,
                    headers: auth.headers,
                });
                return Buffer.from(resp.data);
            } catch (e) {
                console.error(`[PDF] Erro ao buscar imagem ${url}: ${e.message}`);
                return null;
            }
        };

        const REST_BASE = process.env.VITE_REST_API_URL || `http://${process.env.IP_SERVER}:8888`;

        const fetchFaceImage  = (path) => path ? fetchUrl(`${FACEX_BASE}${path}`) : Promise.resolve(null);
        const fetchLprPlate   = (recognizerId, tid) =>
            recognizerId && tid
                ? fetchUrl(`${LPR_BASE}/api/v1/recognizers/${recognizerId}/image/${tid}`)
                : Promise.resolve(null);
        const fetchCameraFrame = (rawCamId, bestViewTime) => {
            if (!rawCamId || !bestViewTime) return Promise.resolve(null);
            // Converte DD-MM-YYYY HH:mm:ss.SSS → YYYY-MM-DDTHH:mm:ss.SSS
            const [datePart, timePart] = bestViewTime.split(' ');
            const [dd, mm, yyyy] = datePart.split('-');
            const cleanTime = `${yyyy}-${mm}-${dd}T${timePart}`;
            return fetchUrl(`${REST_BASE}/api/v2/cameras/${rawCamId}/image/${cleanTime}`);
        };

        // Layout
        const IMG_SIZE    = 55;
        const ROW_H_IMG   = IMG_SIZE + 20;
        const ROW_H_TXT   = 50;
        const PAGE_BOTTOM = 780;

        const cImg1 = 30;
        const cImg2 = cImg1 + IMG_SIZE + 8;
        const cData = cImg2 + IMG_SIZE + 10;
        const cInfo = 360;

        let y = doc.y + 5;

        // Cabeçalho da tabela
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#444444');
        doc.text('Detectado / Placa', cImg1, y);
        doc.text('Cadastrado / Frame', cImg2, y);
        doc.text('Dados do Evento', cData, y);
        doc.text('Detalhes', cInfo, y);
        y += 14;
        doc.moveTo(30, y).lineTo(565, y).lineWidth(1).strokeColor('#cccccc').stroke();
        doc.strokeColor('black');
        y += 6;

        for (const row of result.rows) {
            // Parse params
            let p = null;
            try { p = typeof row.params === 'string' ? JSON.parse(row.params) : row.params; } catch {}

            const isFaceX = p && p.detectedImage;
            const isLpr   = p && p.tid && p.recognizerId;
            const hasImg  = isFaceX || isLpr;

            const rowHeight = hasImg ? ROW_H_IMG : ROW_H_TXT;

            if (y + rowHeight > PAGE_BOTTOM) {
                doc.addPage();
                y = 40;
            }

            // --- Imagens ---
            if (isFaceX) {
                const [imgDetected, imgDb] = await Promise.all([
                    fetchFaceImage(p.detectedImage),
                    fetchFaceImage(p.dbImage),
                ]);
                if (imgDetected) {
                    doc.image(imgDetected, cImg1, y, { fit: [IMG_SIZE, IMG_SIZE] });
                } else {
                    doc.fontSize(7).fillColor('grey').text('[sem foto]', cImg1, y + IMG_SIZE / 2 - 5);
                }
                if (imgDb) {
                    doc.image(imgDb, cImg2, y, { fit: [IMG_SIZE, IMG_SIZE] });
                } else if (p.similarity) {
                    doc.fontSize(7).fillColor('grey').text('[sem cadastro]', cImg2, y + IMG_SIZE / 2 - 5);
                }
                doc.fillColor('black');
            } else if (isLpr) {
                const [imgPlate, imgFrame] = await Promise.all([
                    fetchLprPlate(p.recognizerId, p.tid),
                    fetchCameraFrame(p.rawCamId, p.bestViewTime),
                ]);

                if (imgPlate) {
                    doc.image(imgPlate, cImg1, y, { fit: [IMG_SIZE, IMG_SIZE] });
                } else {
                    doc.fontSize(7).fillColor('grey').text('[sem placa]', cImg1, y + IMG_SIZE / 2 - 5);
                }

                if (imgFrame) {
                    doc.image(imgFrame, cImg2, y, { fit: [IMG_SIZE, IMG_SIZE] });
                } else {
                    doc.fontSize(7).fillColor('grey').text('[sem frame]', cImg2, y + IMG_SIZE / 2 - 5);
                }

                doc.fillColor('black');
            }

            // --- Textos ---
            const dateStr = new Date(row.time).toLocaleString('pt-BR');
            doc.font('Helvetica').fontSize(8.5).fillColor('black');

            doc.text(`Data:    ${dateStr}`,        cData, y);
            doc.text(`Nome:    ${row.name || '-'}`, cData, y + 11);
            doc.text(`Câmera:  ${row.cam_id || '-'}`, cData, y + 22);
            doc.text(`ID: #${row.id}`,              cData, y + 33);

            if (isFaceX && p.similarity) doc.text(`Lista: ${p.listName || '-'}`, cData, y + 44);
            if (isLpr && p.databaseName)  doc.text(`Lista: ${p.databaseName}`,   cData, y + 44);

            doc.text(`Tipo:       ${row.type || '-'} / ${row.action || '-'}`, cInfo, y);
            doc.text(`Estado:     ${row.state || '-'}`,                        cInfo, y + 11);
            doc.text(`Prioridade: ${row.priority || '-'}`,                     cInfo, y + 22);

            if (isFaceX && p.similarity) {
                doc.font('Helvetica-Bold').fillColor('#1d4ed8')
                   .text(`Similaridade: ${p.similarity}`, cInfo, y + 33);
                doc.font('Helvetica').fillColor('black');
            }
            if (isLpr && p.directionName) {
                doc.text(`Direção: ${p.directionName}`, cInfo, y + 33);
            }

            y += rowHeight;
            doc.moveTo(30, y).lineTo(565, y).lineWidth(0.3).strokeColor('#dddddd').stroke();
            doc.strokeColor('black');
            y += 6;
        }

        doc.end();
    } catch (e) {
        next(e);
    }
});

// 3) Assumir despacho
app.post("/api/dispatch/:id/claim", async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		const { operator } = req.body || {};
		if (!operator) return res.status(400).json({ error: "operator é obrigatório" });

		const r = await pool.query(
			`UPDATE public.events
       SET state='IN_PROGRESS', operator=$1, response_time=$2
       WHERE id=$3 AND state='PENDING'
       RETURNING id`,
			[operator, new Date(), id]
		);

		if (r.rowCount === 0) return res.status(409).json({ error: "Evento não está PENDING ou não existe" });

		await addLog(id, operator, "Despacho assumido (IN_PROGRESS)");
		res.json({ status: "ok" });
	} catch (e) {
		next(e);
	}
});

// 4) Comentários
app.get("/api/dispatch/:id/comments", async (req, res, next) => {
	try {
		const id = Number(req.params.id);

		const r = await pool.query(
			`SELECT panel, comment, date, "user", eventid
       FROM public.comments
       WHERE eventid = $1
       ORDER BY date ASC`,
			[id]
		);

		res.json({ status: "success", data: r.rows });
	} catch (e) {
		next(e);
	}
});

app.post("/api/dispatch/:id/comments", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { panel = "dispatch", comment, user = "system" } = req.body || {};
    if (!comment) return res.status(400).json({ error: "comment é obrigatório" });

    // 1. Insere o comentário
    await pool.query(
      `INSERT INTO public.comments (panel, comment, date, "user", eventid)
       VALUES ($1,$2,$3,$4,$5)`,
      [panel, comment, new Date(), user, id]
    );

    // 2. (NOVO) Atualiza o operador e o último comentário no evento principal
    // Isso garante que quem comentou vira o "dono" ou último a mexer
    await pool.query(
      `UPDATE public.events SET comment=$1, operator=$2 WHERE id=$3`, 
      [comment, user, id]
    );

    await addLog(id, user, `Comentário adicionado`);
    res.status(201).json({ status: "ok" });
  } catch (e) {
    next(e);
  }
});

// 5) Encerrar despacho
app.post("/api/dispatch/:id/resolve", async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		const { operator, comment } = req.body || {};
		if (!operator) return res.status(400).json({ error: "operator é obrigatório" });

		// Seta 'Solucionado'
		await pool.query(`UPDATE public.events SET state='Solucionado', resolution_time=$1 WHERE id=$2`, [new Date(), id]);
		// Log: "Despacho encerrado (Solucionado)"

		if (comment) {
			await pool.query(
				`INSERT INTO public.comments (panel, comment, date, "user", eventid)
         VALUES ($1,$2,$3,$4,$5)`,
				["dispatch", comment, new Date(), operator, id]
			);
			await pool.query(`UPDATE public.events SET comment=$1 WHERE id=$2`, [comment, id]);
		}

		await addLog(id, operator, "Despacho encerrado (RESOLVED)");
		res.json({ status: "ok" });
	} catch (e) {
		next(e);
	}
});

// 6) Cancelar
app.post("/api/dispatch/:id/cancel", async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		const { operator = "system", comment } = req.body || {};

		await pool.query(`UPDATE public.events SET state='Alarme Falso', resolution_time=$1 WHERE id=$2`, [new Date(), id]);

		if (comment) {
			await pool.query(
				`INSERT INTO public.comments (panel, comment, date, "user", eventid)
         VALUES ($1,$2,$3,$4,$5)`,
				["dispatch", comment, new Date(), operator, id]
			);
			await pool.query(`UPDATE public.events SET comment=$1 WHERE id=$2`, [comment, id]);
		}

		await addLog(id, operator, "Despacho cancelado (CANCELED)");
		res.json({ status: "ok" });
	} catch (e) {
		next(e);
	}
});

// 7) Endpoint para Marcadores do Calendário
app.get("/api/dispatch/markers", async (req, res, next) => {
	try {
		const { state, type, action, operator, priority } = req.query;

		// Filtros (Mesma lógica da listagem, mas sem limitar data)
		const where = [];
		const params = [];
		let p = 1;

		// Status e Prioridade (Exatos)
		if (state) {
			where.push(`e."state" = $${p++}`);
			params.push(state);
		}
		if (priority) {
			where.push(`e."priority" = $${p++}`);
			params.push(priority);
		}

		if (type) {
			where.push(`e."type" ILIKE $${p++}`);
			params.push(`%${type}%`);
		}

		if (action) {
			where.push(`e."action" ILIKE $${p++}`);
			params.push(`%${action}%`);
		}

		if (operator) {
			where.push(`e."operator" ILIKE $${p++}`);
			params.push(`%${operator}%`);
		}

		if (priority) {
			where.push(`e."priority" = $${p++}`);
			params.push(priority);
		}

		const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

		// Agrupa por dia e pega a maior prioridade do dia para decidir a cor
		const query = `
      SELECT 
        DATE(e.time) as day, 
        COUNT(*) as count,
        BOOL_OR(e.priority = 'Critico' OR e.priority = 'Alta') as has_critical
      FROM public.events e
      ${whereClause}
      GROUP BY DATE(e.time)
    `;

		const r = await pool.query(query, params);

		// Formata para o Frontend
		const markers = r.rows.map((row) => ({
			date: row.day, // O Postgres já retorna em formato YYYY-MM-DD
			count: row.count,
			isCritical: row.has_critical,
		}));

		res.json({ status: "success", data: markers });
	} catch (e) {
		next(e);
	}
});

app.patch("/api/dispatch/:id/status", async (req, res, next) => {
	try {
		const id = Number(req.params.id);
		const { state, operator, comment } = req.body || {};

		if (!state) return res.status(400).json({ error: "state é obrigatório" });
		if (!operator) return res.status(400).json({ error: "operator é obrigatório" });

		// 1. Atualiza o status no banco
		const r = await pool.query(
			`UPDATE public.events 
       SET state=$1, operator=$2
       WHERE id=$3
       RETURNING id`,
			[state, operator, id]
		);

		if (r.rowCount === 0) return res.status(404).json({ error: "Evento não encontrado" });

		// 2. Se tiver comentário, salva
		if (comment) {
			await pool.query(
				`INSERT INTO public.comments (panel, comment, date, "user", eventid)
         VALUES ($1,$2,$3,$4,$5)`,
				["dispatch", comment, new Date(), operator, id]
			);
		}

		// 3. Registra no Log
		await addLog(id, operator, `Status alterado manualmente para: ${state}`);

		res.json({ status: "ok", state });
	} catch (e) {
		next(e);
	}
});

app.get("/api/dispatch/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    
    const query = `
      SELECT 
        e.id, e.time, e.type, e.action, e.operator, e.state, e.priority,
        e.response_time, e.resolution_time, e.cam_id, e.name, e.incident, e.object_id, e.params
      FROM public.events e
      WHERE e.id = $1
    `;
    
    const r = await pool.query(query, [id]);
    
    if (r.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Evento não encontrado" });
    }

    res.json({ status: "success", data: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

async function processFaceXEvent(req, res, eventType) {
  try {
    const { action, id, params, type } = req.body || {};

    let camId = null;
    let objectId = id;
    let name = "Sem identificação";
    let priority = req.query.priority || "Normal";
    let status = "Novo";
    let time = '';

    // Objeto para guardar os dados ricos
    let faceData = {
        firstName: "",
        lastName: "",
        middleName: "",
        listName: "",
        similarity: "",
        detectedImage: null, // A foto tirada na hora (crop)
        dbImage: null        // A foto do cadastro (se houver match)
    };

    if (params && params.comment) {
      try {
        const parsed = JSON.parse(params.comment);
        
        // 1. Câmera
        if (parsed.cam_id) camId = `${parsed.cam_id}`;
        if (parsed.timestamp) time = `${parsed.timestamp}`;
        
        // 2. Imagem da Detecção (Capturada agora)
        // Pode estar na raiz (detection) ou dentro de um objeto detection (match)
        if (parsed._links?.detection_image) {
            faceData.detectedImage = parsed._links.detection_image;
        } else if (parsed.detection?._links?.detection_image) {
            faceData.detectedImage = parsed.detection._links.detection_image;
        }

        // 3. Dados Específicos de MATCH vs DETECTION
        if (eventType === 'MATCH') {
            priority = req.query.priority || "Alta";
            
            // Imagem do Banco de Dados (Cadastrada)
            if (parsed.matched_person_face_image?._links?.source) {
                faceData.dbImage = parsed.matched_person_face_image._links.source;
            }

            // Dados da Pessoa
            if (parsed.person) {
                faceData.firstName = parsed.person.first_name || "";
                faceData.lastName = parsed.person.last_name || "";
                faceData.middleName = parsed.person.middle_name || "";
            }
            
            // Lista
            if (parsed.list) {
                faceData.listName = parsed.list.name || "";
            }

            // Similaridade (Confiança)
            if (parsed.similarity) {
                faceData.similarity = (parseFloat(parsed.similarity) * 100).toFixed(1) + "%";
            }

            // Nome formatado para a tabela (resumo)
            name = `${faceData.firstName} ${faceData.lastName}`.trim();

        } else {
            name = "Face Detectada";
        }

      } catch (parseErr) {
        console.log("Erro ao ler JSON do FaceX:", parseErr);
      }
    }

    const eventTime = (params && params.time_iso) ? new Date(params.time_iso) : new Date(time);

    const insert = `
      INSERT INTO public.events
      (type, action, time, state, priority, cam_id, object_id, name, params, operator)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      type || "-",
      action || eventType,
      eventTime,
      status,
      priority,
      camId,
      objectId,
      name,
      JSON.stringify(faceData), // Salvamos o objeto estruturado
      "-"
    ];

    const r = await pool.query(insert, values);
    console.log(`FaceX ${eventType}: Evento #${r.rows[0].id} criado.`);
    res.status(200).json({ status: "ok", received_id: r.rows[0].id });

  } catch (e) {
    console.error(`Erro endpoint ${eventType}:`, e);
    res.status(500).json({ error: "Erro interno" });
  }
}

async function processCamEvent(req, res) {
  try {
    const { action, id, params, type, time } = req.body || {};

    // --- MUDANÇA AQUI: Busca o nome real no cache ---
    const realName = cameraNamesCache[id] || `Câmera ${id}`; 
    // Se não achar o nome no cache, ele usa o padrão "Câmera [ID]"

    const eventTime = (params && params.time_iso) 
      ? new Date(params.time_iso) 
      : (time ? new Date(time) : new Date());

    const priority = req.query.priority || "Normal";

    const insert = `
      INSERT INTO public.events
      (type, action, time, state, priority, cam_id, object_id, name, params, operator)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      type || "CAM", action || "STATUS", eventTime, "Novo", priority,
      id, id, 
      realName, // <-- Agora usa o nome real aqui ($8)
      JSON.stringify(params), "-"
    ];

    const r = await pool.query(insert, values);
    res.status(200).json({ status: "ok", received_id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: "Erro interno" });
  }
}

async function processLprEvent(req, res) {
  try {
    const { sourceType, sourceId, action, params } = req.body || {};

    const isMatch = action === 'CAR_LP_FOUND';

    // Câmera: MATCH guarda em params.comment como JSON; DETECTION usa params.camera_id
    let camId = params?.camera_id || sourceId || null;
    if (isMatch && params?.comment) {
      try {
        const parsed = JSON.parse(params.comment);
        if (parsed.cam_id) camId = String(parsed.cam_id);
      } catch {}
    }

    // Nome da câmera via cache (apenas para exibição no lprData)
    const camName = camId ? (cameraNamesCache[camId] || `Câmera ${camId}`) : null;

    // Timestamp
    const eventTime = params?.time_iso ? new Date(params.time_iso) : new Date();

    // Prioridade: blacklist sobe para Alta por padrão (sobreposta pelo query param se enviado)
    let priority = req.query.priority || 'Normal';
    if (isMatch && params?.database_type === 'blacklist' && !req.query.priority) {
      priority = 'Alta';
    }

    const lprData = {
      plate:          params?.number        || null,
      databaseName:   params?.database_name || null,
      databaseType:   params?.database_type || null,
      directionName:  params?.direction_name || null,
      recognizerName: params?.recognizer_name || null,
      templateName:   params?.template_name  || null,
      country:        params?.template_country_name || null,
      tid:            params?.tid            || null,
      recognizerId:   params?.recognizer_id  || null,
      rawCamId:       camId                  || null,
      cameraName:     camName                || null,
      bestViewTime:   params?.best_view_date_time || null,
    };

    const insert = `
      INSERT INTO public.events
      (type, action, time, state, priority, cam_id, object_id, name, params, operator)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      sourceType || 'LPR',
      action     || 'DETECTION',
      eventTime,
      'Novo',
      priority,
      camId,      // ID bruto — usado pelo Live/Playback no modal
      sourceId   || null,
      params?.number || 'Placa não identificada',
      JSON.stringify(lprData),
      '-',
    ];

    const r = await pool.query(insert, values);
    console.log(`LPR ${action}: Evento #${r.rows[0].id} — Placa: ${params?.number} | Câmera: ${camName}`);
    res.status(200).json({ status: 'ok', received_id: r.rows[0].id });
  } catch (e) {
    console.error('Erro endpoint LPR:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// Rotas
app.post("/facex/detection", (req, res) => processFaceXEvent(req, res, 'DETECTION'));
app.post("/facex/match", (req, res) => processFaceXEvent(req, res, 'MATCH'));
app.post("/lpr", processLprEvent);
app.post("/cam", processCamEvent);

// Servir arquivos estáticos do Frontend (pasta dist)
// Também usando path.join(__dirname, 'dist') para que o pkg inclua os assets dentro do executável
// ATENÇÃO: Se quiser que o usuário possa editar o HTML/JS depois, use process.cwd()
// Mas aqui queremos que o site vá "embutido" dentro do EXE, então __dirname está correto para o 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

// Rota "catch-all" para suportar Vue Router (HTML5 History Mode)
// Qualquer requisição que não foi tratada pelas rotas de API acima cairá aqui
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.use((err, req, res, next) => {
	res.status(err.status || 500).json({ error: err.message || "Erro interno" });
});

app.listen(8334, () => console.log("Dispatch API em http://localhost:8334"));
