"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// index.ts
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const routers_1 = __importDefault(require("./routers"));
const notifier = __importStar(require("./notifier"));
// NEW: state + live updates for the dashboard
const store = __importStar(require("./store"));
const sse_1 = require("./sse");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
function onSocketPreError(err) {
    console.error("Socket error before connection established:", err);
}
function onSocketPostError(err) {
    console.error("Socket error after connection established:", err);
}
// --- Mount SSE before your router chain (so 404 in routers doesn't swallow it)
app.get("/events", sse_1.sseHandler);
// Your existing router setup (serves static files, /api/v1, error pages, etc.)
(0, routers_1.default)(app);
console.log(`Attempting to run server on port ${port}`);
const s = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
// Subprotocols we'll accept
const ACCEPT = new Set(["ocpp1.6", "ocpp1.6j", "ocpp16", "ocpp16j"]);
/**
 * WebSocket server for OCPP-J (noServer so we control the HTTP upgrade).
 * `handleProtocols` will pick a valid OCPP subprotocol and echo it back.
 */
const wss = new ws_1.WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
        for (const p of protocols) {
            if (ACCEPT.has(p.toLowerCase()))
                return p; // echo the same variant
        }
        return false;
    },
});
// Allow path like /ocpp/CP-01 (use path segment as CP ID)
function getChargePointId(requestUrl) {
    try {
        if (!requestUrl)
            return null;
        const parts = requestUrl.split("?")[0].split("/").filter(Boolean);
        if (parts.length >= 2 && parts[0] === "ocpp")
            return decodeURIComponent(parts[1]);
    }
    catch (_a) { }
    return null;
}
// Only upgrade if client offered an OCPP subprotocol
s.on("upgrade", (request, socket, head) => {
    socket.on("error", onSocketPreError);
    try {
        const path = request.url || "";
        if (!path.startsWith("/ocpp")) {
            socket.destroy();
            return;
        }
        const offered = String(request.headers["sec-websocket-protocol"] || "")
            .split(",")
            .map((s) => s.trim().toLowerCase());
        if (!offered.some((p) => ACCEPT.has(p))) {
            socket.write("HTTP/1.1 400 Bad Request\r\n\r\nMissing OCPP subprotocol");
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            socket.removeListener("error", onSocketPreError);
            wss.emit("connection", ws, request);
        });
    }
    catch (_a) {
        socket.destroy();
    }
});
// --- Helpers for OCPP-J frames (always echo the client's uniqueId) ---
const sendCallResult = (ws, uniqueId, payload) => {
    ws.send(JSON.stringify([3, uniqueId, payload]));
};
const sendCallError = (ws, uniqueId, code, description, details = {}) => {
    ws.send(JSON.stringify([4, uniqueId, code, description, details]));
};
wss.on("connection", (ws, request) => {
    console.info("Negotiated subprotocol:", ws.protocol);
    ws.on("error", onSocketPostError);
    const cpId = getChargePointId((request === null || request === void 0 ? void 0 : request.url) || undefined) || "UNKNOWN-CP";
    console.log(`WebSocket connection established (${cpId}) with protocol=${ws.protocol}`);
    // Keepalive: ping every 30s; terminate if no pong
    let alive = true;
    ws.on("pong", () => (alive = true));
    const ka = setInterval(() => {
        if (!alive) {
            console.warn(`CP ${cpId} missed pong → terminating`);
            clearInterval(ka);
            try {
                ws.terminate();
            }
            catch (_a) { }
            return;
        }
        alive = false;
        try {
            ws.ping();
        }
        catch (_b) { }
    }, 30000);
    ws.on("message", (data) => {
        var _a, _b;
        const text = data.toString();
        console.log(`[${cpId}] →`, text);
        let frame;
        try {
            frame = JSON.parse(text);
        }
        catch (_c) {
            // No valid uniqueId to echo → close with protocol error (don't fabricate ids)
            ws.close(1002, "Protocol error: invalid JSON");
            return;
        }
        if (!Array.isArray(frame)) {
            ws.close(1002, "Protocol error: invalid frame");
            return;
        }
        const [msgType, uniqueId, action, payload] = frame;
        // We only handle client CALLs here: [2, "<id>", "<Action>", {..}]
        if (msgType !== 2 ||
            typeof uniqueId !== "string" ||
            typeof action !== "string") {
            return; // ignore (could also close with FormationViolation)
        }
        switch (action) {
            case "BootNotification": {
                // Persist minimal charger meta + mark online
                const serial = (payload === null || payload === void 0 ? void 0 : payload.chargePointSerialNumber) ||
                    (payload === null || payload === void 0 ? void 0 : payload.chargeBoxSerialNumber) ||
                    "";
                const vendor = payload === null || payload === void 0 ? void 0 : payload.chargePointVendor;
                const model = payload === null || payload === void 0 ? void 0 : payload.chargePointModel;
                const c = store.upsertCharger(cpId, {
                    vendor,
                    model,
                    serial,
                    online: true,
                });
                (0, sse_1.pushUpsert)(c); // notify UI
                if (serial) {
                    notifier
                        .sendUpsertCharger({
                        serial,
                        vendor,
                        model,
                        online: true,
                        lastSeen: new Date().toISOString(),
                        // no stationStatus here; that will come from connectorId=0 StatusNotification
                    })
                        .catch((err) => console.error(`[notify] upsert boot failed for ${serial}:`, err.message));
                }
                else {
                    console.warn(`[notify] Boot with no serial for cpId=${cpId}; skipping Laravel upsert`);
                }
                // Reply with SAME uniqueId
                sendCallResult(ws, uniqueId, {
                    currentTime: new Date().toISOString(),
                    interval: 300,
                    status: "Accepted",
                });
                break;
            }
            case "StatusNotification": {
                const connectorId = Number((_a = payload === null || payload === void 0 ? void 0 : payload.connectorId) !== null && _a !== void 0 ? _a : 0);
                const status = String((payload === null || payload === void 0 ? void 0 : payload.status) || "Unknown");
                const errorCode = String((payload === null || payload === void 0 ? void 0 : payload.errorCode) || "NoError");
                const updated = connectorId === 0
                    ? store.updateStationStatus(cpId, status, errorCode)
                    : store.updateConnector(cpId, connectorId, status, errorCode);
                (0, sse_1.pushUpsert)(updated);
                sendCallResult(ws, uniqueId, {});
                // Notify Laravel
                const cp = store.getById(cpId);
                const serial = cp === null || cp === void 0 ? void 0 : cp.serial;
                const lastSeen = new Date().toISOString();
                if (!serial) {
                    console.warn(`[notify] StatusNotification but serial missing for cpId=${cpId}`);
                    break;
                }
                if (connectorId == 0) {
                    // station-level (maps to ChargerStatus tri-state in Laravel)
                    // Only send the three states your Laravel enum supports
                    let stationStatus;
                    if (status == "Available")
                        stationStatus = "Available";
                    else if (status == "Faulted")
                        stationStatus = "Faulted";
                    else
                        stationStatus = "Unavailable";
                    notifier
                        .sendUpsertCharger({
                        serial,
                        online: true,
                        lastSeen,
                        stationStatus,
                    })
                        .catch((err) => console.error(`[notify] station upsert failed for ${serial}:`, err.message));
                }
                else {
                    // per-connector update
                    notifier
                        .sendConnector({
                        serial,
                        connectorId,
                        status,
                        errorCode: errorCode === "NoError" ? undefined : errorCode,
                        online: true,
                        lastSeen,
                    })
                        .catch((err) => console.error(`[notify] connector upsert failed for ${serial}#${connectorId}:`, err.message));
                }
                break;
            }
            case "Heartbeat": {
                const c = store.upsertCharger(cpId, { online: true });
                (0, sse_1.pushUpsert)(c);
                sendCallResult(ws, uniqueId, { currentTime: new Date().toISOString() });
                // Notify Laravel (only if we know the serial)
                const serial = (_b = store.getById(cpId)) === null || _b === void 0 ? void 0 : _b.serial;
                if (serial) {
                    notifier
                        .sendUpsertCharger({
                        serial,
                        online: true,
                        lastSeen: new Date().toISOString(),
                    })
                        .catch((err) => console.error(`[notify] heartbeat upsert failed for ${serial}:`, err.message));
                }
                break;
            }
            case "Authorize": {
                sendCallResult(ws, uniqueId, { idTagInfo: { status: "Accepted" } });
                break;
            }
            case "StartTransaction": {
                sendCallResult(ws, uniqueId, {
                    transactionId: Math.floor(Math.random() * 100000),
                    idTagInfo: { status: "Accepted" },
                });
                break;
            }
            case "MeterValues": {
                sendCallResult(ws, uniqueId, {});
                break;
            }
            case "StopTransaction": {
                sendCallResult(ws, uniqueId, { idTagInfo: { status: "Accepted" } });
                break;
            }
            default: {
                // Not implemented → CALLERROR (with SAME uniqueId)
                sendCallError(ws, uniqueId, "NotImplemented", `Action ${action} not supported`);
            }
        }
    });
    ws.on("close", () => {
        clearInterval(ka);
        const c = store.markDisconnected(cpId);
        if (c) {
            (0, sse_1.pushUpsert)(c);
            if (c.serial) {
                notifier.sendOffline(c.serial)
                    .catch(err => console.error(`[notify] offline failed for ${c.serial}:`, err.message));
            }
            else {
                console.warn(`[notify] offline: no serial for cpId=${cpId}`);
            }
        }
        console.log(`WebSocket closed (${cpId})`);
    });
});
