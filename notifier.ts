type Json = Record<string, any>;

const BASE = process.env.LARAVEL_BASE_URL?.replace(/\/+$/, "") || "http://ocpp-dash.laravelkenya.org";
const SECRET = process.env.LARAVEL_TOKEN || "";

async function postJson(path: string, body?: Json, method = "POST", attempt = 1): Promise<any> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (SECRET) headers["X-OCPP-Secret"] = SECRET;

  try {
    const res = await fetch(url, {
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
      const wait = Math.min(1000 * Math.pow(2, attempt - 1), 10_000); // 1s,2s,4s,8s,10s
      await new Promise(r => setTimeout(r, wait));
      return postJson(path, body, method, attempt + 1);
    }
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  } catch (err) {
    if (attempt <= 5) {
      const wait = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      await new Promise(r => setTimeout(r, wait));
      return postJson(path, body, method, attempt + 1);
    }
    throw err;
  }
}

// ---- Public helpers (shape matches your Laravel controller) ----

export async function sendUpsertCharger(payload: {
  serial: string;              // primary identifier in Laravel
  vendor?: string;
  model?: string;
  online: boolean;
  lastSeen?: string;
  stationStatus?: "Available" | "Unavailable" | "Faulted";
  connectors?: Array<{ id: number; status: string; errorCode?: string; updatedAt?: string }>;
}) {
  return postJson("/api/ocpp/upsert", payload);
}

export async function sendConnector(payload: {
  serial: string;
  connectorId: number;
  status: string;
  errorCode?: string;
  online?: boolean;
  lastSeen?: string;
}) {
  return postJson("/api/ocpp/connector", payload);
}

export async function sendOffline(serial: string) {
  return postJson(`/api/ocpp/offline/${encodeURIComponent(serial)}`, undefined, "POST");
}

// Optional: bulk push the whole chargers.json if you want a periodic sync
export async function sendBulk(chargers: any[]) {
  return postJson("/api/ocpp/sync", { chargers });
}
