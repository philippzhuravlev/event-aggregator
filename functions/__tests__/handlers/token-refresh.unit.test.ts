import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('handleScheduledTokenRefresh', () => {
  const page = { id: 'p1', name: 'Test Page' };

  beforeEach(() => {
    jest.resetModules();
    // Prevent firebase-admin from trying to access a real default app during module import
    jest.doMock('firebase-admin', () => ({
      firestore: jest.fn(() => ({})),
    }));
    jest.clearAllMocks();
  });

  it('does nothing when no active pages', async () => {
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => []) }));
    // other services - no-op
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(), checkTokenExpiry: jest.fn(), storePageToken: jest.fn(), markTokenExpired: jest.fn() }));
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn() }));
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: jest.fn() }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    await handleScheduledTokenRefresh('appId', 'appSecret', {});

    const fs = require('../../services/firestore-service');
    expect(fs.getActivePages).toHaveBeenCalled();
  });

  it('skips page when no token present', async () => {
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => [page]) }));
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => null), checkTokenExpiry: jest.fn(), storePageToken: jest.fn(), markTokenExpired: jest.fn() }));
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn() }));
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: jest.fn() }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    await handleScheduledTokenRefresh('appId', 'appSecret', {});

    const sm = require('../../services/secret-manager');
    expect(sm.getPageToken).toHaveBeenCalledWith(page.id);
  });

  it('skips when token not expiring', async () => {
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => [page]) }));
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 't'), checkTokenExpiry: jest.fn(async () => ({ isExpiring: false, daysUntilExpiry: 10 })), storePageToken: jest.fn(), markTokenExpired: jest.fn() }));
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn() }));
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: jest.fn() }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    await handleScheduledTokenRefresh('appId', 'appSecret', {});

    const fb = require('../../services/facebook-api');
    expect(fb.exchangeForLongLivedToken).not.toHaveBeenCalled();
  });

  it('refreshes token successfully', async () => {
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => [page]) }));
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'old'), checkTokenExpiry: jest.fn(async () => ({ isExpiring: true, daysUntilExpiry: 1 })), storePageToken: jest.fn(async () => {}), markTokenExpired: jest.fn() }));
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn(async () => 'new-token') }));
    const sendAlert = jest.fn();
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: sendAlert }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    await handleScheduledTokenRefresh('appId', 'appSecret', {});

    const sm = require('../../services/secret-manager');
    expect(sm.storePageToken).toHaveBeenCalledWith(page.id, 'new-token', expect.any(Object));
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('marks token expired when facebook returns invalid token error', async () => {
    const { ERROR_CODES } = require('../../utils/constants');
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => [page]) }));
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'old'), checkTokenExpiry: jest.fn(async () => ({ isExpiring: true, daysUntilExpiry: 1 })), storePageToken: jest.fn(), markTokenExpired: jest.fn(async () => {}) }));
    const err: any = new Error('fb');
    err.response = { data: { error: { code: ERROR_CODES.FACEBOOK_TOKEN_INVALID } } };
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn(async () => { throw err; }) }));
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: jest.fn() }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    await handleScheduledTokenRefresh('appId', 'appSecret', {});

    const sm = require('../../services/secret-manager');
    expect(sm.markTokenExpired).toHaveBeenCalledWith(expect.any(Object), page.id);
  });

  it('sends alert email on non-fb error and continues when email send fails', async () => {
    jest.doMock('../../services/firestore-service', () => ({ getActivePages: jest.fn(async () => [page]) }));
    jest.doMock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'old'), checkTokenExpiry: jest.fn(async () => ({ isExpiring: true, daysUntilExpiry: 1 })), storePageToken: jest.fn(), markTokenExpired: jest.fn() }));
    jest.doMock('../../services/facebook-api', () => ({ exchangeForLongLivedToken: jest.fn(async () => { throw new Error('network'); }) }));
    const sendAlert = jest.fn(async () => { throw new Error('email fail'); });
    jest.doMock('../../services/mail-service', () => ({ createMailTransporter: jest.fn(() => ({})), sendAlertEmail: sendAlert }));

    const { handleScheduledTokenRefresh } = require('../../handlers/token-refresh');
    // should not throw even if email sending fails
    await expect(handleScheduledTokenRefresh('appId', 'appSecret', {})).resolves.toBeUndefined();

    expect(sendAlert).toHaveBeenCalled();
  });
});
