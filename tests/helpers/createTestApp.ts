import express, { type Router } from 'express';
import pinoHttp from 'pino-http';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { notFoundHandler } from '../../src/middlewares/notFound';
import { rejectUnsafeInput } from '../../src/middlewares/sanitize';

/** Minimal app with the real error pipeline, for testing middleware in isolation. */
export function createTestApp(mount: (router: Router) => void) {
  const app = express();
  app.use(pinoHttp({ level: 'silent' }));
  app.use(express.json());
  app.use(rejectUnsafeInput);

  const router = express.Router();
  mount(router);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
