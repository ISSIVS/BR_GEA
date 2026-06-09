require('dotenv').config();
var express = require("express");
var app = express();
var http = require("http");
var server = http.createServer(app);
var bodyParser = require("body-parser");
var path = require("path");
var io = require("socket.io")(server);
const session = require("express-session");
const message = require("./js/messages");
const logs = require("./js/logs/logs");
const classificationJSON = require("./translations.json");
const cors = require('cors')

const log_base_path = "GEA";
// Map para armazenar filtro por socket: socketId → {start, end}
const socketFilters = new Map();

function getLocalISOString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || "gea_fleury_secret_2024",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));
app.use(express.static(path.join(__dirname, "www"), { index: false }));
app.use(cors());

const ip = process.env.SECUROS_SERVER_IP;
const port = process.env.SERVER_PORT;

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect("/login");
}

// ---- START UP SERVER -----
server.listen(port || 3000, () => {
    console.log(`listening on *: ${port}`);
    logs.Write(`listening on *: ${port}`, "INFO", log_base_path);
});

// LOGIN PAGE
app.get("/login", function (req, res) {
    res.sendFile(path.join(__dirname, "www", "login.html"));
});

// LOGIN ACTION
app.post("/login", function (req, res) {
    var username = (req.body.username || "").trim();
    var password = req.body.password || "";

    if (!username || !password) {
        return res.redirect("/login?error=1");
    }

    var credentials = Buffer.from(username + ":" + password).toString("base64");
    var options = {
        hostname: ip || "localhost",
        port: 8888,
        path: "/api/v1/ws_auth",
        method: "GET",
        headers: { Authorization: "Basic " + credentials }
    };

    var authReq = http.request(options, function (authRes) {
        if (authRes.statusCode !== 401) {
            req.session.user = username;
            req.session.save(function () {
                logs.Write(`Login: ${username}`, "INFO", log_base_path);
                res.redirect("/");
            });
        } else {
            logs.Write(`Login falhou: ${username}`, "WARN", log_base_path);
            res.redirect("/login?error=1");
        }
        authRes.resume();
    });

    authReq.on("error", function (e) {
        logs.Write("Erro na autenticação: " + e.message, "ERROR", log_base_path);
        res.redirect("/login?error=1");
    });

    authReq.end();
});

// AUTO LOGIN (navegador interno do SecurOS via ISScustomAPI)
// O operador vem do ISScustomAPI; só aceitamos de localhost para que um
// cliente externo não possa forjar um operador e burlar a autenticação.
app.post("/securos-login", function (req, res) {
    var remote = req.ip || (req.connection && req.connection.remoteAddress) || "";
    var isLocal = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!isLocal) {
        return res.status(403).json({ ok: false });
    }

    var operator = (req.body.operator || "").trim();
    if (!operator) {
        return res.status(400).json({ ok: false });
    }

    req.session.user = operator;
    req.session.securos = true;
    req.session.save(function () {
        logs.Write(`Login SecurOS: ${operator}`, "INFO", log_base_path);
        res.json({ ok: true });
    });
});

// LOGOUT
app.get("/logout", function (req, res) {
    req.session.destroy(function () {
        res.redirect("/login");
    });
});

// CURRENT USER (for frontend)
app.get("/me", function (req, res) {
    if (req.session && req.session.user) {
        res.json({ user: req.session.user, securos: !!req.session.securos });
    } else {
        res.status(401).json({ user: null });
    }
});

// HOMEPAGE
app.get("/", requireAuth, function (req, res) {
    res.sendFile(path.join(__dirname, "www", "index.html"));
});

app.post("/securos", requireAuth, function (req, res) {
    res.sendFile(path.join(__dirname, "www", "index.html"));
});

//Register Events
app.post("/events", function (req, res) {
    try {
        const events = Array.isArray(req.body) ? req.body : [req.body];
        console.log(events)
        if (!events.length || !events[0]) {
            return res.status(400).json({ error: "Empty or invalid body" });
        }

        events.forEach(function (event) {
            if (!event || typeof event !== "object") return;
            logs.Write(`Event Received : ${JSON.stringify(event)}`, "DEBUG", log_base_path);

            const incident = event.action || classifyEvent(event);

            event.object_id = event.id;
            event.state = "Não tratado";
            event.priority = event.priority || "Baixa";
            event.incident = incident;
            event.time = event.time || getLocalISOString();
            event.params = JSON.stringify(event.params || {});
            delete event.id;

            logs.Write(`Event body: ${JSON.stringify(event)}`, "INFO", log_base_path);

            message.insert("events", event, function () {
                message.select("events", 10, function (result) {
                    io.emit("newEvent", result);
                });
            });
        });

        res.json({ received: events.length });
    } catch (e) {
        console.log(e);
        logs.Write("ERROR: " + e, "ERROR", log_base_path);
        res.status(500).json({ error: "Internal server error" });
    }
});

