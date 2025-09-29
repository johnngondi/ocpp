"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const routers_1 = __importDefault(require("./routers"));
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
function onSocketPreError(err) {
    console.error('Socket error before connection established:', err);
}
function onSocketPostError(err) {
    console.error('Socket error after connection established:', err);
}
(0, routers_1.default)(app);
console.log(`Attempting to run server on port ${port}`);
const s = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
/**
 * We’ll accept upgrades only if the client offers the 'ocpp1.6' subprotocol.
 * ws will echo back the chosen subprotocol for us if we provide handleProtocols.
 */
const wss = new ws_1.WebSocketServer({
    noServer: true,
    handleProtocols: (protocols /* Set<string> */) => {
        // Negotiate subprotocol
        if (protocols.has('ocpp1.6'))
            return 'ocpp1.6';
        // You can allow ocpp2.0.1 etc if you support them
        return false; // reject if ocpp1.6 is not offered
    },
});
// Allow path like /ocpp/CP-01
function getChargePointId(requestUrl) {
    try {
        if (!requestUrl)
            return null;
        // request.url is a path like '/ocpp/CP-01'
        const parts = requestUrl.split('/').filter(Boolean);
        // ['', 'ocpp', 'CP-01'] -> ['ocpp','CP-01']
        if (parts.length >= 2 && parts[0] === 'ocpp')
            return decodeURIComponent(parts[1]);
    }
    catch (_a) { }
    return null;
}
// Upgrade: verify the client offered ocpp1.6; if not, destroy socket
s.on('upgrade', (request, socket, head) => {
    socket.on('error', onSocketPreError);
    // Verify protocol offer manually (extra safety; handleProtocols also negotiates)
    const offered = (request.headers['sec-websocket-protocol'] || '')
        .split(',')
        .map(p => p.trim().toLowerCase());
    if (!offered.includes('ocpp1.6')) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing required subprotocol: ocpp1.6');
        socket.destroy();
        return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
        socket.removeListener('error', onSocketPreError);
        wss.emit('connection', ws, request);
    });
});
// --- Helpers for OCPP-J frames ---
const sendCallResult = (ws, uniqueId, payload) => {
    ws.send(JSON.stringify([3, uniqueId, payload]));
};
const sendCallError = (ws, uniqueId, code, description, details = {}) => {
    ws.send(JSON.stringify([4, uniqueId, code, description, details]));
};
wss.on('connection', (ws, request) => {
    ws.on('error', onSocketPostError);
    const cpId = getChargePointId((request === null || request === void 0 ? void 0 : request.url) || undefined) || 'UNKNOWN-CP';
    console.log(`WebSocket connection established (${cpId}) with protocol=${ws.protocol}`);
    // Simple keepalive: ping every 30s; close if no pong
    let alive = true;
    ws.on('pong', () => (alive = true));
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
    ws.on('message', (data) => {
        const text = data.toString();
        console.log(`[${cpId}] →`, text);
        let frame;
        try {
            frame = JSON.parse(text);
        }
        catch (e) {
            // We don't have the uniqueId if parse failed; spec allows FormationViolation
            // with any id, but safer to just drop or close. Here we close politely:
            sendCallError(ws, '00000000-0000-4000-8000-000000000000', 'FormationViolation', 'Invalid JSON');
            return;
        }
        if (!Array.isArray(frame)) {
            sendCallError(ws, '00000000-0000-4000-8000-000000000000', 'FormationViolation', 'Frame must be an array');
            return;
        }
        const [msgType, uniqueId, action, payload] = frame;
        // We only handle CALLs (2) here; ignoring server-originated CALLs for simplicity
        if (msgType !== 2 || typeof uniqueId !== 'string' || typeof action !== 'string') {
            // Silently ignore other types or send FormationViolation:
            // sendCallError(ws, uniqueId ?? '0000', 'FormationViolation', 'Expected CALL [2,id,action,payload]');
            return;
        }
        switch (action) {
            case 'BootNotification': {
                // Validate required fields if you want (vendor/model)
                // const { chargePointVendor, chargePointModel } = payload || {};
                const result = {
                    currentTime: new Date().toISOString(),
                    interval: 300,
                    status: 'Accepted', // or 'Pending'/'Rejected'
                };
                sendCallResult(ws, uniqueId, result);
                break;
            }
            case 'Heartbeat': {
                sendCallResult(ws, uniqueId, { currentTime: new Date().toISOString() });
                break;
            }
            case 'StatusNotification': {
                sendCallResult(ws, uniqueId, {}); // empty result per spec
                break;
            }
            case 'Authorize': {
                sendCallResult(ws, uniqueId, { idTagInfo: { status: 'Accepted' } });
                break;
            }
            case 'StartTransaction': {
                sendCallResult(ws, uniqueId, {
                    transactionId: Math.floor(Math.random() * 100000),
                    idTagInfo: { status: 'Accepted' },
                });
                break;
            }
            case 'MeterValues': {
                sendCallResult(ws, uniqueId, {});
                break;
            }
            case 'StopTransaction': {
                sendCallResult(ws, uniqueId, { idTagInfo: { status: 'Accepted' } });
                break;
            }
            default: {
                // Not implemented → CALLERROR
                sendCallError(ws, uniqueId, 'NotImplemented', `Action ${action} not supported`);
            }
        }
    });
    ws.on('close', () => {
        clearInterval(ka);
        console.log(`WebSocket closed (${cpId})`);
    });
});
