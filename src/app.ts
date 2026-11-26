import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { allowedOrigins, env } from './config/env';
import { logger } from './config/logger';
import { docsRouter } from './docs';
import { csrfOriginCheck } from './middlewares/csrf';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFound';
import { createApiLimiter } from './middlewares/rateLimiter';
import { rejectUnsafeInput } from './middlewares/sanitize';
import v1Routes from './routes/v1';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      // Reuse the caller's request id when present so logs can be correlated across services.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  if (env.DOCS_ENABLED) app.use('/api', docsRouter);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use('/api', createApiLimiter());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rejectUnsafeInput);

  app.use('/api/v1', csrfOriginCheck, v1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
