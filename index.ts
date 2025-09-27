import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import configure from "./routers";

const app = express();
const port = process.env.PORT || 3000;

function onSocketPreError(err: Error) {
  console.error("Socket error before connection established:", err);
}
function onSocketPostError(err: Error) {
  console.error("Socket error after connection established:", err);
}

configure(app);

console.log(`Attempting to run server on port ${port}`);
const s = app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

const ACCEPT = new Set(["ocpp1.6", "ocpp1.6j", "ocpp16", "ocpp16j"]);

/**
 * We’ll accept upgrades only if the client offers the 'ocpp1.6' subprotocol.
 * ws will echo back the chosen subprotocol for us if we provide handleProtocols.
 */
const wss = new WebSocketServer({
  noServer: true, // optionally use '/ocpp' and parse id from request.url
  handleProtocols: (protocols) => {
    for (const p of protocols) {
      if (ACCEPT.has(p.toLowerCase())) return p; // echo same variant
    }
    return false;
  },
});

// Allow path like /ocpp/CP-01
function getChargePointId(requestUrl?: string) {
  try {
    if (!requestUrl) return null;
    // request.url is a path like '/ocpp/CP-01'
    const parts = requestUrl.split("/").filter(Boolean);
    // ['', 'ocpp', 'CP-01'] -> ['ocpp','CP-01']
    if (parts.length >= 2 && parts[0] === "ocpp")
      return decodeURIComponent(parts[1]);
  } catch {}
  return null;
}

// Upgrade: verify the client offered ocpp1.6; if not, destroy socket
s.on("upgrade", (request, socket, head) => {
  socket.on("error", onSocketPreError);

  
  console.log('UPGRADE', request.url);
  console.log('Headers:', request.headers);

  // Verify protocol offer manually (extra safety; handleProtocols also negotiates)
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
});

// --- Helpers for OCPP-J frames ---
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

  console.info('Negotiated subprotocol:', (ws as any).protocol);

  ws.on("error", onSocketPostError);

  const cpId = getChargePointId(request?.url || undefined) || "UNKNOWN-CP";
  console.log(
    `WebSocket connection established (${cpId}) with protocol=${
      (ws as any).protocol
    }`
  );

  // Simple keepalive: ping every 30s; close if no pong
  let alive = true;
  ws.on("pong", () => (alive = true));
  const ka = setInterval(() => {
    if (!alive) {
      console.warn(`CP ${cpId} missed pong → terminating`);
      clearInterval(ka);
      try {
        ws.terminate();
      } catch {}
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {}
  }, 30_000);

  ws.on("message", (data) => {
    const text = data.toString();
    console.log(`[${cpId}] →`, text);

    let frame: any;
    try {
      frame = JSON.parse(text);
    } catch (e) {
      // We don't have the uniqueId if parse failed; spec allows FormationViolation
      // with any id, but safer to just drop or close. Here we close politely:
      sendCallError(
        ws,
        "00000000-0000-4000-8000-000000000000",
        "FormationViolation",
        "Invalid JSON"
      );
      return;
    }

    if (!Array.isArray(frame)) {
      sendCallError(
        ws,
        "00000000-0000-4000-8000-000000000000",
        "FormationViolation",
        "Frame must be an array"
      );
      return;
    }

    const [msgType, uniqueId, action, payload] = frame;

    // We only handle CALLs (2) here; ignoring server-originated CALLs for simplicity
    if (
      msgType !== 2 ||
      typeof uniqueId !== "string" ||
      typeof action !== "string"
    ) {
      // Silently ignore other types or send FormationViolation:
      // sendCallError(ws, uniqueId ?? '0000', 'FormationViolation', 'Expected CALL [2,id,action,payload]');
      return;
    }

    switch (action) {
      case "BootNotification": {
        // Validate required fields if you want (vendor/model)
        // const { chargePointVendor, chargePointModel } = payload || {};
        const result = {
          currentTime: new Date().toISOString(),
          interval: 300,
          status: "Accepted", // or 'Pending'/'Rejected'
        };
        sendCallResult(ws, uniqueId, result);
        break;
      }

      case "Heartbeat": {
        sendCallResult(ws, uniqueId, { currentTime: new Date().toISOString() });
        break;
      }

      case "StatusNotification": {
        sendCallResult(ws, uniqueId, {}); // empty result per spec
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
        // Not implemented → CALLERROR
        sendCallError(
          ws,
          uniqueId,
          "NotImplemented",
          `Action ${action} not supported`
        );
      }
    }
  });


 ws.on('close', (code, reason) => {
    clearInterval(ka);
    console.log(`WebSocket closed (${cpId})`);
    console.log('WS close', code, reason?.toString());
  });

});
