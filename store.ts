import fs from "node:fs";
import path from "node:path";

export type ConnectorStatus =
  | "Available" | "Preparing" | "Charging" | "SuspendedEVSE" | "SuspendedEV"
  | "Finishing" | "Reserved" | "Unavailable" | "Faulted" | "Unknown";

export interface Connector {
  id: number;
  status: ConnectorStatus;
  errorCode?: string;
  updatedAt: string;
}

export interface Charger {
  id: string;
  vendor?: string;
  model?: string;
  serial?: string;
  online: boolean;
  lastSeen: string;
  heartbeatInterval?: number;
  stationStatus?: ConnectorStatus;   // connectorId 0
  stationErrorCode?: string;
  connectors: Connector[];
}

interface StoreShape { chargers: Charger[]; }

const FILE = path.resolve(process.cwd(), "chargers.json");

function readFile(): StoreShape {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { chargers: [] }; }
}
function writeFile(data: StoreShape) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}



let state: StoreShape = readFile();
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(){ if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => writeFile(state), 100); }

export function all() { return state.chargers; }

export function upsertCharger(id: string, patch: Partial<Charger>): Charger {
  const now = new Date().toISOString();
  let c = state.chargers.find(x => x.id === id);
  if (!c) { c = { id, online: true, lastSeen: now, connectors: [] }; state.chargers.push(c); }
  Object.assign(c, patch);
  c.lastSeen = now;
  scheduleSave();
  return c;
}

export function updateStationStatus(id: string, status: ConnectorStatus, errorCode?: string): Charger {
  const err = errorCode && errorCode !== "NoError" ? errorCode : undefined;
  const c = upsertCharger(id, { online: true, stationStatus: status, stationErrorCode: err });
  scheduleSave();
  return c;
}

export function updateConnector(id: string, connectorId: number, status: ConnectorStatus, errorCode?: string): Charger {
  const c = upsertCharger(id, { online: true });
  const now = new Date().toISOString();
  const err = errorCode && errorCode !== "NoError" ? errorCode : undefined;
  const k = c.connectors.find(x => x.id === connectorId);
  if (k) { k.status = status; k.errorCode = err; k.updatedAt = now; }
  else { c.connectors.push({ id: connectorId, status, errorCode: err, updatedAt: now }); }
  scheduleSave();
  return c;
}

export function markDisconnected(id: string) {
  const c = state.chargers.find(x => x.id === id);
  if (!c) return null;
  c.online = false;
  c.lastSeen = new Date().toISOString();
  scheduleSave();
  return c;
}

export function removeCharger(id: string) {
  const before = state.chargers.length;
  state.chargers = state.chargers.filter(x => x.id !== id);
  scheduleSave();
  return state.chargers.length !== before;
}

// store.ts
export function getById(id: string) {
  return state.chargers.find(x => x.id === id) || null;
}
