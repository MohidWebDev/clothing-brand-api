import { Router } from 'express';
import { subscribe } from '../../controllers/newsletter.controller';
import { createRateLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import { subscribeBody } from '../../validators/newsletter.validators';

const router = Router();

router.post(
  '/subscribe',
  createRateLimiter({
    windowMs: 15 * 60_000,
    limit: 10,
    message: 'Too many sign-up attempts, please try again later',
  }),
  validate({ body: subscribeBody }),
  subscribe,
);

export default router;
