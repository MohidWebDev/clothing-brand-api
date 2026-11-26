import { env } from '../config/env';
import { enqueueEmail } from '../jobs/queues/email.queue';

interface Recipient {
  name: string;
  email: string;
}

const clientUrl = (path: string, token: string) =>
  `${env.CLIENT_URL.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;

export const emailService = {
  sendVerificationEmail: (user: Recipient, token: string) =>
    enqueueEmail({
      template: 'verify-email',
      to: user.email,
      data: {
        name: user.name,
        url: clientUrl('/verify-email', token),
        expiresInHours: env.EMAIL_VERIFY_TTL_HOURS,
      },
    }),

  sendPasswordResetEmail: (user: Recipient, token: string) =>
    enqueueEmail({
      template: 'reset-password',
      to: user.email,
      data: {
        name: user.name,
        url: clientUrl('/reset-password', token),
        expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      },
    }),

  sendPasswordChangedEmail: (user: Recipient) =>
    enqueueEmail({ template: 'password-changed', to: user.email, data: { name: user.name } }),
};
