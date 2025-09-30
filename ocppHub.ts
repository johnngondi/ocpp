import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";

type Pending = Map<string, { action: string; resolve: (v:any)=>void; reject:(e:Error)=>void }>;

const sessions = new Map<string, WebSocket>();
const pendings = new WeakMap<WebSocket, Pending>();

function getPending(ws: WebSocket): Pending {
  let p = pendings.get(ws);
  if (!p) { p = new Map(); pendings.set(ws, p); }
  return p;
}

export function register(cpId: string, ws: WebSocket) {
  sessions.set(cpId, ws);
}
export function unregister(cpId: string) {
  sessions.delete(cpId);
}
export function isOnline(cpId: string) {
  return sessions.has(cpId);
}

// Called by index.ts when a CALLRESULT/CALLERROR arrives
export function noteReply(ws: WebSocket, msgType: number, uid: string, args: any[]) {
  const pending = getPending(ws);
  const p = pending.get(uid);
  if (!p) return false;
  pending.delete(uid);
  if (msgType === 3) p.resolve(args[0]);           // CALLRESULT payload
  else {
    const [code, desc] = args as [string, string];
    p.reject(new Error(`${p.action} → ${code}: ${desc}`));
  }
  return true;
}

// Send a server-initiated CALL and await reply
export async function call(cpId: string, action: string, payload: any, timeoutMs = 15000) {
  const ws = sessions.get(cpId);
  if (!ws || ws.readyState !== ws.OPEN) throw new Error("Charger not connected");

  const uid = randomUUID();
  const frame = [2, uid, action, payload];

  const pending = getPending(ws);
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(uid)) reject(new Error(`Timeout waiting for ${action}`));
    }, timeoutMs);
    pending.set(uid, {
      action,
      resolve: (v:any) => { clearTimeout(timer); resolve(v); },
      reject:  (e:Error) => { clearTimeout(timer); reject(e); },
    });
  });

  ws.send(JSON.stringify(frame));
  return promise;
}
