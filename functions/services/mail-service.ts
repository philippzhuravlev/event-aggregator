import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';
import { TOKEN_REFRESH } from '../utils/constants';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to meta
// Services should not be confused with "handlers" that do business logic

// Quite self-explanatory: This is a simple mailer service using the excellent module 
// "nodemailer", that sends out a simple email if e.g. token refresh fails.

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from?: string;
}

/**
 * Create a nodemailer transporter from SMTP configuration.
 * Now accepts runtime config (from Secret Manager or env vars) instead of
 * reading process.env at module import time.
 * @param config - SMTP configuration
 * @returns Nodemailer transporter or null if config is incomplete
 */
export function createMailTransporter(config: Partial<MailConfig>): Transporter | null {
  // Nodemailer and many other mail services use something called SMTP (Simple Mail Transfer Protocol),
  // which is a standardized way of sending emails through programs over the internet. You need
  // the below host, port, user, and pass to use this protocol (/system). We pull these from
  // Vault at runtime.
  const { host, port, user, pass } = config;

  if (!host || !port || !user || !pass) {
    logger.warn('SMTP credentials not fully configured; mailer disabled', { 
      hasHost: !!host, 
      hasPort: !!port, 
      hasUser: !!user, 
      hasPass: !!pass 
    });
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Send an alert email using a provided transporter (or create one from env vars as fallback).
 * @param subject - Email subject
 * @param text - Email body (plain text)
 * @param to - Recipient email address
 * @param transporter - Optional pre-configured transporter
 * @returns Promise<void>
 */
export async function sendAlertEmail(
  subject: string, 
  text: string, 
  to: string = TOKEN_REFRESH.ALERT_EMAIL,
  transporter?: Transporter | null
): Promise<void> {
  // here we use something called a "transporter", which is just an object related to 
  // mailing that we've already added SMTP stuff to. 
  let mailer = transporter; // we get the transporter from the caller (e.g. token-refresh handler)
  if (!mailer) { // If no transporter provided, try to create one from env vars
    mailer = createMailTransporter({
      host: process.env.MAIL_SMTP_HOST,
      port: process.env.MAIL_SMTP_PORT ? parseInt(process.env.MAIL_SMTP_PORT) : undefined,
      user: process.env.MAIL_SMTP_USER,
      pass: process.env.MAIL_SMTP_PASS,
    });
  }

  if (!mailer) {
    logger.warn('Transporter not available; skipping sendAlertEmail', { subject, to });
    return;
  }

  try {
    await mailer.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@dtuevent.dk', // default from address
      to,
      subject,
      text,
    });
    logger.info('Sent alert email', { subject, to });
  } catch (error: any) {
    logger.error('Failed to send alert email', error, { subject, to });
  }
}
