import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { PageInfo, NormalizedEvent, EventBatchItem } from '../types';
import { TokenExpiryStatus } from '../types';
import { calculateDaysUntilExpiry, isTokenExpiring, calculateExpirationDate } from '../utils/token-expiry';
import { TOKEN_EXPIRY_CONFIG } from '../utils/constants';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to meta
// Services should not be confused with "handlers" that do business logic

// This file specifically handles Supabase interactions related to Facebook pages and events
// Including storing/retrieving tokens, saving pages/events, and checking token expiry
// Note that sensitive tokens are stored encrypted in Supabase Vault, i.e. vault-service.ts

/**
 * Store a Facebook page access token securely in Supabase Vault (encrypted)
 * and store token metadata in the pages table for expiry tracking.
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param accessToken - Facebook page access token (will be encrypted in vault)
 * @param expiresInDays - Days until token expiry
 * @returns Promise<void>
 */
export async function storePageToken(
  supabase: SupabaseClient,
  pageId: string,
  accessToken: string,
  expiresInDays: number = TOKEN_EXPIRY_CONFIG.defaultExpiresDays
): Promise<void> {
  const now = new Date();
  const expiresAt = calculateExpirationDate(expiresInDays, now);
  const secretName = `facebook-token-${pageId}`;

  try {
    // Step 1: Store encrypted token in Supabase Vault
    // The vault.create_secret function will encrypt and store the token securely. It's located
    // in the SQL editor of Supabase
    const { data: createData, error: createError } = await supabase.rpc('vault.create_secret', {
      secret: accessToken,
      unique_name: secretName,
      description: `Facebook page token for ${pageId}`,
    } as any);

    if (createError) {
      logger.error('Failed to store token in Supabase Vault', createError, { pageId });
      throw createError;
    }

    logger.info('Stored encrypted token in Supabase Vault', { pageId, secretId: createData });

    // Step 2: Store token metadata in pages table for expiry tracking
    const pageData: any = {
      page_id: parseInt(pageId),
      token_expiry: expiresAt.toISOString(),
      token_status: 'active',
      updated_at: now.toISOString(),
      page_access_token_id: createData,
    };

    const { error: updateError } = await supabase
      .from('pages')
      .upsert(pageData, { onConflict: 'page_id' });

    if (updateError) {
      logger.error('Failed to update page metadata in Supabase', updateError, { pageId });
      throw new Error(`Cannot store token metadata: Supabase update failed for page ${pageId}`);
    }

    logger.info('Stored token metadata in Supabase pages table', { pageId, expiresInDays });
  } catch (error: any) {
    logger.error('Failed to store page token', error, { pageId });
    throw new Error(`Cannot store token for ${pageId}: ${error?.message || error}`);
  }
}

/**
 * Save or update a Facebook page in Supabase
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param pageData - Page data to store
 */
export async function savePage(
  supabase: SupabaseClient,
  pageId: string, 
  pageData: { name?: string }
): Promise<void> {
  const dataToSave: any = {
    page_id: parseInt(pageId),
    updated_at: new Date().toISOString(),
  };

  if (pageData.name !== undefined) {
    dataToSave.page_name = pageData.name;
  }

  const { error } = await supabase.from('pages').upsert(dataToSave);

  if (error) {
    logger.error('Failed to save page in Supabase', error, { pageId });
    throw new Error(`Failed to save page in Supabase: ${error.message}`);
  }

  logger.info('Saved page in Supabase', { pageId });
}

/**
 * Save or update a Facebook event in Supabase
 * @param supabase - Supabase client
 * @param eventId - Facebook event ID
 * @param eventData - Event data to store
 */
export async function saveEvent(
  supabase: SupabaseClient,
  eventId: string, 
  eventData: NormalizedEvent
): Promise<void> {
  const { error } = await supabase.from('events').upsert({ ...eventData, id: eventId });

  if (error) {
    logger.error('Failed to save event in Supabase', error, { eventId });
    throw new Error(`Failed to save event in Supabase: ${error.message}`);
  }

  logger.info('Saved event in Supabase', { eventId });
}

/**
 * Batch write multiple events to Supabase
 * @param supabase - Supabase client
 * @param events - Array of event objects with id and data
 * @returns Number of events written
 */
export async function batchWriteEvents(
  supabase: SupabaseClient,
  events: EventBatchItem[]
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const eventsToUpsert = events.map(item => ({
    ...item.data,
    id: item.id,
  }));

  const { error } = await supabase.from('events').upsert(eventsToUpsert);

  if (error) {
    logger.error('Failed to batch write events to Supabase', error);
    throw new Error(`Failed to batch write events to Supabase: ${error.message}`);
  }

  logger.info('Wrote batch of events to Supabase', {
    batchSize: events.length,
    totalWritten: events.length,
  });

  return events.length;
}

