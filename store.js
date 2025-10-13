"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getById = exports.removeCharger = exports.markDisconnected = exports.updateConnector = exports.updateStationStatus = exports.upsertCharger = exports.all = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const FILE = node_path_1.default.resolve(process.cwd(), "chargers.json");
function readFile() {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(FILE, "utf8"));
    }
    catch (_a) {
        return { chargers: [] };
    }
}
function writeFile(data) {
    node_fs_1.default.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}
let state = readFile();
let saveTimer = null;
function scheduleSave() { if (saveTimer)
    clearTimeout(saveTimer); saveTimer = setTimeout(() => writeFile(state), 100); }
function all() { return state.chargers; }
exports.all = all;
function upsertCharger(id, patch) {
    const now = new Date().toISOString();
    let c = state.chargers.find(x => x.id === id);
    if (!c) {
        c = { id, online: true, lastSeen: now, connectors: [] };
        state.chargers.push(c);
    }
    Object.assign(c, patch);
    c.lastSeen = now;
    scheduleSave();
    return c;
}
exports.upsertCharger = upsertCharger;
function updateStationStatus(id, status, errorCode) {
    const err = errorCode && errorCode !== "NoError" ? errorCode : undefined;
    const c = upsertCharger(id, { online: true, stationStatus: status, stationErrorCode: err });
    scheduleSave();
    return c;
}
exports.updateStationStatus = updateStationStatus;
function updateConnector(id, connectorId, status, errorCode) {
    const c = upsertCharger(id, { online: true });
    const now = new Date().toISOString();
    const err = errorCode && errorCode !== "NoError" ? errorCode : undefined;
    const k = c.connectors.find(x => x.id === connectorId);
    if (k) {
        k.status = status;
        k.errorCode = err;
        k.updatedAt = now;
    }
    else {
        c.connectors.push({ id: connectorId, status, errorCode: err, updatedAt: now });
    }
    scheduleSave();
    return c;
}
exports.updateConnector = updateConnector;
function markDisconnected(id) {
    const c = state.chargers.find(x => x.id === id);
    if (!c)
        return null;
    c.online = false;
    c.lastSeen = new Date().toISOString();
    scheduleSave();
    return c;
}
exports.markDisconnected = markDisconnected;
function removeCharger(id) {
    const before = state.chargers.length;
    state.chargers = state.chargers.filter(x => x.id !== id);
    scheduleSave();
    return state.chargers.length !== before;
}
exports.removeCharger = removeCharger;
// store.ts
function getById(id) {
    return state.chargers.find(x => x.id === id) || null;
}
exports.getById = getById;
