import type { Request, RequestHandler } from 'express';
import { type RequestMeta, authService } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../utils/cookies';
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '../validators/auth.validators';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });
const body = <T>(req: Request) => req.validated.body as T;
const refreshCookie = (req: Request) =>
  (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

export const register: RequestHandler = async (req, res) => {
  const result = await authService.register(body<RegisterBody>(req), meta(req));
  setAuthCookies(res, result.tokens);
  sendCreated(
    res,
    { user: result.user },
    'Account created. Check your email to verify your address.',
  );
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = body<LoginBody>(req);
  const result = await authService.login(email, password, meta(req));
  setAuthCookies(res, result.tokens);
  sendSuccess(res, { user: result.user });
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const result = await authService.refresh(refreshCookie(req), meta(req));
    setAuthCookies(res, result.tokens);
    sendSuccess(res, { user: result.user });
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) clearAuthCookies(res);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(refreshCookie(req));
  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Signed out' });
};

export const logoutAll: RequestHandler = async (req, res) => {
  await authService.logoutAll(req.user!.id);
  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Signed out of all devices' });
};

export const me: RequestHandler = async (req, res) => {
  sendSuccess(res, { user: await authService.getProfile(req.user!.id) });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  await authService.verifyEmail(body<VerifyEmailBody>(req).token);
  sendSuccess(res, null, { message: 'Email verified' });
};

export const resendVerification: RequestHandler = async (req, res) => {
  const { alreadyVerified } = await authService.resendVerification(req.user!.id);
  sendSuccess(res, null, {
    message: alreadyVerified ? 'Email is already verified' : 'Verification email sent',
  });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.forgotPassword(body<ForgotPasswordBody>(req).email);
  sendSuccess(res, null, {
    message: 'If an account exists for that email, a reset link has been sent.',
  });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { token, password } = body<ResetPasswordBody>(req);
  await authService.resetPassword(token, password);
  sendSuccess(res, null, { message: 'Password updated. You can now sign in.' });
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = body<ChangePasswordBody>(req);
  const result = await authService.changePassword(
    req.user!.id,
    currentPassword,
    newPassword,
    meta(req),
  );
  setAuthCookies(res, result.tokens);
  sendSuccess(res, { user: result.user }, { message: 'Password changed' });
};
