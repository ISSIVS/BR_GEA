require('dotenv').config();
const request = require("request");

function subscribeToEvents() {
    const events = [
        {
            type: "CAM",
            action: "VCA_EVENT_SEGER"
        }
    ];

    const ip = process.env.SECUROS_SERVER_IP;
    const port = process.env.SERVER_PORT;

    const restApiUser = process.env.REST_API_USER;
    const restApiPass = process.env.REST_API_PASS;
    const restApiPort = process.env.REST_API_PORT;

    const options = {
        url: `http://${ip}:${restApiPort}/api/v1/events/subscriptions/`,
        auth: {
            username: restApiUser,
            password: restApiPass,
        },
    };

    // GET existing subscriptions
    request.get(options, (err, res, body) => {
        if (err) {
            console.error("GET subscription error:", err);
            return;
        }

        let json;
        try {
            json = JSON.parse(body);
        } catch (parseErr) {
            console.error("Invalid JSON response:", parseErr);
            return;
        }

        if (json.data.length > 0) {
            for (const subscription of json.data) {
                if (subscription.callback === `http://${ip}:${port}/events`) {
                    deleteEvent(subscription.id);
                    console.log("Deleting existing subscription:", subscription.id);
                }
            }
        } else {
            console.log("No subscriptions to delete.");
        }

        createSubscriptions();
    });

    function deleteEvent(id) {
        const optionsDelete = {
            url: `http://${ip}:${restApiPort}/api/v1/events/subscriptions/${id}`,
            auth: {
                username: restApiUser,
                password: restApiPass,
            },
        };

        request.delete(optionsDelete, (err, res, body) => {
            if (err) {
                console.error("DELETE subscription error:", err);
                return;
            }
            console.log("Deleted:", body);
        });
    }

    function createSubscriptions() {
        for (const ev of events) {
            const postOptions = {
                ...options,
                json: {
                    callback: `http://${ip}:${port}/events`,
                    filter: {
                        type: ev.type,
                        action: ev.action,
                    },
                },
            };

            console.log("Creating subscription for:", ev);

            request.post(postOptions, (err, res, body) => {
                if (err) {
                    console.error("POST subscription error:", err);
                    return;
                }
                console.log("Subscription created:", body);
            });
        }
    }
}

module.exports = { subscribeToEvents };
