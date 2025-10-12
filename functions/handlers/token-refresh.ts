import * as admin from 'firebase-admin';
import { getActivePages } from '../services/firestore-service';
import { getPageToken, storePageToken, checkTokenExpiry, markTokenExpired } from '../services/secret-manager';
import { exchangeForLongLivedToken } from '../services/facebook-api';
import { logger } from '../utils/logger';
import { ERROR_CODES, TOKEN_REFRESH } from '../utils/constants';
import { sendAlertEmail, createMailTransporter, type MailConfig } from '../services/mail-service';

// NB: "Handlers" like execute business logic; they "do something", like
// // syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// It is known that facebook tokens exist in a short-lived (hours) and long-lived
// (60 days) format. They can't be any longer, and that's the point; it's a security
// measure to get apps to regularly refresh tokens. And so, that's what we do here

/**
 * Scheduled token refresh
 * - Finds all active pages
 * - For tokens expiring within `warningDays`, attempts to refresh via Facebook
 * - Stores refreshed token in Secret Manager and updates Firestore metadata
 * - Marks tokens as expired/inactive when Facebook reports they are invalid
 * @param appId - Facebook App ID
 * @param appSecret - Facebook App Secret
 * @param mailConfig - SMTP configuration for sending alert emails (from Secret Manager)
 */
export async function handleScheduledTokenRefresh(
  appId: string, 
  appSecret: string, 
  mailConfig: Partial<MailConfig>
): Promise<void> {
  const db = admin.firestore(); // dont get it twisted; this just initializes firestore
  
  // Create mailer from Secret Manager credentials
  const mailer = createMailTransporter(mailConfig);
  if (!mailer) {
    logger.warn('Mail service not available; alerts will not be sent');
  }
  
  // so it begins
  try {
    logger.info('Scheduled token refresh started');
    const pages = await getActivePages(db);

    if (pages.length === 0) {
      logger.info('No active pages found for token refresh');
      return;
    }

    for (const page of pages) {
      try {
        const token = await getPageToken(page.id);
        if (!token) {
          logger.warn('No token found for page; skipping refresh', { pageId: page.id, pageName: page.name });
          continue;
        }

  const expiry = await checkTokenExpiry(db, page.id, TOKEN_REFRESH.WARNING_DAYS);
        if (!expiry.isExpiring) {
          logger.debug('Token not expiring yet; skipping', { pageId: page.id, daysUntilExpiry: expiry.daysUntilExpiry });
          continue;
        }

        logger.info('Refreshing token for page', { pageId: page.id, pageName: page.name, daysUntilExpiry: expiry.daysUntilExpiry });

        // Here's where the magic happens: We exchange the soon-to-expire token for a new (long-lived) one
        try {
          const newToken = await exchangeForLongLivedToken(token, appId, appSecret);
          // store new token and update metadata (defaults to configured days)
          await storePageToken(page.id, newToken, { db, expiresInDays: TOKEN_REFRESH.DEFAULT_EXPIRES_DAYS });
          logger.info('Token refreshed and stored', { pageId: page.id });
        } catch (err: any) {
          // if Facebook reports the token as invalid, we in turn mark it as expired
          const fbErr = err?.response?.data?.error;
          if (fbErr && fbErr.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
            logger.error('Token refresh failed - token invalid, marking expired', err, { pageId: page.id });
            await markTokenExpired(db, page.id);
            continue;
          }

          // Either way we log the error and send an alert email with the excellent nodemailer package
          logger.error('Failed to refresh token for page', err, { pageId: page.id, pageName: page.name });
          try {
            await sendAlertEmail(
              `DTUEvent: Token refresh failed for page ${page.name} (${page.id})`,
              `Failed to refresh token for page ${page.name} (id: ${page.id}). Error: ${err?.message || String(err)}`,
              TOKEN_REFRESH.ALERT_EMAIL,
              mailer
            );
          } catch (emailErr: any) {
            logger.error('Failed to send token refresh failure alert email', emailErr, { pageId: page.id });
          }
        }
      } catch (error: any) {
        logger.error('Unexpected error while refreshing token for page', error, { pageId: page.id });
      }
    }

    logger.info('Scheduled token refresh completed');
  } catch (error: any) {
    logger.error('Scheduled token refresh failed', error);
    throw error;
  }
}