/**
 * Retrieve a Facebook page access token from Supabase Vault (encrypted)
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @returns The decrypted access token or null if not found
 */
export async function getPageToken(supabase: SupabaseClient, pageId: string): Promise<string | null> {
  const secretName = `facebook-token-${pageId}`;

  try {
    // When getting the token, we use the decrypted_secrets view which
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('unique_name', secretName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to retrieve token from Supabase Vault', { pageId, errorMessage: error.message });
      return null;
    }

    if (!data) {
      logger.warn('No token found in Supabase Vault', { pageId });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return data.decrypted_secret || null;
  } catch (error: any) {
    logger.error('Failed to retrieve token from Supabase Vault', error, { pageId });
    return null;
  }
}

/**
 * Get the API key for authenticating manual sync requests from Supabase Vault (encrypted)
 * @param supabase - Supabase client
 * @returns The decrypted API key or null if not found
 */
export async function getApiKey(supabase: SupabaseClient): Promise<string | null> {
  const secretName = 'API_SYNC_KEY';
  try {
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('unique_name', secretName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Failed to retrieve API key from Supabase Vault', error, { secretName });
      return null;
    }

    if (!data) {
      logger.warn('No API key found in Supabase Vault', { secretName });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return data.decrypted_secret || null;
  } catch (error: any) {
    logger.error('Failed to retrieve API key from Supabase Vault', error, { secretName });
    return null;
  }
}

/**
 * Get the webhook verify token for Facebook webhook verification from Supabase Vault (encrypted)
 * @param supabase - Supabase client
 * @returns The decrypted webhook verify token or null if not found
 */
export async function getWebhookVerifyToken(supabase: SupabaseClient): Promise<string | null> {
  const secretName = 'WEBHOOK_VERIFY_TOKEN';
  try {
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('unique_name', secretName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Failed to retrieve webhook verify token from Supabase Vault', error, { secretName });
      return null;
    }

    if (!data) {
      logger.warn('No webhook verify token found in Supabase Vault', { secretName });
      return null;
    }

    // @ts-ignore - vault.decrypted_secrets returns decrypted_secret field
    return data.decrypted_secret || null;
  } catch (error: any) {
    logger.error('Failed to retrieve webhook verify token from Supabase Vault', error, { secretName });
    return null;
  }
}

/**
 * Get all active pages from Supabase
 * @param supabase - Supabase client
 * @returns Array of page objects
 */
export async function getActivePages(supabase: SupabaseClient): Promise<PageInfo[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('id, page_id, page_name, token_status')
    .eq('token_status', 'active');

  if (error) {
    logger.error('Failed to retrieve active pages from Supabase', error);
    return [];
  }

  if (!data) {
    return [];
  }

  return data.map((page: any) => ({
    id: page.page_id.toString(),
    name: page.page_name,
    data: page,
  }));
}

/**
 * Check if a page's token is expiring soon and needs refresh
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @param warningDays - Days before expiry to start warning
 * @returns Token expiry status
 */
export async function checkTokenExpiry(
  supabase: SupabaseClient,
  pageId: string,
  warningDays: number = TOKEN_EXPIRY_CONFIG.warningDays
): Promise<TokenExpiryStatus> {
  const { data, error } = await supabase
    .from('pages')
    .select('token_expiry')
    .eq('page_id', parseInt(pageId))
    .single();

  if (error || !data || !data.token_expiry) {
    if (error) logger.warn('Failed to check token expiry from Supabase', { pageId });
    return { isExpiring: true, daysUntilExpiry: 0, expiresAt: null };
  }

  const expiresAt = new Date(data.token_expiry);
  const now = new Date();
  const daysUntilExpiry = calculateDaysUntilExpiry(expiresAt, now);

  return {
    isExpiring: isTokenExpiring(daysUntilExpiry, warningDays),
    daysUntilExpiry,
    expiresAt,
  };
}

/**
 * Mark a page's token as expired in Supabase
 * @param supabase - Supabase client
 * @param pageId - Facebook page ID
 * @returns Promise<void>
 */
export async function markTokenExpired(supabase: SupabaseClient, pageId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('pages')
    .update({
      token_status: 'expired',
      updated_at: now,
    })
    .eq('page_id', parseInt(pageId));

  if (error) {
    logger.error('Failed to mark token as expired in Supabase', error, { pageId });
    throw new Error(`Failed to mark token as expired in Supabase: ${error.message}`);
  }

  logger.warn('Marked token as expired in Supabase', { pageId });
}
