
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { getAI } from './ai/index.js';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import groupRoutes from './routes/groups.js';
import personalRoutes from './routes/personal.js';
import plannerRoutes from './routes/planner.js';
import studyRoutes from './routes/study.js';

export function createApp() {
  const app = express();

  // Render utiliza um proxy reverso.
  // Confia em um proxy antes da aplicação.
  app.set('trust proxy', 1);

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.env === 'test',
    message: {
      error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    }
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.env === 'test',
    message: {
      error: 'Muitas solicitações de IA em pouco tempo. Aguarde um minuto.'
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/ai/status', (_req, res) => {
    const ai = getAI();

    res.json({
      provider: ai.name,
      label: ai.label,
      isMock: ai.isMock
    });
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/personal', personalRoutes);
  app.use('/api/planner', plannerRoutes);
  app.use('/api', documentRoutes);
  app.use('/api', aiLimiter, studyRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'Rota não encontrada.'
    });
  });

  const dist = path.join(config.rootDir, 'web', 'dist');

  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));

    app.use((req, res, next) =>
      req.method === 'GET'
        ? res.sendFile(path.join(dist, 'index.html'))
        : next()
    );
  }

  app.use(errorHandler);

  return app;
}
