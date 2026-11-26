import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi';

/**
 * Swagger UI needs inline scripts, so it gets its own relaxed Content-Security-Policy.
 * Mounted before the global helmet so the strict policy never applies to these routes.
 */
export const docsRouter = Router();

docsRouter.use(helmet({ contentSecurityPolicy: false }));
docsRouter.get('/docs.json', (_req, res) => {
  res.json(openApiSpec);
});
docsRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
