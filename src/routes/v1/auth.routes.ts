import { Router } from 'express';
import * as auth from '../../controllers/auth.controller';
import { authenticate } from '../../middlewares/auth';
import { createAuthLimiter } from '../../middlewares/rateLimiter';
import { validate } from '../../middlewares/validate';
import {
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  verifyEmailBody,
} from '../../validators/auth.validators';

const router = Router();

// Each endpoint gets its own limiter so they do not share one counter.
router.post('/register', createAuthLimiter(), validate({ body: registerBody }), auth.register);
router.post(
  '/login',
  createAuthLimiter({ perEmail: true }),
  validate({ body: loginBody }),
  auth.login,
);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/logout-all', authenticate, auth.logoutAll);
router.get('/me', authenticate, auth.me);

router.post(
  '/verify-email',
  createAuthLimiter(),
  validate({ body: verifyEmailBody }),
  auth.verifyEmail,
);
router.post('/resend-verification', createAuthLimiter(), authenticate, auth.resendVerification);
router.post(
  '/forgot-password',
  createAuthLimiter({ perEmail: true }),
  validate({ body: forgotPasswordBody }),
  auth.forgotPassword,
);
router.post(
  '/reset-password',
  createAuthLimiter(),
  validate({ body: resetPasswordBody }),
  auth.resetPassword,
);
router.post(
  '/change-password',
  createAuthLimiter(),
  authenticate,
  validate({ body: changePasswordBody }),
  auth.changePassword,
);

export default router;
