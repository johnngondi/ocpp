// routers/chargers.ts
import { Router } from 'express';
import * as store from '../store';
import { pushDelete } from '../sse';

export default function chargers() {
  const router = Router();

  // GET /api/v1/chargers
  router.get('/', (_req, res) => {
    res.json({ chargers: store.all() });
  });

  // DELETE /api/v1/chargers/:id
  router.delete('/:id', (req, res) => {
    const id = req.params.id;
    const ok = store.removeCharger(id);
    if (ok) {
      pushDelete(id);
      res.json({ ok: true });
    } else {
      res.status(404).json({ ok: false, error: 'Not found' });
    }
  });

  // POST /api/v1/chargers/:id/connectors  { "count": N }
  router.post('/:id/connectors', (req, res) => {
    const id = req.params.id;
    const count = Math.max(0, Number(req.body?.count || 0));
    for (let i = 1; i <= count; i++) {
      store.updateConnector(id, i, 'Unavailable');
    }
    res.json({ ok: true, id, count });
  });

  return router;
}
