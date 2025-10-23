const mockCollection = jest.fn().mockReturnValue({ doc: jest.fn().mockReturnThis(), get: jest.fn() });
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({ collection: mockCollection })),
}));

import { handleScheduledTokenRefresh } from '../../handlers/token-refresh';

jest.mock('../../services/firestore-service', () => ({
  getActivePages: jest.fn().mockResolvedValue([{ id: '123', name: 'Test Page' }]),
}));

jest.mock('../../services/secret-manager', () => ({
  getPageToken: jest.fn().mockResolvedValue('old-token'),
  storePageToken: jest.fn().mockResolvedValue(undefined),
  checkTokenExpiry: jest.fn().mockResolvedValue({ isExpiring: true, daysUntilExpiry: 1, expiresAt: new Date() }),
  markTokenExpired: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/facebook-api', () => ({
  exchangeForLongLivedToken: jest.fn().mockResolvedValue('new-long-token'),
}));

jest.mock('../../services/mail-service', () => ({
  createMailTransporter: jest.fn().mockReturnValue(null),
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

describe('handleScheduledTokenRefresh', () => {
  it('refreshes expiring token and stores new token', async () => {
    const mailConfig = {
      host: 'smtp.gmail.com',
      user: 'test@example.com',
      pass: 'test-pass',
      port: 587,
      from: 'no-reply@dtuevent.dk',
    };
    
    await expect(handleScheduledTokenRefresh('appId', 'appSecret', mailConfig)).resolves.toBeUndefined();
    const { storePageToken } = require('../../services/secret-manager');
    expect(storePageToken).toHaveBeenCalledWith('123', 'new-long-token', expect.any(Object));
  });
});
