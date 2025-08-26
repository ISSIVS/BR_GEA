const http = require("http");
const fs = require("fs"); 
const request = require("request");
const config = require("./config");

const baseUrl = `http://${config.ip}:${config.restapi_port}`;
const callbackUrl = `http://${config.ip}:${config.serverPort}/events`;

const events = [
  { type: "CAM" },
  { type: "FACE_X_SERVER", action: "MATCH" },
  { type: "HTTP_EVENT_PROXY" },
  { type: "LPR_CAM", action: "CAR_LP_RECOGNIZED" },
];

function safeParseJSON(text) {
  if (!text || typeof text !== "string") return null;
  try { return JSON.parse(text); } catch { return null; }
}

function getSubscriptions(cb) {
  const opts = {
    url: `${baseUrl}/api/v1/events/subscriptions/`,
    auth: { username: config.restapi_user, password: config.restapi_pass },
    timeout: 10000,
  };
  request.get(opts, (err, res, body) => {
    if (err) return cb(err);
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return cb(new Error(`GET subscriptions failed: ${res?.statusCode} ${body || ""}`));
    }
    const json = safeParseJSON(body);
    if (!json || !Array.isArray(json.data)) {
      return cb(new Error(`Unexpected response (not JSON with .data): ${body || "<empty>"}`));
    }
    cb(null, json.data);
  });
}

function deleteSubscription(id, cb) {
  const opts = {
    url: `${baseUrl}/api/v1/events/subscriptions/${id}`,
    auth: { username: config.restapi_user, password: config.restapi_pass },
    timeout: 10000,
  };
  request.delete(opts, (err, res, body) => {
    if (err) return cb(err);
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return cb(new Error(`DELETE ${id} failed: ${res?.statusCode} ${body || ""}`));
    }
    cb(null, true);
  });
}

function createSubscriptionFor(filter, cb) {
  const opts = {
    url: `${baseUrl}/api/v1/events/subscriptions/`,
    auth: { username: config.restapi_user, password: config.restapi_pass },
    json: { callback: callbackUrl, filter }, 
    timeout: 10000,
  };
  request.post(opts, (err, res, body) => {
    if (err) return cb(err);
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return cb(new Error(`POST failed: ${res?.statusCode} ${typeof body === "string" ? body : JSON.stringify(body)}`));
    }
    cb(null, body);
  });
}

// Orchestrate:
getSubscriptions((err, list) => {
  if (err) {
    console.error(err.message);
    return;
  }

  const mine = list.filter(s => s.callback === callbackUrl);
  if (mine.length === 0) {
    console.log("Nothing to delete");
    afterDeletes();
    return;
  }

  let pending = mine.length;
  mine.forEach(s => {
    console.log("Deleting…", s.id);
    deleteSubscription(s.id, (derr) => {
      if (derr) console.error(`Delete ${s.id} error:`, derr.message);
      if (--pending === 0) afterDeletes();
    });
  });

  function afterDeletes() {
    (function next(i = 0) {
      if (i >= events.length) {
        console.log("All subscriptions created.");
        return;
      }
      const filter = { type: events[i].type };
      if (events[i].action) filter.action = events[i].action;

      console.log("Creating subscription…", filter);
      createSubscriptionFor(filter, (cerr, resp) => {
        if (cerr) {
          console.error("Create failed:", cerr.message);
        } else {
          console.log("Created:", resp);
        }
        next(i + 1);
      });
    })();
  }
});
