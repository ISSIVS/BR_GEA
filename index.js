require('dotenv').config();
var express = require("express");
var app = express();
var http = require("http");
var server = http.createServer(app);
var bodyParser = require("body-parser");
var path = require("path");
var io = require("socket.io")(server);
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
app.use(express.static(path.join(__dirname, "www")));
app.use(cors());

const ip = process.env.SECUROS_SERVER_IP;
const port = process.env.SERVER_PORT;

// ---- START UP SERVER -----
server.listen(port || 3000, () => {
    console.log(`listening on *: ${port}`);
    logs.Write(`listening on *: ${port}`, "INFO", log_base_path);
});

// HOMEPAGE
app.get("/", function (req, res) {
    res.sendFile("index.html");
});

app.post("/securos", function (req, res) {
    res.sendFile("index.html");
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
            event.state = "Novo";
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
