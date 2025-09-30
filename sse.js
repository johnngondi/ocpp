"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = exports.pushDelete = exports.pushUpsert = exports.sseHandler = void 0;
const clients = new Map();
let seq = 0;
function send(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function sseHandler(req, res) {
    var _a;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (_a = res.flushHeaders) === null || _a === void 0 ? void 0 : _a.call(res);
    const id = ++seq;
    clients.set(id, { id, res });
    res.write(": connected\n\n");
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
        clearInterval(ping);
        clients.delete(id);
        try {
            res.end();
        }
        catch (_a) { }
    });
}
exports.sseHandler = sseHandler;
function pushUpsert(charger) {
    broadcast({ type: "upsert", charger });
}
exports.pushUpsert = pushUpsert;
function pushDelete(id) {
    broadcast({ type: "delete", id });
}
exports.pushDelete = pushDelete;
function broadcast(payload) {
    for (const { res } of clients.values()) {
        try {
            send(res, payload);
        }
        catch (_a) { }
    }
}
exports.broadcast = broadcast;
