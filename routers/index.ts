// routers/index.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import { json } from 'body-parser';
import { resolve } from 'path';
import api from './api';
import { sseHandler } from '../sse';

export default function configure(app: Application) {
  // 1) Static assets first (CSS, JS, images)
  app.use(express.static('public'));

  // 2) JSON body parsing for API
  app.use(json());

  // 3) SSE stream (dashboard listens here)
  app.get('/events', sseHandler);

  // 4) Versioned API
  app.use('/api', api()); // inside, you mounted /v1/...

  // 5) Frontend entry (serve the SPA)
  app.get('/', (_req, res) => {
    res.sendFile(resolve(process.cwd(), 'public/index.html'));
  });

  // 6) Test route (optional)
  app.use('/error', (_req, _res, next) => next(new Error('Other Error')));

  // 7) 404 -> custom not found page
  app.use((_req, _res, next) => next(new Error('Not Found')));

  // 8) Error pages
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error.message === 'Not Found') {
      return res.sendFile(resolve(process.cwd(), 'notfound.html'));
    }
    return res.sendFile(resolve(process.cwd(), 'error.html'));
  });
}
