"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routers/index.ts
const express_1 = __importDefault(require("express"));
const body_parser_1 = require("body-parser");
const path_1 = require("path");
const api_1 = __importDefault(require("./api"));
const sse_1 = require("../sse");
function configure(app) {
    // 1) Static assets first (CSS, JS, images)
    app.use(express_1.default.static('public'));
    // 2) JSON body parsing for API
    app.use((0, body_parser_1.json)());
    // 3) SSE stream (dashboard listens here)
    app.get('/events', sse_1.sseHandler);
    // 4) Versioned API
    app.use('/api', (0, api_1.default)()); // inside, you mounted /v1/...
    // 5) Frontend entry (serve the SPA)
    app.get('/', (_req, res) => {
        res.sendFile((0, path_1.resolve)(process.cwd(), 'public/index.html'));
    });
    // 6) Test route (optional)
    app.use('/error', (_req, _res, next) => next(new Error('Other Error')));
    // 7) 404 -> custom not found page
    app.use((_req, _res, next) => next(new Error('Not Found')));
    // 8) Error pages
    app.use((error, _req, res, _next) => {
        if (error.message === 'Not Found') {
            return res.sendFile((0, path_1.resolve)(process.cwd(), 'notfound.html'));
        }
        return res.sendFile((0, path_1.resolve)(process.cwd(), 'error.html'));
    });
}
exports.default = configure;
