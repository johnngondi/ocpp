"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// routers/chargers.ts
const express_1 = require("express");
const store = __importStar(require("../store"));
const sse_1 = require("../sse");
function chargers() {
    const router = (0, express_1.Router)();
    // GET /api/v1/chargers
    router.get('/', (_req, res) => {
        res.json({ chargers: store.all() });
    });
    // DELETE /api/v1/chargers/:id
    router.delete('/:id', (req, res) => {
        const id = req.params.id;
        const ok = store.removeCharger(id);
        if (ok) {
            (0, sse_1.pushDelete)(id);
            res.json({ ok: true });
        }
        else {
            res.status(404).json({ ok: false, error: 'Not found' });
        }
    });
    // POST /api/v1/chargers/:id/connectors  { "count": N }
    router.post('/:id/connectors', (req, res) => {
        var _a;
        const id = req.params.id;
        const count = Math.max(0, Number(((_a = req.body) === null || _a === void 0 ? void 0 : _a.count) || 0));
        for (let i = 1; i <= count; i++) {
            store.updateConnector(id, i, 'Unavailable');
        }
        res.json({ ok: true, id, count });
    });
    return router;
}
exports.default = chargers;
