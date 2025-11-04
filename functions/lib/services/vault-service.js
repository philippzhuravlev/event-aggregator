"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storePageToken = storePageToken;
exports.getPageToken = getPageToken;
exports.getApiKey = getApiKey;
exports.getWebhookVerifyToken = getWebhookVerifyToken;
exports.checkTokenExpiry = checkTokenExpiry;
exports.markTokenExpired = markTokenExpired;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("../utils/logger");
const token_expiry_1 = require("../utils/token-expiry");
const constants_1 = require("../utils/constants");
let cachedSupabase = null;
function getSupabaseClient() {
    if (cachedSupabase)
        return cachedSupabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
    cachedSupabase = (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false },
    });
    return cachedSupabase;
}
/**
 * Store a Facebook page access token in Supabase Vault (Postgres) and
 * keep metadata about token expiry in Supabase for monitoring.
 */
async function storePageToken(pageId, accessToken, options) {
    const { expiresInDays = constants_1.TOKEN_EXPIRY_CONFIG.defaultExpiresDays } = options;
    const secretName = `facebook-token-${pageId}`;
    try {
        const supabase = getSupabaseClient();
        // Create an encrypted secret in Supabase Vault using the provided function.
        // The vault.create_secret function accepts (secret, unique_name, description).
        const { data: createData, error: createError } = await supabase.rpc('vault.create_secret', {
            secret: accessToken,
            unique_name: secretName,
            description: `Facebook page token for ${pageId}`,
        });
        if (createError) {
            logger_1.logger.error('Failed to create secret in Supabase Vault', createError, { pageId });
            throw createError;
        }
        logger_1.logger.info('Stored token in Supabase Vault', { pageId, secretId: createData });
        // Store token metadata in Supabase pages table for expiry tracking
        const now = new Date();
        const expiresAt = (0, token_expiry_1.calculateExpirationDate)(expiresInDays, now);
        const { error: updateError } = await supabase
            .from('pages')
            .update({
            token_stored_at: now.toISOString(),
            token_expires_at: expiresAt.toISOString(),
            token_expires_in_days: expiresInDays,
            token_status: 'valid',
        })
            .eq('id', pageId);
        if (updateError) {
            logger_1.logger.error('Failed to update token metadata in Supabase', updateError, { pageId });
            throw updateError;
        }
        logger_1.logger.info('Stored token metadata in Supabase', {
            pageId,
            expiresAt: expiresAt.toISOString(),
            expiresInDays,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to store page token', error, { pageId });
        throw new Error(`Cannot store token for ${pageId}: ${error?.message || error}`);
    }
}
/**
 * Retrieve a Facebook page access token from Supabase Vault by unique name.
 */
async function getPageToken(pageId) {
    const secretName = `facebook-token-${pageId}`;
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('vault.read_secret', {
            secret_name: secretName,
        });
        if (error) {
            logger_1.logger.error('Failed to read secret from Supabase Vault', error, { pageId });
            return null;
        }
        return data;
    }
    catch (error) {
        logger_1.logger.error('Failed to get page token', error, { pageId });
        return null;
    }
}
/**
 * Get the API key for authenticating manual sync requests from Supabase Vault.
 */
async function getApiKey() {
    const secretName = 'facebook-api-key';
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('vault.read_secret', {
            secret_name: secretName,
        });
        if (error) {
            logger_1.logger.error('Failed to read Facebook API key from Supabase Vault', error);
            return null;
        }
        return data;
    }
    catch (error) {
        logger_1.logger.error('Failed to get Facebook API key', error);
        return null;
    }
}
/**
 * Get the webhook verify token for Facebook webhook verification from Supabase Vault.
 */
async function getWebhookVerifyToken() {
    const secretName = 'facebook-webhook-verify-token';
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('vault.read_secret', {
            secret_name: secretName,
        });
        if (error) {
            logger_1.logger.error('Failed to read webhook verify token from Supabase Vault', error);
            return null;
        }
        return data;
    }
    catch (error) {
        logger_1.logger.error('Failed to get webhook verify token', error);
        return null;
    }
}
/**
 * Check if a page's token is expiring soon and needs refresh.
 * @param pageId - Facebook page ID.
 * @param warningDays - Days before expiry to start warning (default: from TOKEN_EXPIRY_CONFIG).
 * @returns Token expiry status.
 */
async function checkTokenExpiry(pageId, warningDays = constants_1.TOKEN_EXPIRY_CONFIG.warningDays) {
    const supabase = getSupabaseClient();
    const { data: pageData, error } = await supabase
        .from('pages')
        .select('token_expires_at')
        .eq('id', pageId)
        .single();
    if (error || !pageData?.token_expires_at) {
        return { isExpiring: true, daysUntilExpiry: 0, expiresAt: null };
    }
    const expiresAt = new Date(pageData.token_expires_at);
    const now = new Date();
    const daysUntilExpiry = (0, token_expiry_1.calculateDaysUntilExpiry)(expiresAt, now);
    return {
        isExpiring: (0, token_expiry_1.isTokenExpiring)(daysUntilExpiry, warningDays),
        daysUntilExpiry,
        expiresAt,
    };
}
/**
 * Mark a page's token as expired in Supabase.
 * @param pageId - Facebook page ID.
 * @returns Promise<void>
 */
async function markTokenExpired(pageId) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('pages')
        .update({
        token_status: 'expired',
        token_expired_at: new Date().toISOString(),
        active: false,
    })
        .eq('id', pageId);
    if (error) {
        logger_1.logger.error('Failed to mark token as expired in Supabase', error, { pageId });
        throw error;
    }
    logger_1.logger.warn('Marked token as expired in Supabase', { pageId });
}
//# sourceMappingURL=vault-service.js.map