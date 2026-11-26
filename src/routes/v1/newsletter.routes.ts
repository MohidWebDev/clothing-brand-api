import { Router } from 'express';
import { subscribe } from '../../controllers/newsletter.controller';
import { createAuthLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import { subscribeBody } from '../../validators/newsletter.validators';

const router = Router();

router.post('/subscribe', createAuthLimiter(), validate({ body: subscribeBody }), subscribe);

export default router;
