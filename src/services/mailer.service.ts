import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { type EmailJob, renderEmail } from '../templates/emails';

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Emails captured when no SMTP server is configured (development and tests). In
 * development they are also logged so verification links are easy to find.
 */
export const outbox: SentEmail[] = [];
const OUTBOX_LIMIT = 100;

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    })
  : null;

/** Renders and sends one email. Throws on failure so the queue can retry. */
export async function deliverEmail(job: EmailJob): Promise<void> {
  const { subject, html, text } = renderEmail(job);

  if (transport) {
    await transport.sendMail({ from: env.EMAIL_FROM, to: job.to, subject, html, text });
    return;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('SMTP_HOST is not configured; cannot send email in production');
  }

  outbox.push({ to: job.to, subject, html, text });
  if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  if (env.NODE_ENV === 'development') {
    logger.info({ to: job.to, subject, text }, 'Email (no SMTP configured, not sent)');
  }
}
