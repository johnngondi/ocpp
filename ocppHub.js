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
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = exports.noteReply = exports.isOnline = exports.unregister = exports.register = void 0;
const node_crypto_1 = require("node:crypto");
const sessions = new Map();
const pendings = new WeakMap();
function getPending(ws) {
    let p = pendings.get(ws);
    if (!p) {
        p = new Map();
        pendings.set(ws, p);
    }
    return p;
}
function register(cpId, ws) {
    sessions.set(cpId, ws);
}
exports.register = register;
function unregister(cpId) {
    sessions.delete(cpId);
}
exports.unregister = unregister;
function isOnline(cpId) {
    return sessions.has(cpId);
}
exports.isOnline = isOnline;
// Called by index.ts when a CALLRESULT/CALLERROR arrives
function noteReply(ws, msgType, uid, args) {
    const pending = getPending(ws);
    const p = pending.get(uid);
    if (!p)
        return false;
    pending.delete(uid);
    if (msgType === 3)
        p.resolve(args[0]); // CALLRESULT payload
    else {
        const [code, desc] = args;
        p.reject(new Error(`${p.action} → ${code}: ${desc}`));
    }
    return true;
}
exports.noteReply = noteReply;
// Send a server-initiated CALL and await reply
function call(cpId, action, payload, timeoutMs = 15000) {
    return __awaiter(this, void 0, void 0, function* () {
        const ws = sessions.get(cpId);
        if (!ws || ws.readyState !== ws.OPEN)
            throw new Error("Charger not connected");
        const uid = (0, node_crypto_1.randomUUID)();
        const frame = [2, uid, action, payload];
        const pending = getPending(ws);
        const promise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pending.delete(uid))
                    reject(new Error(`Timeout waiting for ${action}`));
            }, timeoutMs);
            pending.set(uid, {
                action,
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
        });
        ws.send(JSON.stringify(frame));
        return promise;
    });
}
exports.call = call;
