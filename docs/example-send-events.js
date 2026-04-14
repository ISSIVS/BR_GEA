/**
 * GEA — Exemplo de envio de eventos
 *
 * Envia eventos para o endpoint POST /events do GEA.
 * Compatível com objeto único ou array (lote).
 *
 * Uso:
 *   node example-send-events.js
 */

const http = require("http");

const GEA_HOST = "localhost";
const GEA_PORT = 8336;

function sendEvents(events) {
    const body = JSON.stringify(events);

    const options = {
        hostname: GEA_HOST,
        port: GEA_PORT,
        path: "/events",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                console.log(`[${res.statusCode}] Resposta:`, data);
                resolve({ status: res.statusCode, body: data });
            });
        });

        req.on("error", (err) => {
            console.error("Erro ao enviar evento:", err.message);
            reject(err);
        });

        req.write(body);
        req.end();
    });
}

// ─── Exemplos de eventos ────────────────────────────────────────────────────

const eventoUnico = {
    id: "1898",
    type: "CAM",
    name: "Camera Entrada Principal",
    action: "Camera Offline",
};

/* const loteDeEventos = [
    {
        object_id: "2",
        type: "LPR_CAM",
        action: "CAR_LP_RECOGNIZED",
        name: "LPR Portaria Norte",
        priority: "Média",
        params: {
            plate: "ABC1D23",
        },
    },
    {
        object_id: "3",
        type: "FACE_X_SERVER",
        action: "MATCH",
        name: "Leitor Facial Recepção",
        priority: "Alta",
        params: {
            action: "Face reconhecida",
            person_name: "João Silva",
        },
    },
    {
        object_id: "4",
        type: "HTTP_EVENT_PROXY",
        action: "RECEIVED",
        name: "Sensor Sala de Servidores",
        priority: "Baixa",
        params: {
            action: "Sensor de temperatura acionado",
        },
    },
]; */

// ─── Execução ────────────────────────────────────────────────────────────────

async function main() {
    console.log("=== Enviando evento único ===");
    await sendEvents(eventoUnico);

    console.log("\n=== Enviando lote de eventos ===");
    // await sendEvents(loteDeEventos);
}

main();
