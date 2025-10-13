"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBulk = exports.sendOffline = exports.sendConnector = exports.sendUpsertCharger = void 0;
const BASE = ((_a = process.env.LARAVEL_BASE_URL) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, "")) || "http://ocpp-dash.laravelkenya.org";
const SECRET = process.env.LARAVEL_TOKEN || "";
function postJson(path, body, method = "POST", attempt = 1) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${BASE}${path}`;
        console.log(url);
        const headers = {
            "content-type": "application/json",
        };
        if (SECRET)
            headers["X-OCPP-Secret"] = SECRET;
        try {
            const res = yield fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                // keepalive not needed on server; timeouts handled by fetch impl
            });
            // 2xx
            if (res.ok) {
                const ct = res.headers.get("content-type") || "";
                return ct.includes("application/json") ? res.json() : res.text();
            }
            // 5xx or specific retryable 4xx
            if ((res.status >= 500 || res.status === 429) && attempt <= 5) {
                const wait = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 1s,2s,4s,8s,10s
                yield new Promise(r => setTimeout(r, wait));
                return postJson(path, body, method, attempt + 1);
            }
            const text = yield res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
        catch (err) {
            if (attempt <= 5) {
                const wait = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                yield new Promise(r => setTimeout(r, wait));
                return postJson(path, body, method, attempt + 1);
            }
            throw err;
        }
    });
}
// ---- Public helpers (shape matches your Laravel controller) ----
function sendUpsertCharger(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        return postJson("/api/ocpp/upsert", payload);
    });
}
exports.sendUpsertCharger = sendUpsertCharger;
function sendConnector(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        return postJson("/api/ocpp/connector", payload);
    });
}
exports.sendConnector = sendConnector;
function sendOffline(serial) {
    return __awaiter(this, void 0, void 0, function* () {
        return postJson(`/api/ocpp/offline/${encodeURIComponent(serial)}`, undefined, "POST");
    });
}
exports.sendOffline = sendOffline;
// Optional: bulk push the whole chargers.json if you want a periodic sync
function sendBulk(chargers) {
    return __awaiter(this, void 0, void 0, function* () {
        return postJson("/api/ocpp/sync", { chargers });
    });
}
exports.sendBulk = sendBulk;
