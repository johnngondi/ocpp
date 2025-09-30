// index.ts
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import configure from "./routers";

// NEW: state + live updates for the dashboard
import * as store from "./store";
import { sseHandler, pushUpsert } from "./sse";
import * as hub from "./ocppHub";

const app = express();
const port = process.env.PORT || 3000;

function onSocketPreError(err: Error) {
  console.error("Socket error before connection established:", err);
}
function onSocketPostError(err: Error) {
  console.error("Socket error after connection established:", err);
}

// --- Mount SSE before your router chain (so 404 in routers doesn't swallow it)
app.get("/events", sseHandler);

// Your existing router setup (serves static files, /api/v1, error pages, etc.)
configure(app);

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
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => {
    for (const p of protocols) {
      if (ACCEPT.has(p.toLowerCase())) return p; // echo the same variant
    }
    return false;
  },
});

// Allow path like /ocpp/CP-01 (use path segment as CP ID)
function getChargePointId(requestUrl?: string) {
  try {
    if (!requestUrl) return null;
    const parts = requestUrl.split("?")[0].split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "ocpp") return decodeURIComponent(parts[1]);
  } catch {}
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
  } catch {
    socket.destroy();
  }
});

// --- Helpers for OCPP-J frames (always echo the client's uniqueId) ---
const sendCallResult = (ws: WebSocket, uniqueId: string, payload: object) => {
  ws.send(JSON.stringify([3, uniqueId, payload]));
};
const sendCallError = (
  ws: WebSocket,
  uniqueId: string,
  code: string,
  description: string,
  details: object = {}
) => {
  ws.send(JSON.stringify([4, uniqueId, code, description, details]));
};

wss.on("connection", (ws, request) => {
  console.info("Negotiated subprotocol:", (ws as any).protocol);
  ws.on("error", onSocketPostError);

  const cpId = getChargePointId(request?.url || undefined) || "UNKNOWN-CP";
  hub.register(cpId, ws);                     // <-- register
  console.log(`WebSocket connection established (${cpId}) with protocol=${(ws as any).protocol}`);

  // Keepalive: ping every 30s; terminate if no pong
  let alive = true;
  ws.on("pong", () => (alive = true));
  const ka = setInterval(() => {
    if (!alive) {
      console.warn(`CP ${cpId} missed pong → terminating`);
      clearInterval(ka);
      try { ws.terminate(); } catch {}
      return;
    }
    alive = false;
    try { ws.ping(); } catch {}
  }, 30_000);

  ws.on("message", (data) => {
    const text = data.toString();
    console.log(`[${cpId}] →`, text);

    let frame: any;
    try {
      frame = JSON.parse(text);
    } catch {
      // No valid uniqueId to echo → close with protocol error (don't fabricate ids)
      ws.close(1002, "Protocol error: invalid JSON");
      return;
    }

    if (!Array.isArray(frame)) {
      ws.close(1002, "Protocol error: invalid frame");
      return;
    }

    const [msgType, uniqueId, action, payload] = frame;

    
    // C) resolve replies to server-initiated calls
    if (msgType === 3 || msgType === 4) {
      if (typeof uniqueId === "string") hub.noteReply(ws, msgType, uniqueId, frame.slice(2));
      return;
    }

    // We only handle client CALLs here: [2, "<id>", "<Action>", {..}]
    if (msgType !== 2 || typeof uniqueId !== "string" || typeof action !== "string") {
      return; // ignore (could also close with FormationViolation)
    }

    switch (action) {
      case "BootNotification": {
        // Persist minimal charger meta + mark online
        const c = store.upsertCharger(cpId, {
          vendor: payload?.chargePointVendor,
          model: payload?.chargePointModel,
          serial: payload?.chargePointSerialNumber || payload?.chargeBoxSerialNumber,
          online: true,
        });
        pushUpsert(c); // notify UI

        // Reply with SAME uniqueId
        sendCallResult(ws, uniqueId, {
          currentTime: new Date().toISOString(),
          interval: 300, // heartbeat interval seconds
          status: "Accepted",
        });
        break;
      }

      case "StatusNotification": {
        const connectorId = Number(payload?.connectorId ?? 0);
        const status = String(payload?.status || "Unknown") as store.ConnectorStatus;
        const errorCode = String(payload?.errorCode || "NoError");

        const updated =
          connectorId === 0
            ? store.updateStationStatus(cpId, status, errorCode)
            : store.updateConnector(cpId, connectorId, status, errorCode);

        pushUpsert(updated);
        sendCallResult(ws, uniqueId, {}); // empty result per spec
        break;
      }

      case "Heartbeat": {
        const c = store.upsertCharger(cpId, { online: true });
        pushUpsert(c);
        sendCallResult(ws, uniqueId, { currentTime: new Date().toISOString() });
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
    hub.unregister(cpId);  
    const c = store.markDisconnected(cpId);
    if (c) pushUpsert(c);
    console.log(`WebSocket closed (${cpId})`);
  });
});
