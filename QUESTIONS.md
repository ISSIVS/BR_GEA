# QUESTIONS.md — Code Review of BR_GEA (SecurOS Advanced Event Manager)

> Review scope: full repository. Each item below is an **independent question or attention point**. Please answer inline under each question with:
>
> - `STATUS:` one of `BUG`, `INTENDED`, `IMPROVEMENT`, `WONTFIX`, `NEEDS DISCUSSION`
> - `NOTES:` free-form explanation
> - `ACTION:` what you want me to do (refactor, rewrite, leave alone, etc.)
>
> Questions are grouped by layer/concern. Numbering is continuous so you can reference them later.

---

## 0. Project understanding (please confirm / correct)

From reading the code, my understanding of the project is:

- **BR_GEA** is a SecurOS "Gerenciador de Eventos Avançado" (advanced event manager).
- It runs as a Node.js service on Windows (installed via NSSM → `create_service.bat`), listening on `SERVER_PORT` (default 8336).
- It exposes:
  - A static front-end at `/` (the dashboard `www/index.html`).
  - A webhook `POST /events` that receives events from the SecurOS REST API (FaceX, CAM, LPR, HTTP_EVENT_PROXY, etc.), persists them into a PostgreSQL DB `dispatch`, and broadcasts them to connected dashboard clients via socket.io.
  - A socket.io channel where operators filter, view, comment, and change the state of incidents.
- `register.js` is meant to (re)subscribe BR_GEA's `/events` endpoint as a webhook on the SecurOS REST API during install.
- `www/FaceX/` is a secondary front-end used inside the SecurOS Desktop client to render FaceX recognitions (via `ISScustomAPI`).
- `www/FaceX/api/` looks like an abandoned/orphaned middle-API for pulling FaceX data directly; it is never wired into `index.js`.

### Q1. Is the above description of the project correct?
If any part is wrong or incomplete, please correct it — everything below is interpreted against that mental model.

### Q2. Who are the clients of `POST /events`?
Only the SecurOS REST webhook, or also third parties? This decides whether we need auth, rate limiting, CSRF, etc.

### Q3. Who are the clients of the dashboard (`/`)?
- Is the dashboard only opened *inside* the SecurOS Desktop client (via `ISScustomAPI`), or also in standalone browsers over the LAN?
- Is it reachable from outside the operator LAN at all?
- Is there any expectation of multi-tenant / multi-operator concurrent use?

### Q4. What is the FaceX API server (`www/FaceX/api/`) for?
It defines Express routes (`/dayrecognitions`, `/person/:id`, `/recognitions`) and `start()` on port 8989, but nothing ever calls `start()` and it's not required from `index.js`. Is it:
(a) dead code that should be deleted, (b) expected to run as a separate process, or (c) used by something outside this repo?

---

## 1. Security (highest priority)

### Q5. SQL injection in every `messages.js` function — intended or critical bug?
`js/messages.js` builds every query via raw string concatenation of JSON fields that come directly from HTTP body / socket.io payloads — `insert`, `update`, `search`, `searchlike`, `searchlike_order`, `_delete`, `select_filter`. No parameterization, no escaping.

Example (`insert`):
```js
insertQuery = insertQuery + "'" + json[element] + "',";
```

Any attacker who can reach `POST /events` can e.g. post `{ "name": "x'); DROP TABLE events;--" }` and destroy the DB. This is also what makes any apostrophe in a comment crash the query.

