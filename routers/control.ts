import { Router } from "express";
import * as hub from "../ocppHub";

export default function control() {
  const router = Router();

  // POST /api/v1/control/remote-start  { id, connectorId, idTag }
  router.post("/remote-start", async (req, res) => {
    const { id, connectorId = 1, idTag = "TEST" } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:"id required" });
    try {
      const result = await hub.call(id, "RemoteStartTransaction", { idTag, connectorId: Number(connectorId) });
      return res.json({ ok:true, result });
    } catch (e:any) {
      return res.status(500).json({ ok:false, error: e.message || String(e) });
    }
  });

  // Optional: POST /api/v1/control/data-transfer { id, vendorId, messageId, data }
  router.post("/data-transfer", async (req, res) => {
    const { id, vendorId, messageId, data } = req.body || {};
    if (!id || !vendorId) return res.status(400).json({ ok:false, error:"id and vendorId required" });
    try {
      const result = await hub.call(id, "DataTransfer", { vendorId, messageId, data });
      return res.json({ ok:true, result });
    } catch (e:any) {
      return res.status(500).json({ ok:false, error: e.message || String(e) });
    }
  });

  return router;
}
