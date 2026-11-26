import { z } from 'zod';
import { isValidPkPhone, normalizePkPhone } from '../utils/phone';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

/** At least 8 characters with a letter and a number. Length matters more than complexity. */
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const token = z.string().trim().min(20).max(200);

export const registerBody = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email,
  password: newPassword,
  phone: z
    .string()
    .trim()
    .refine(isValidPkPhone, 'Enter a valid Pakistani mobile number, e.g. 03001234567')
    .transform(normalizePkPhone)
    .optional(),
});

export const loginBody = z.object({
  email,
  // No strength rules here: they would only leak the password policy to attackers.
  password: z.string().min(1, 'Password is required').max(128),
});

export const verifyEmailBody = z.object({ token });
export const forgotPasswordBody = z.object({ email });
export const resetPasswordBody = z.object({ token, password: newPassword });
export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword,
});

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBody>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;