Should I migrate the entire DB layer to parameterized queries (`pg`'s native `$1, $2` placeholders)?

### Q6. No authentication / authorization anywhere.
Neither `POST /events` nor the socket.io channel (`filter`, `abonado`, `state`) nor the static dashboard requires any credentials. Anyone able to reach the port can read all events, change states, post fake events, and inject data that then gets rendered into every operator's screen.

Is this intentional because the server is supposed to be reachable only on the SecurOS operator LAN? If not — do you want a simple shared-secret / basic-auth / token / SecurOS-session bridge?

### Q7. `cors()` is installed with no options — wide open.
`app.use(cors())` allows any origin. If the dashboard is only consumed in-process by SecurOS or same-origin, CORS can be removed entirely. Intended?

### Q8. `.env` is committed to the repo (both `/.env` and `dist/.env`) with default credentials.
`DB_USER=postgres`, `DB_PASS=postgres`, `REST_API_USER=admin`, `REST_API_PASS=admin`. It's also in `git log`. Do you want me to:
(a) remove it from the repo, add to `.gitignore`, ship a `.env.example` instead, and rotate the committed credentials, or (b) leave it because it's only used in lab installs?

### Q9. Hardcoded REST API credentials in front-end JS (`main2.js`).
```js
const [username, password] = ["Admin", "123"];
const auth = { Authorization: `Basic ${btoa(username + ":" + password)}` };
```
Then a `fetch` to `http://localhost:8888/api/v1/cameras/...` is made directly from the browser with those credentials baked in. Any operator (or any visitor) can open DevTools and read them. This needs to move server-side. Intended for testing, or is this the production path?

### Q10. XSS via `innerHTML` everywhere (dashboard).
- `www/js/main.js` `buildTable()` concatenates raw event fields (`object_id`, `name`, `incident`, `operator`, `comment`, `params`) into `innerHTML`.
- `www/js/comments.js` injects `comment.user` and `comment.comment` into `innerHTML`.
- `www/js/alertMessage.js` injects `${msg}` into `innerHTML`.
- `www/FaceX/js/facex.js` injects `personName`, `comment`, `camName`, `watchlistName`, and `recognitionImgSrc` into `innerHTML`.

Since event payloads come from external systems (FaceX, HTTP_EVENT_PROXY) and from other operators' free-text comments, any of them can inject `<img onerror>` / `<script>` and run code in every connected dashboard. Do you want me to:
(a) rewrite all row rendering to use `textContent` / DOM APIs (row-by-row) or (b) add a small HTML-escape helper and use it in every interpolation?

### Q11. No body size limits on `bodyParser.json()`.
Default 100KB may be fine, but worth confirming. Should I set a hard cap?

### Q12. No rate limiting, no payload validation on `/events`.
A malicious or buggy client can flood the `/events` endpoint — each event triggers an unbounded INSERT + SELECT + broadcast to all sockets. Do you want rate limiting + schema validation (e.g. `zod`/`joi`)?

### Q13. No Content-Security-Policy / Helmet.
Should I add `helmet` with a reasonable CSP?

### Q14. The `Media_client` / REST API port / server IP are passed over an unauthenticated socket.
The `ISScustomAPI.onSetup` callback hands over the operator identity and media client id to the browser. Is this considered trusted because it runs inside the SecurOS Desktop, or should we re-verify server-side?

---

## 2. Architecture (backend)

### Q15. Global mutable state on the server shared across all clients.
`index.js` keeps `var startDateTime, endDateTime;` at module scope. When **any** client emits `filter`, these globals get overwritten, and later, when **any other** client changes a state, the server re-runs `select_filter` using those shared globals and broadcasts it via `io.emit("Events", ...)` to every client, including clients that were not looking at that date window.

Problems:
1. Multi-operator corruption — operators overwrite each other's filters.
2. On state-update broadcast, clients receive data outside their chosen window, so their UI flips to the last-selected window.
3. If no filter has been emitted yet, both globals are `undefined`, and `select_filter` falls back to today's range regardless of what the client wanted.

Should the filter window be stored **per socket** and the state-update broadcast be either (a) targeted to the emitting socket, (b) a delta-only `newEvent`/`updateEvent` emit, or (c) not broadcast at all and let clients refetch on their own filter?

### Q16. `io.emit("Events", ...)` broadcasts a full list to all clients on every state change.
Same root cause as Q15. Even for the happy path, re-pushing a full filtered table on every edit is O(N × clients) of work per state change. Is this intentional, or should we switch to incremental updates (`updateEvent` with just the delta row)?

### Q17. `io.emit("newEvent", result)` sends the last 10 events, not the new one.
`index.js` → after insert, `message.select("events", 10, ...)` → `io.emit("newEvent", result)`. Client then dedupes by existing `id`. Under load, every inserted event causes every client to receive 10 rows and dedupe them. Intended, or should we emit just the inserted row?

### Q18. `message.message()` fetches the entire target table to compute the next ID.
`SELECT * FROM ${table} ORDER BY id ASC` → reads every row, then takes the last one's `id + 1`. But the schema uses `bigserial` (auto-increment). This is pointless and will crash/OOM at scale. Also it's racy across concurrent inserts.

The good news: this function does not appear to be called from anywhere (`insert`/`update`/`select_filter` are invoked directly from `index.js`). Can I delete `message()` entirely?

### Q19. `limit_database()` is defined but never called.
There's no cron, no scheduler, no interval, no HTTP admin endpoint that invokes it. Also it only references `events` and `comments` — `logs` is mentioned in a ternary (`table == "events" || table == "logs" ? "time" : "date"`) but never added to `tablesToDeleteFrom`. So `logs` grows forever.

Questions:
- Should retention be wired up (e.g. `node-cron` daily cleanup)?
- What retention window? (days? weeks?)
- Should `logs` be included?

### Q20. `pg.js` swallows query errors.
```js
if (err) {
    console.error(err.stack);
    //callback(err);
} else { callback(res); }
```
When a query fails, `callback` is never invoked → every caller (insert, update, select_filter, etc.) hangs forever and the response to the HTTP/socket client never comes. Should I rewrite this as an async wrapper that returns a Promise and propagates errors?

### Q21. Mixed callback / missing error propagation everywhere.
The whole DB layer is callback-based with no error handling. Every `message.X(... callback)` is called with a single argument (`res`) — no error channel. Do you want me to convert `messages.js` and `pg.js` to `async/await` using `pg`'s native promise support, and add proper try/catch to the handlers in `index.js`?

### Q22. Endpoint handlers `GET /` and `POST /securos` are effectively dead code.
`app.use(express.static(path.join(__dirname, "www")))` already serves `index.html` for `/`. The handlers `app.get("/", ... res.sendFile("index.html"))` and `app.post("/securos", ... res.sendFile("index.html"))` call `sendFile` with a **relative path** and no `root` option — in modern Express this throws `TypeError: path must be absolute`. So:
- `GET /` never reaches the handler (static middleware wins).
- `POST /securos` returns a 500.

Should I delete both handlers, or is `POST /securos` supposed to do something real (trigger a login/bootstrap from SecurOS)?

### Q23. `socket.on("abonado")` has broken / unused regex code.
```js
var regx = /^((?!-)\d+)$/g;
var match1 = regx.exec(obj_id);
if (!match1) { var regex = /(\d+)-(\w+)||(\d+)-(\d+)/g; var match = regex.exec(obj_id); }
else match = match1;
```
`match` is declared `var` inside a block and never used afterwards. What was this supposed to do? Can I delete it?

### Q24. `classifyEvent` bypasses translations when `event.action` is truthy.
```js
const incident = event.action || classifyEvent(event);
```
So any event that has an `action` field ends up with the raw action string stored as `incident`, rather than the translated label from `translations.json`. Intended, or a bug?

### Q25. `translations.json` fallback is `null`.
```json
"default": { "comment": null }
```
`classifyEvent` returns `null`, which then gets stringified into the SQL as `'null'` (due to Q5 string concatenation), and the front-end strips the literal string `"null"` via `table.replace(/null/gi, "")`. That regex also deletes **any legitimate "null" substring** from the rendered HTML (including attribute values, text content, even a name containing "null"). Both ends are wrong. How do you want incident fallback handled?

### Q26. `HTTP_EVENT_PROXY.RECEIVED` is mapped to empty string in `translations.json`.
Intentional blank incident label, or a missing translation?

### Q27. `insert()` has an always-true "null guard".
```js
if (json[element] != null || json[element] != "") { ... }
```
This is always true (short-circuit `||`), so empty / null fields are never skipped. Bug?

### Q28. `insert()` / `update()` ordering depends on `Object.keys()` insertion order.
It also assumes the last key is the "final" one to omit the trailing comma. If any empty value is hit by the (broken) guard and skipped, the query would end with `",)"`. Should we normalize this to a column whitelist per table?

### Q29. Race condition on `messages.js` module-level `var nextId`.
Even though the function is dead code (Q18), it writes to a shared module-level variable across concurrent requests. Safe to delete together with `message()`.

### Q30. `pg` Pool is created with `parseInt(process.env.DB_PORT)` with no default.
If the env var is missing, `parseInt(undefined)` → `NaN` → `pg` will error at first query. Should have a default (`5432`) and log which host/port we're connecting to.

### Q31. No graceful shutdown.
SIGINT/SIGTERM are not handled. The `pg.Pool` is never closed. HTTP + socket.io are not drained. Under NSSM stop, in-flight requests can hang and sockets leak. Should I add graceful shutdown?

### Q32. No health check endpoint.
Nothing for NSSM / external monitoring to probe. Add `GET /healthz`?

### Q33. `register.js` never actually runs the subscription.
```js
function subscribeToEvents() { ... }
module.exports = { subscribeToEvents };
```
There is no top-level call to `subscribeToEvents()`, so `node register.js` does nothing. But `create_service.bat` runs it exactly that way during install. Result: the SecurOS webhook subscription is **never actually created/refreshed** by the installer, despite that being its entire purpose. Bug?

### Q34. `register.js` uses the deprecated `request` library.
Should I migrate to `node:http` (the standard approach used in `docs/example-send-events.js`) or to `axios` (already used by the FaceX API)?

### Q35. `register.js` assumes the REST API returns `{ data: [...] }`.
If the subscription list format changes, `json.data.length` crashes. Minor, but should have an optional-chaining fallback.

### Q36. `express` + `socket.io` with `http.createServer(app)` but CORS on socket.io is not configured.
With socket.io v4, cross-origin socket clients are blocked unless `cors` is set on the socket.io options. If the dashboard is served from the same origin as the server, this is fine; if not, it'll fail. Which is the expected deployment?

### Q37. No structured logging.
`logs.Write` writes a custom format to `C:\ProgramData\ISS\logs\<base>.log`. No request IDs, no correlation, no JSON, no log level from env. Should I replace with `pino`/`winston` and configurable output path?

### Q38. `js/logs/config.js` has a bug that disables rotation.
```js
exports.logs_amount = "10";
exports.log_size  = "12400000";
module.exports = { level: "ERROR" };  // <-- this OVERWRITES everything above
```
After this line, `config.logs_amount` and `config.log_size` are `undefined` → `parseInt(undefined)` → `NaN` → rotation check `if (fileSizeInBytes > _log_size)` is always false → logs never rotate. Bug.

### Q39. `js/logs/logs.js` default case logs at ERROR level but for INFO/ERROR/WARN.
The `level: "ERROR"` default case in the switch actually allows writing `INFO`, `ERROR`, `WARN`. Is that intended, or should `ERROR` really mean "only errors"?

### Q40. Log path is hardcoded to `C:\ProgramData\ISS\logs`.
Windows-only and not configurable. OK for the current install, but should I move it to the env file?

### Q41. Log rotation logic is racy and complex.
It mixes `fs.existsSync`, `fs.statSync`, and async `fs.rename` / `fs.unlink` in nested loops. Under concurrent writes it can corrupt numbering. Worth rewriting or replacing with `winston-daily-rotate-file`?

---

## 3. Database schema

### Q42. Everything is `text`.
`object_id`, `state`, `priority`, `operator`, `name`, `type`, `action`, `incident`, `procedure` — all stored as `text`. `state` and `priority` in particular are used as enums in code (`"Novo"`, `"Alta"`, …). Should they become `enum` types or FK lookup tables?

### Q43. Portuguese labels baked into data.
State values ("Novo", "Em Tratamento", "Solucionado", "Falha de Sistema", "Alarme Falso"/"Alarme") and priorities ("Alta", "Média", "Baixa") are stored as the display strings. This kills i18n and makes typos hard to find (note `"Alarme Falso"` is a dropdown `<option value="Alarme Falso">Alarme</option>` — the value and label disagree). Refactor to stable machine values + a translation layer?

### Q44. `public.comments` uses `"user"` as a column name.
`user` is a reserved word in PostgreSQL; every query has to double-quote it (and the code doesn't, relying on the dynamic SQL builder). Rename to `author` / `commented_by`?

### Q45. `time` / `response_time` / `resolution_time` stored as `timestamp without time zone`.
The backend writes local time into them (`getLocalISOString()`), the client filters by converting "BRT" to UTC then back to local, and displays using `toLocaleDateString("pt-br")`. Classic TZ bug surface. Do you want me to migrate to `timestamptz` and store UTC everywhere?

### Q46. No indexes for common filters beyond the ones in `db.sql`.
`db.sql` adds `idx_events_time`, `idx_events_object_id`, `idx_comments_eventid`, `idx_comments_date`, `idx_logs_time`. What about `idx_events_state`, `idx_events_type`, or a composite `(state, time DESC)` for the active-incidents panel? Worth it?

### Q47. No migrations framework.
`db.sql` is a single create-once script run by `create_db.bat`. Any schema change after the first install requires manual SQL. Do you want `node-pg-migrate` or similar?

### Q48. `events` has no FK to `comments` / `logs`.
`comments.eventid` and `logs.incident_id` reference `events.id` but there's no FK constraint. Intended (for soft deletes / retention pruning) or should we add ON DELETE CASCADE?

### Q49. `db.sql` creates `events` and `logs` in the default schema but `comments` in `public.`.
Mild inconsistency — does it matter?

### Q50. `CREATE INDEX CONCURRENTLY` inside a transactional psql script.
`psql < db.sql` runs in a single transaction by default. `CONCURRENTLY` cannot run inside a transaction — this will error on all the index creations. Either drop `CONCURRENTLY` or split the script. Bug?

---

## 4. Frontend (`www/js/main.js`, `main2.js`, `comments.js`, `alertMessage.js`)

### Q51. `main.js` vs `main2.js` — which one is canonical?
They are ~1000 lines each and they diverge: `main2.js` has a `window.addEventListener("click", …)` block that posts to the SecurOS REST `/api/v1/cameras/:id` endpoint and then calls `ISScustomAPI.sendEvent("CAM", "1", "FACE_X_INFO", ...)` for FaceX / MURALHA events — it's the integration with the `www/FaceX/index.html` secondary view.

But `www/index.html` only loads `main.js` (`<script src="js/main.js"></script>`). So **`main2.js` is not loaded by the dashboard** — the FaceX "selected incident → show in FaceX panel" integration is dead. Is that:
(a) an accidental regression (main2.js was supposed to replace main.js), or
(b) main2.js is WIP and not meant to ship yet, or
(c) main.js and main2.js are served to different contexts I haven't found?

### Q52. `buildTable` is the main source of UI bugs.
It has at least the following issues, tell me which to fix:

1. **Duplicate HTML ids**: each row uses `id="id"`, `id="priority"` (twice in the same row), `id="state"`, etc. The document can have hundreds of the same id, which breaks `getElementById`, accessibility, and CSS expectations. Use classes or `data-*` attributes.
2. **`table.replace(/null/gi, "")`**: strips literal "null" from the HTML string — erases the word "null" from any legitimate value (e.g. a name or procedure). Replace with proper null handling before interpolation.
3. **`ready($)` called inside `buildTable`**: each render attaches fresh `$(document).on("dblclick", ".table-row", …)` handlers without removing previous ones. After N renders, a double-click fires N times. Move delegation to a one-time setup.
4. **`ids = $("tr").map(...)`** and `addToTable` dedupe walks the entire DOM — O(n) per inserted event. Not terrible now but not great either.
5. **Fragile per-type transforms**: special cases for `FACE_X_SERVER`, `CAM`, `HTTP_EVENT_PROXY`, `LPR_CAM`, `VCA_EVENT` are mixed into table building. Should be a per-type formatter module.
6. **Mutates the received `json[i]`** (`json[i].priority = "Alta"`, `json[i].name = ...`). If the client re-uses that reference it's corrupted.

Which of these should I fix?

### Q53. `state()` function — broken switch fallthrough.
```js
case "Em Tratamento":
    if (...) {
        json.comment = ...;
        json.response_time = localtimeString;
        break;                    // breaks ONLY if the if is true
    }
case "Solucionado":              // falls through if currentState not in the set
    if (...) { ... }
    break;
```
When `"Em Tratamento"` is clicked but the current state is not in the allowed set, control falls through into the `"Solucionado"` branch. Depending on the current state that may or may not overwrite `resolution_time`. Is this intentional (I doubt it) or a bug?

### Q54. `masiveState` — typo + behavior.
`masiveState` should be `massiveState`. It iterates up to 20 checked rows and fires 20 socket emits in a tight loop; the server then performs 20 updates + 20 full `select_filter` broadcasts to everyone (Q15). Do you want batched state change (single socket event with a list) and a single broadcast?

### Q55. Mixed Portuguese/Spanish identifiers.
`seleccionarTodos`, `masiveState`, `Média_client` (with an accented character), `clic` comments, `Solo se pueden seleccionar hasta 100 checkboxes` (Spanish, while the visible alert is in Portuguese), etc. Code-style cleanup — do you want me to normalize to Portuguese (or English)?

### Q56. `Média_client` uses a non-ASCII variable name.
Valid JS, but any tool that roundtrips through non-UTF-8 (e.g. a Windows terminal, some editors) can break. Rename to `mediaClient`.

### Q57. Global variables leak everywhere.
`newEvents`, `events`, `limitRows`, `tr`, `i`, `txtValue`, `txtValue2`, `txtValue3`, `active`, `mode`, `id_split`, `id` — all declared without `var/let/const` inside functions, becoming globals and clobbering each other. Real bugs? I want to convert the frontend to strict-mode modules, is that OK?

### Q58. Options objects (`options`, `options2`, `options3`, `options4`, `options5`) defined at file top but only some are used.
Dead or intended for future use?

### Q59. Locale mixing.
`buildTable` uses `toLocaleDateString("pt-br", options2)`, but `comments.js` uses `toLocaleDateString("es-CO", options2)` for comment timestamps. Same options object, different locale — intended?

### Q60. Incident-card click handler reads from DOM for business data.
`state()` / `play()` / `live()` read `document.getElementById("card_title").innerHTML` / `card_camera` / `card_id` to build the outgoing payload. Card fields are populated from table DOM in `ready($)`. This creates "render → parse back" cycles and is fragile (e.g. HTML entities, special characters). Should business state live in a JS object and the DOM be purely a view?

### Q61. PDF / CSV export uses hard-coded column indices.
```js
for (var j = 3; j <= 13; j++) ...
```
Any column reorder breaks the export silently. Should I switch to selecting by header name?

### Q62. `filterByIncident()` references `document.getElementById("filterbyincident")`.
There is no `#filterbyincident` element in `www/index.html` (only `filterbyname`, `filterbystate`, `datetimepicker`). This function is dead, OR an element was removed from the HTML. Delete it?

### Q63. `filter()` uses fixed cell indices (0-based 2..10) to match filter fields.
Same fragility as Q61 — any column reorder silently breaks filtering.

### Q64. Comment timestamp in `comments.js` uses an `options2` that was defined in `main.js`.
It only works because both scripts share the global scope, and depends on script load order. Fragile — do you want me to move shared helpers to a module?

### Q65. `alertMessage.js` — `alertMessage.alertMessage(...)` is awkward.
The class is `AlertMessage` and the instance method is also `alertMessage`, so you call it as `alertMessage.alertMessage("msg", "danger")`. Rename to `alertMessage.show("msg", "danger")`?

### Q66. `socket.emit("filter", ..., cb)` ack callback is never invoked.
In `cancelFilter`, the client passes a third argument as an ack, but the server (`socket.on("filter", (json) => ...)`) ignores it. So the cb never fires. Either drop the cb or have the server ack properly.

### Q67. `sockets.js` is 5 lines of dead code.
```js
var socket = io.connect();
var cams;
socket.on('cameras', function(data) { cams = data; showCams() });
```
Nothing emits `cameras`, no `showCams()` exists, and the file isn't loaded by `index.html`. Delete?

### Q68. `datepicker.js` initializes several selectors that do not exist in `index.html`.
`#reservation`, `#reservationtime`, `#daterange-btn`, `#datepicker`, `#datemask`, `#datemask2`, `.my-colorpicker1`, `.timepicker`, iCheck inputs, etc. — none of those exist in the page. Is this the AdminLTE leftover template? Can I strip it to just what `#datetimepicker` needs?

### Q69. `docs/example-send-events.js` hardcodes `localhost:8336`.
Minor — should it read from the env file too?

### Q70. `www/` contains 8 MB of AdminLTE / Bootstrap / Bower components.
`bower_components/`, `plugins/`, `dist/` inside `www/`, multiple jQuery + bootstrap versions. Most of it is unused. Do you want me to run a cleanup pass and delete unused vendor assets?

### Q71. jQuery + Bootstrap 4 + Vue-timepickr + Select2 + Moment + daterangepicker + AdminLTE + iCheck + pdfMake + jsZip — very heavy stack for a table view.
Is the long-term plan to replace this with a modern SPA (Vue / React) or keep the current stack? This changes how aggressively I should refactor.

---

## 5. FaceX subsystem

### Q72. `www/FaceX/index.html` references `ISScustomAPI.subscribe("CAM", "1", "FACE_X_INFO")` — who publishes that event?
From `main2.js` (which isn't currently loaded, Q51), there's a `ISScustomAPI.sendEvent("CAM", "1", "FACE_X_INFO", payload)` on click. So the FaceX panel depends on `main2.js` being the canonical dashboard. Confirms Q51 is a live question.

### Q73. `www/FaceX/js/facex.js` parses untrusted JSON and interpolates it into `innerHTML`.
`JSON.parse(params.params).comment.replace(/:\s*,/g, ': "",')` — the `.replace` is a bandage for malformed JSON coming from FaceX where empty values are written as `: ,`. Do you want a proper normalizer, or is FaceX going to fix its side?

### Q74. `convertUTCDate()` subtracts 10800000 ms (3h) to force "local" time.
Hardcoded BRT offset. Breaks in DST or in any other timezone. Use proper `timestamptz` + `toLocaleString`?

### Q75. `facex.js` clears `recognition-list` on every event instead of prepending.
Line 16: `document.getElementById("recognition-list").innerHTML = "";` then inserts a single recognition. So the panel only ever shows the most recent match, not a list. Is that intentional (single-shot display), or is the loop logic broken?

### Q76. `www/FaceX/api/index.js` exports `start` but nobody calls it.
Confirmed in Q4. If it should run: where does `start()` get called, and on which port?

### Q77. `www/FaceX/api/controllers/controller.js` error handling is wrong.
```js
const payload = await data.getTodayRecognitions();
try { res.status(200); res.json(payload); } catch (err) { res.status(500); ... }
```
`getTodayRecognitions` internally catches its own errors and returns the error object, so the client always gets 200 with an error body. The try/catch only catches errors thrown by `res.json`, which doesn't really happen. Fix?

### Q78. `getDataFromFaceX.js` hardcodes `localhost`, `21093`, `8888`.
Should come from env vars.

### Q79. `getDataFromFaceX.js` fires one `GET /cameras/:id` per match in a loop.
N+1 HTTP calls per request. Batch or cache?

---

## 6. Build / packaging / deployment

### Q80. `package.json` build script references files that no longer exist.
```json
"build": "ncc build index.js -o dist --minify && ... && xcopy IntegrationServer dist\\IntegrationServer /E /I /Y"
```
The `IntegrationServer` directory was deleted in the current working tree (it's in `git status` as `D`) — does the build still need it? The build command will now fail with "cannot find IntegrationServer".

### Q81. `node.exe` (29 MB) committed in the repo.
Together with `nssm.exe`. Intended to ship the runtime bundled inside the git repo, or should they be pulled at install time?

### Q82. `node_modules` was tracked and is now being deleted in the working tree.
`git status` shows a huge block of `D  IntegrationServer/node_modules/axios/...`. Are we mid-cleanup (removing vendored node_modules from git)? `.gitignore` already lists `node_modules`, so any commit of the current state will finalize the removal.

### Q83. `dist/` contains a committed `.env`.
Means every build ships credentials. Change the build to exclude `.env` and make it an operator-supplied file?

### Q84. `.gitignore` is 5 lines and excludes `dist`, but `dist/` is partially tracked.
```
node_modules
daemon
.vscode
dist
GEA
```
Yet `dist/.env`, `dist/register.js`, `dist/node.exe`, `dist/nssm.exe` etc. are in `git status`. They were committed before `.gitignore` started ignoring them. Do you want me to `git rm --cached` them?

### Q85. `create_db.bat` runs `psql` twice with different syntaxes.
```
psql "user=postgres host=localhost port=5432" < db.sql
psql -U postgres -w -d dispatch -f db.sql --password postgres
```
Only one is needed. The second variant also uses `--password postgres` which is not a valid psql flag — the `--password` flag takes no argument, so `postgres` is interpreted as the database name and will fail. Bug.

### Q86. `create_service.bat` paths are hardcoded to `C:\Program Files (x86)\ISS\BR_GEA`.
No parameterization. Fine for a single product install, but what about upgrades / alternate paths / dev machines?

### Q87. `register.js` is copied to `dist/` but the `create_service.bat` calls `node.exe register.js` from the install dir only.
Together with Q33 (never actually calls `subscribeToEvents()`), the install script has never actually registered any webhook on SecurOS. How has this been working so far — is there a manual subscription done separately?

### Q88. No `scripts.start` in `package.json`.
Only `build`. `npm start` doesn't work. Add one for dev?

### Q89. No tests, no lint, no CI.
Should I add `eslint` + `prettier` + a minimum smoke test with a mocked Express + socket.io harness?

### Q90. Dependencies mix of current and deprecated.
- `request` is fully deprecated (used in `register.js`).
- `body-parser` is no longer needed — Express 4.16+ has `express.json()` / `express.urlencoded()` built in.
- `ncc` is listed twice (`@vercel/ncc` ^0.38 and a broken `ncc@^0.3.6`).
- `npm` listed as a dependency — almost certainly a mistake.
- `node-cron`, `node-windows` are installed but never imported.

Do you want me to prune and update?

### Q91. No Dockerfile / reproducible environment.
Fine if Windows-NSSM is the only deployment, but is a Docker image on the roadmap?

---

## 7. Miscellaneous / smaller

### Q92. `getLocalISOString()` is duplicated between `index.js` and `messages.js.select_filter → toLocalISOString`.
Factor out?

### Q93. `index.js` emits `console.log` everywhere alongside `logs.Write`.
Do you want to remove `console.log` in favor of structured logging?

### Q94. On connection, `socket.on("filter")` re-assigns the server globals (Q15) without validating `json.start` / `json.end`.
A malicious client can send arbitrary strings; `new Date(undefined)` returns Invalid Date, which is then caught in `select_filter` and falls back to today. Mild, but should be validated.

### Q95. `socket.on("state", ...)` does not validate the payload.
`json.id` is parsed with `parseInt` in one place but concatenated directly elsewhere. `json.state` is whatever the client sends — could be any string. Need a whitelist?

### Q96. The install flow downloads no SecurOS SDK / API stub.
`ISScustomAPI` is only available when the page runs inside the SecurOS Desktop client. The code wraps most calls in `try/catch`, but in a standalone browser those `try` blocks swallow a ReferenceError silently (`ISScustomAPI is not defined`). That's OK for SecurOS-embedded mode but hides real errors. Should we feature-detect and log a single warning?

### Q97. `Incidents > Alarme Falso` vs `Alarme`.
The `<option value="Alarme Falso">Alarme</option>` value and label disagree. When the user picks "Alarme", the stored state is "Alarme Falso". Also elsewhere in the code, the allowed state list uses "Alarme" (not "Alarme Falso"). Bug?

### Q98. `play()` parses the card's date via manual string splitting.
`const [day, month, year, time] = dateString.split(/[\/\s]/);` assumes a specific locale-formatted string. Locale change breaks it. Use the underlying timestamp from the row model (Q60) instead of the rendered text?

### Q99. `check1()` / `check2()` toggles CSS classes by name.
Using `classList.toggle("clicked")` then reading back `contains("clicked")` — fine, but the icons are the source of truth for the "all selected" state. Move state into a JS variable?

### Q100. `response_time` on priority change.
`priority()` function sends a `state`-style payload that includes `response_time`. The server treats `state` the same for everything and will overwrite `response_time` on a priority change. Is a priority change supposed to set response time?

### Q101. `io.on("connection")`: no error handler on the socket.
Uncaught handler errors bubble up and can kill the socket. Add `socket.on("error", ...)`?

### Q102. `logs.Write(...)` and `console.log(...)` are both used inside `try` blocks whose outer `catch` is empty (`catch (err) {}`).
Any logging failure is silently swallowed. OK?

### Q103. README / CONTRIBUTING.
There's no README or contributor doc. Should I write a small one so the next dev can boot the project without reading every file?

### Q104. License.
`package.json` says `"license": "ISC"`. Is that correct for SecurOS internal code?

### Q105. Version in `package.json` is `2.0.0`.
Is there a real versioning convention? If so, I'd like to bump it on improvements so operators can see "which build is installed."

---

## 8. Broad strategic questions

### Q106. Scope of the refactor — how deep do you want me to go?
Three rough levels:
1. **Minimal**: fix bugs + security holes (SQL injection, XSS, auth, dead code), preserve the current stack, minimal file moves.
2. **Medium**: rewrite the DB layer (parameterized + promise), rewrite the filter/state broadcast model (per-socket), rewrite the frontend rendering to use textContent + a small view model, clean up dead code, add retention + graceful shutdown + health + lint.
3. **Large**: replace the jQuery+Bootstrap+AdminLTE frontend with a modern SPA (Vue/React) and the callback-based backend with a typed (TS) one; keep the socket.io contract.

### Q107. Multi-operator consistency.
Two operators using the dashboard at the same time: when one changes the state of an incident, should the other see it immediately (yes/no), and should the other's filter window be respected (yes/no)? The current implementation answers "immediately, but overwriting your filter" — which is almost certainly wrong. I want to confirm the target behavior before rewriting.

### Q108. Historical data retention.
How long should events/comments/logs be kept? Same for all three, or different windows?

### Q109. Which SecurOS event types must the system support today?
From the code I see: `CAM`, `LPR_CAM`, `FACE_X_SERVER`, `HTTP_EVENT_PROXY`, `MURALHA` (hinted in main2.js), `VCA_EVENT` (as an action). Are there more planned? The translation file and the table-builder special cases need to stay in sync.

### Q110. What operator identity do we trust?
Right now `operator = jsonSettings.operator` comes from `ISScustomAPI.onSetup`, and if it's missing the fallback is `"Usuário Externo"`. Is that fallback desired, or should the server reject state changes from clients with no operator?

---

**Please fill in an answer under each question.** Once you're done, re-prompt me and I'll implement the agreed changes in-repo, grouped into small, reviewable commits in the order you prefer.
