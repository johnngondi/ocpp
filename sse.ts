import type { Request, Response } from "express";
import { Charger } from "./store";

type Client = { id: number; res: Response };
const clients = new Map<number, Client>();
let seq = 0;

function send(res: Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function sseHandler(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const id = ++seq;
  clients.set(id, { id, res });

  res.write(": connected\n\n");
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);

  req.on("close", () => {
    clearInterval(ping);
    clients.delete(id);
    try { res.end(); } catch {}
  });
}

export function pushUpsert(charger: Charger) {
  broadcast({ type: "upsert", charger });
}
export function pushDelete(id: string) {
  broadcast({ type: "delete", id });
}
export function broadcast(payload: unknown) {
  for (const { res } of clients.values()) {
    try { send(res, payload); } catch {}
  }
}
