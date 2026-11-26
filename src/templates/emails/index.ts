import { env } from '../../config/env';
import { escapeHtml } from '../../utils/html';
import { renderButton, renderLayout } from './layout';
import type { EmailJob, RenderedEmail } from './types';

export type { EmailJob, RenderedEmail } from './types';

export function renderEmail(job: EmailJob): RenderedEmail {
  switch (job.template) {
    case 'verify-email': {
      const { name, url, expiresInHours } = job.data;
      return {
        subject: `Verify your email for ${env.APP_NAME}`,
        html: renderLayout(
          'Verify your email address',
          `<p>Hi ${escapeHtml(name)},</p>
           <p>Welcome to ${escapeHtml(env.APP_NAME)}! Please confirm your email address to finish setting up your account.</p>
           ${renderButton('Verify email', url)}
           <p style="font-size:13px;color:#666">This link expires in ${expiresInHours} hours. If you did not create an account, you can ignore this email.</p>`,
        ),
        text: `Hi ${name},\n\nConfirm your email address: ${url}\n\nThis link expires in ${expiresInHours} hours. If you did not create an account, ignore this email.`,
      };
    }
    case 'reset-password': {
      const { name, url, expiresInMinutes } = job.data;
      return {
        subject: `Reset your ${env.APP_NAME} password`,
        html: renderLayout(
          'Reset your password',
          `<p>Hi ${escapeHtml(name)},</p>
           <p>We received a request to reset your password.</p>
           ${renderButton('Choose a new password', url)}
           <p style="font-size:13px;color:#666">This link expires in ${expiresInMinutes} minutes and can be used once. If you did not ask for this, you can ignore this email; your password will not change.</p>`,
        ),
        text: `Hi ${name},\n\nReset your password: ${url}\n\nThis link expires in ${expiresInMinutes} minutes. If you did not ask for this, ignore this email.`,
      };
    }
    case 'password-changed': {
      const { name } = job.data;
      return {
        subject: `Your ${env.APP_NAME} password was changed`,
        html: renderLayout(
          'Your password was changed',
          `<p>Hi ${escapeHtml(name)},</p>
           <p>The password for your account was just changed. All other devices have been signed out.</p>
           <p style="font-size:13px;color:#666">If this was not you, reset your password immediately and contact support.</p>`,
        ),
        text: `Hi ${name},\n\nThe password for your account was just changed and all other devices were signed out. If this was not you, reset your password immediately and contact support.`,
      };
    }
  }
}