//socket io connection
io.on("connection", function (socket) {
    logs.Write(`New Client connection`, "DEBUG", log_base_path);

    socket.on("filter", (json) => {
        try {
            console.log(json);
            // Armazenar filtro para este socket
            socketFilters.set(socket.id, { start: json.start, end: json.end });
            message.select_filter("events", json, (res) => socket.emit("Events", res));
        } catch (e) {
            console.log(e);
            logs.Write("ERROR: " + e, "ERROR", log_base_path);
        }
    });

    socket.on("abonado", (id, obj_id) => {
        logs.Write(`on abonado obj_id: ${obj_id} id: ${obj_id}`, "DEBUG", log_base_path);
        message.searchlike_order("comments", "eventid", id, "date", function (response) {
            logs.Write(`comments: ${response}`, "DEBUG", log_base_path);
            socket.emit("comments", response);
        });
        //capturar digitos sin caracter '-'
        var regx = /^((?!-)\d+)$/g;
        var match1 = regx.exec(obj_id);
        if (!match1) {
            var regex = /(\d+)-(\w+)||(\d+)-(\d+)/g;
            var match = regex.exec(obj_id);
        } else match = match1;

        //console.log("match",match)
    });

    socket.on("disconnect", () => {
        logs.Write(`user disconnected`, "DEBUG", log_base_path);
        // Remover filtro quando socket desconectar
        socketFilters.delete(socket.id);
    });

    //Save Checklist only (no state change)
    socket.on("procedure", (json) => {
        if (!json.id || !json.procedure) return;
        message.update(json.id, "events", { id: json.id, procedure: json.procedure }, function () {
            logs.Write(`procedure saved for event ${json.id}`, "DEBUG", log_base_path);
            // Propaga a atualização para todos os clientes em tempo real
            socketFilters.forEach((filter, socketId) => {
                message.select_filter("events", filter, (res) => io.to(socketId).emit("Events", res));
            });
        });
    });

    //Change State
    socket.on("state", (json) => {
        //console.log("state", json);
        logs.Write(`On state: ${json}`, "DEBUG", log_base_path);
        var json_update = Object.assign({}, json);
        delete json_update.obj_id;
        delete json_update.comment;
        var log = {
            incident_id: parseInt(json.id),
            time: json.resolution_time,
            operator: json.operator,
            event: json.state,
        };
        if (json.comment) {
            var comment_json = {
                panel: json.obj_id,
                comment: json.comment,
                date: json.response_time || json.resolution_time,
                user: json.operator,
                eventid: json.id,
            };
            logs.Write(`On state comment_json: ${comment_json}`, "DEBUG", log_base_path);
            message.insert("comments", comment_json, function (e) {
                message.searchlike_order("comments", "eventid", json.id, "date", function (response) {
                    message.update(json.id, "events", json_update, function () {
                        // Emitir para o socket que fez a mudança
                        const filter = socketFilters.get(socket.id);
                        if (filter) {
                            message.select_filter("events", filter, (res) => socket.emit("Events", res));
                        }
                        // Emitir para todos os outros sockets com filtros ativos
                        socketFilters.forEach((filter, socketId) => {
                            if (socketId !== socket.id) {
                                message.select_filter("events", filter, (res) => io.to(socketId).emit("Events", res));
                            }
                        });
                    });
                    io.emit("comments", response);
                });
            });
        } else {
            message.update(json.id, "events", json_update, function () {
                // Emitir para o socket que fez a mudança
                const filter = socketFilters.get(socket.id);
                if (filter) {
                    message.select_filter("events", filter, (res) => socket.emit("Events", res));
                }
                // Emitir para todos os outros sockets com filtros ativos
                socketFilters.forEach((filter, socketId) => {
                    if (socketId !== socket.id) {
                        message.select_filter("events", filter, (res) => io.to(socketId).emit("Events", res));
                    }
                });
            });
        }
        message.insert("logs", log, function (e) {
            logs.Write(`message.insert "logs": ${e}`, "DEBUG", log_base_path);
        });
    });

    // Comentário avulso do operador (separado da mudança de status)
    socket.on("comment", (json) => {
        logs.Write(`On comment: ${json}`, "DEBUG", log_base_path);
        if (!json.comment) return;
        var comment_json = {
            panel: json.obj_id,
            comment: json.comment,
            date: json.date,
            user: json.operator,
            eventid: json.id,
        };
        message.insert("comments", comment_json, function (e) {
            message.searchlike_order("comments", "eventid", json.id, "date", function (response) {
                io.emit("comments", response);
            });
        });
    });
});

function classifyEvent(e) {
    const type = e.type || "default";
    const action = e.action || "default";

    if (classificationJSON[type] && classificationJSON[type][action]) {
        return classificationJSON[type][action];
    } else if (classificationJSON[type] && classificationJSON[type]["default"]) {
        return classificationJSON[type]["default"];
    } else {
        return classificationJSON["default"]["comment"];
    }
}
