require('dotenv').config();
var express = require("express");
var app = express();
var http = require("http");
var server = http.createServer(app);
var bodyParser = require("body-parser");
var path = require("path");
var io = require("socket.io")(server);
const message = require("./js/messages");
const restapi = require("./js/restapi");
const integrationServer = require("./js/integrationserver");
const logs = require("./js/logs/logs");
const classificationJSON = require("./translations.json");
const cors = require('cors')
const { subscribeToEvents } = require('./register.js');
subscribeToEvents();

const log_base_path = "GEA";
var startDateTime, endDateTime;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "www")));
app.use(cors());

const ip = process.env.SECUROS_SERVER_IP;
const port = process.env.SERVER_PORT;
const integrationPort = process.env.INTEGRATION_PORT;

const restApiUser = process.env.SECUROS_SERVER_IP;
const restApiPass = process.env.SECUROS_SERVER_IP;
const restApiPort = process.env.SECUROS_SERVER_IP;

// ---- START UP SERVER -----
var intServer = new integrationServer.integrationServer(ip, integrationPort);

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
        if (req.body[0]) {
            logs.Write(`Event Received : ${JSON.stringify(req.body[0])}`, "DEBUG", log_base_path);

            const incident = req.body[0].params.action || classifyEvent(req.body[0]);

            req.body[0].object_id = req.body[0].id;
            req.body[0].state = "Novo";
            req.body[0].params = JSON.stringify(req.body[0].params);
            req.body[0].incident = incident;
            logs.Write(`Event Received : ${JSON.stringify(req.body[0].params.comment)}`, "INFO", log_base_path);
            delete req.body[0].id;

            getObject(req.body[0], function (res) {
                if (res) {
                    logs.Write("Object found in SecurOS DB ", "DEBUG", log_base_path);
                    logs.Write("GetObject Result: " + JSON.stringify(res), "DEBUG", log_base_path);
                    logs.Write("NAME: " + JSON.stringify(res.name), "DEBUG", log_base_path);
                    req.body[0].name = res.name;
                    req.body[0].priority = res.params != undefined ? res.params.tp_name : "Baixa";

                    logs.Write("body: " + JSON.stringify(req.body[0]), "DEBUG", log_base_path);

                    // Insert event into the database
                    message.insert("events", req.body[0], function () {
                        // Fetch latest events
                        message.select("events", 10, function (res) {
                            // Emit new event to HTML
                            io.emit("newEvent", res);
                        });
                    });
                } else {
                    console.log("Object not found");
                    logs.Write("Object not found", "ERROR", log_base_path + "_Events_not_found");
                    logs.Write(
                        "object_id:" + req.body[0].object_id + ", type:" + req.body[0].type + ", incident:" + req.body[0].incident,
                        "ERROR",
                        log_base_path + "_Events_not_found"
                    );
                }
            });
        }
    } catch (e) {
        console.log(e);
        logs.Write("ERROR: " + e, "ERROR", log_base_path);
    } finally {
        res.send("ok");
    }
});

//socket io connection
io.on("connection", function (socket) {
    logs.Write(`New Client connection`, "DEBUG", log_base_path);

    socket.on("filter", (json) => {
        try {
            console.log(json);
            startDateTime = json.start;
            endDateTime = json.end;
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
    });

    //Change State
    socket.on("state", (json) => {
        //console.log("state", json);
        logs.Write(`On state: ${json}`, "DEBUG", log_base_path);
        var json_update = Object.assign({}, json);
        delete json_update.obj_id;
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
                        message.select_filter("events", { start: startDateTime, end: endDateTime }, (res) => io.emit("Events", res));
                    });
                    io.emit("comments", response);
                });
            });
        } else {
            message.update(json.id, "events", json_update, function () {
                message.select_filter("events", { start: startDateTime, end: endDateTime }, (res) => io.emit("Events", res));
            });
        }
        message.insert("logs", log, function (e) {
            logs.Write(`message.insert "logs": ${e}`, "DEBUG", log_base_path);
        });
    });
});

// Limit tables (events and comments) data
/* cron.schedule("* * * * *", () => {
    message.limit_database("", (res) => {
        logs.Write( 
            res[0].rowCount + " linhas deletadas da tabela eventos; "+ res[1].rowCount + " linhas deletadas da tabela comments"
        ,"DEBUG", log_base_path);
        if (res[0].rowCount == 0) return;
        message.select_filter("events", { start: moment().startOf("days"), end: moment().endOf("days") }, (res) => io.emit("Events", res), "INFO", log_base_path);
    });
}); */

function getObject(body, callback) {
    intServer.getObject(body, function (res) {
        logs.Write(`intServer.getObject : ${res}`, "DEBUG", log_base_path);
        callback(res);
    });
}

function getCameras(callback) {
    var rest = new restapi.restapi(ip, restApiPort, restApiUser, restApiPass);
    rest.getRequest("api/v1/cameras", function (res) {
        callback(res);
    });
}

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
