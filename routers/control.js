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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hub = __importStar(require("../ocppHub"));
function control() {
    const router = (0, express_1.Router)();
    // POST /api/v1/control/remote-start  { id, connectorId, idTag }
    router.post("/remote-start", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { id, connectorId = 1, idTag = "TEST" } = req.body || {};
        if (!id)
            return res.status(400).json({ ok: false, error: "id required" });
        try {
            const result = yield hub.call(id, "RemoteStartTransaction", { idTag, connectorId: Number(connectorId) });
            return res.json({ ok: true, result });
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    }));
    // Optional: POST /api/v1/control/data-transfer { id, vendorId, messageId, data }
    router.post("/data-transfer", (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { id, vendorId, messageId, data } = req.body || {};
        if (!id || !vendorId)
            return res.status(400).json({ ok: false, error: "id and vendorId required" });
        try {
            const result = yield hub.call(id, "DataTransfer", { vendorId, messageId, data });
            return res.json({ ok: true, result });
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: e.message || String(e) });
        }
    }));
    return router;
}
exports.default = control;
