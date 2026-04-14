const http = require("http");
const securos = require("securos");

const GEA_HOST ="localhost";
const GEA_PORT = 8336;

securos.connect(async (core) => {
    core.registerEventHandler("GEA", "1", "EVENT", postToGea);
});

function postToGea(eventData) {
    const event = eventData.params;
    const body = JSON.stringify({
        id: event.id,
        type: event.type,
        name: event.name || "",
        action: event.action,
        time: event.time_iso,
    });

    const req = http.request(
        {
            hostname: GEA_HOST,
            port: GEA_PORT,
            path: "/events",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
        },
        (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                console.log(`[${res.statusCode}] ${data}`);
            });
        }
    );

    req.on("error", (error) => {
        console.error("Erro ao enviar evento:", error.message);
    });

    req.write(body);
    req.end();
}


