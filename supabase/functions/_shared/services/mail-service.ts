import { logger } from "./logger-service.ts";

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// This mail service uses Resend (https://resend.com/) which is optimized for
// serverless/edge functions like Supabase Edge Functions. It has a simple HTTP
// API and doesn't require SMTP configuration. Works great with Deno!

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface AlertEmailOptions extends EmailOptions {
  alertType:
    | "token_refresh_failed"
    | "token_expiry_warning"
    | "event_sync_failed";
  details?: Record<string, unknown>;
}

/**
 * Initialize and validate mail service configuration
 * Requires RESEND_API_KEY environment variable
 * Returns true if service is ready, false otherwise
 */
export function createMailTransporter(): boolean {
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      logger.warn("Mail service not configured: RESEND_API_KEY not set");
      return false;
    }
    // Validate it looks like a valid Resend API key
    if (!apiKey.startsWith("re_")) {
      logger.warn("Invalid RESEND_API_KEY format (should start with 're_')");
      return false;
    }
    logger.info("Mail service initialized successfully");
    return true;
  } catch (error) {
    logger.error(
      "Failed to initialize mail transporter",
      error instanceof Error ? error : null,
    );
    return false;
  }
}

/**
 * Send email via Resend API
 * @param options - Email options (to, subject, html/text content)
 * @returns Success status and optional error message
 */
export async function sendEmail(
  options: EmailOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const mailFrom = Deno.env.get("MAIL_FROM");

    if (!apiKey) {
      logger.warn("Cannot send email - RESEND_API_KEY not configured");
      return { success: false, error: "Email service not configured" };
    }

    if (!mailFrom) {
      logger.warn("Cannot send email - MAIL_FROM not configured");
      return { success: false, error: "Sender email not configured" };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("Email send failed", null, {
        status: response.status,
        error,
        to: options.to,
      });
      return {
        success: false,
        error: `Email send failed: ${response.status}`,
      };
    }

    logger.info("Email sent successfully", {
      to: options.to,
      subject: options.subject,
    });

    return { success: true };
  } catch (error) {
    logger.error("Mail service error", error instanceof Error ? error : null, {
      to: options.to,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send alert email with standardized formatting
 */
export async function sendAlertEmail(
  options: AlertEmailOptions,
): Promise<{ success: boolean; error?: string }> {
  const emailContent = formatAlertEmail(options);

  return await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html || emailContent,
    text: options.text,
  });
}

/**
 * Format alert email with standardized template
 */
function formatAlertEmail(options: AlertEmailOptions): string {
  const alertTypeLabels: Record<string, string> = {
    token_refresh_failed: "Token Refresh Failed",
    token_expiry_warning: "Token Expiry Warning",
    event_sync_failed: "Event Sync Failed",
  };

  const label = alertTypeLabels[options.alertType];
  const timestamp = new Date().toISOString();

  let detailsHtml = "";
  if (options.details) {
    detailsHtml = `
      <h3>Details:</h3>
      <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(options.details, null, 2)}
      </pre>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { border-bottom: 3px solid #dc2626; padding-bottom: 10px; margin-bottom: 20px; }
          h1 { margin: 0; color: #dc2626; font-size: 24px; }
          .timestamp { color: #666; font-size: 12px; margin-top: 5px; }
          .content { margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .footer a { color: #0066cc; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${label}</h1>
            <div class="timestamp">${timestamp}</div>
          </div>
          
          <div class="content">
            <p>${
    options.text ||
    "An event occurred in your Event Aggregator system that requires attention."
  }</p>
            
            ${detailsHtml}
          </div>
          
          <div class="footer">
            <p>
              This is an automated alert from Event Aggregator.
              <br>
              <a href="${
    Deno.env.get("WEB_APP_URL") || "https://eventagg.dev"
  }">View Dashboard</a>
              | <a href="https://resend.com">Powered by Resend</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Send token refresh failure notification
 */
export async function sendTokenRefreshFailedAlert(
  pageId: string,
  error: string,
): Promise<{ success: boolean; error?: string }> {
  const adminEmail = Deno.env.get("ALERT_EMAIL_TO") ||
    Deno.env.get("ADMIN_EMAIL") ||
    "admin@eventagg.dev";

  return await sendAlertEmail({
    to: adminEmail,
    subject: `Token Refresh Failed - Page ${pageId}`,
    alertType: "token_refresh_failed",
    text:
      `Facebook token refresh failed for page ${pageId}. Manual intervention may be required.`,
    details: {
      pageId,
      error,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Send token expiry warning notification
 */
export async function sendTokenExpiryWarning(
  pageId: string,
  expiresIn: number,
): Promise<{ success: boolean; error?: string }> {
  const adminEmail = Deno.env.get("ALERT_EMAIL_TO") ||
    Deno.env.get("ADMIN_EMAIL") ||
    "admin@eventagg.dev";

  const days = Math.ceil(expiresIn / (24 * 60 * 60));

  return await sendAlertEmail({
    to: adminEmail,
    subject: `Token Expiry Warning - Page ${pageId} expires in ${days} days`,
    alertType: "token_expiry_warning",
    text:
      `Facebook token for page ${pageId} will expire in ${days} days. Consider refreshing soon.`,
    details: {
      pageId,
      expiresIn,
      expiresInDays: days,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Send event sync failure notification
 */
export async function sendEventSyncFailedAlert(
  error: string,
  context?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const adminEmail = Deno.env.get("ALERT_EMAIL_TO") ||
    Deno.env.get("ADMIN_EMAIL") ||
    "admin@eventagg.dev";

  return await sendAlertEmail({
    to: adminEmail,
    subject: "Event Sync Failed",
    alertType: "event_sync_failed",
    text: "An error occurred while syncing events from Facebook.",
    details: {
      error,
      ...context,
      timestamp: new Date().toISOString(),
    },
  });
}
