// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import {
  storePageToken,
  getPageToken,
  getApiKey,
  getWebhookVerifyToken,
  checkTokenExpiry,
  markTokenExpired,
} from '../../services/secret-manager';

// Use var so they're hoisted and available in jest.mock
var mockCreateSecret: any;
var mockAddSecretVersion: any;
var mockAccessSecretVersion: any;
var mockSet: any;
var mockGet: any;
var mockDoc: any;
var mockCollection: any;

jest.mock('@google-cloud/secret-manager', () => {
  mockCreateSecret = jest.fn();
  mockAddSecretVersion = jest.fn();
  mockAccessSecretVersion = jest.fn();
  
  return {
    SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
      createSecret: mockCreateSecret,
      addSecretVersion: mockAddSecretVersion,
      accessSecretVersion: mockAccessSecretVersion,
    })),
  };
});

jest.mock('firebase-admin', () => {
  mockSet = jest.fn();
  mockGet = jest.fn();
  
  mockDoc = jest.fn(() => ({
    get: mockGet,
    set: mockSet,
  }));
  
  mockCollection = jest.fn(() => ({
    doc: mockDoc,
  }));
  
  return {
    firestore: jest.fn(() => ({
      collection: mockCollection,
    })),
  };
});

jest.mock('../../utils/logger');

describe('secret-manager service', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = admin.firestore();
    mockCreateSecret.mockReset();
    mockAddSecretVersion.mockReset();
    mockAccessSecretVersion.mockReset();
    mockSet.mockReset().mockResolvedValue(undefined);
    mockGet.mockReset();
    
    process.env.GCLOUD_PROJECT = 'test-project';
  });

  afterEach(() => {
    delete process.env.GCLOUD_PROJECT;
  });

  describe('storePageToken', () => {
    it('should create secret and store token', async () => {
      mockCreateSecret.mockResolvedValue([{}]);
      mockAddSecretVersion.mockResolvedValue([{}]);

      await storePageToken('page1', 'test-token', { db: mockDb });

      expect(mockCreateSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: 'projects/test-project',
          secretId: 'facebook-token-page1',
        })
      );
      expect(mockAddSecretVersion).toHaveBeenCalled();
    });

    it('should handle existing secret gracefully', async () => {
      mockCreateSecret.mockRejectedValue(
        new Error('Secret already exists')
      );
      mockAddSecretVersion.mockResolvedValue([{}]);

      await storePageToken('page1', 'test-token', { db: mockDb });

      expect(mockAddSecretVersion).toHaveBeenCalled();
    });

    it('should store token metadata in Firestore when db provided', async () => {
      mockCreateSecret.mockRejectedValue(
        new Error('Secret already exists')
      );
      mockAddSecretVersion.mockResolvedValue([{}]);

      await storePageToken('page1', 'test-token', { 
        db: mockDb,
        expiresInDays: 60,
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenStatus: 'valid',
          tokenExpiresInDays: 60,
        }),
        { merge: true }
      );
    });

    it('should not store metadata when db is null', async () => {
      mockCreateSecret.mockRejectedValue(
        new Error('Secret already exists')
      );
      mockAddSecretVersion.mockResolvedValue([{}]);

      await storePageToken('page1', 'test-token', { db: null });

      expect(mockCollection).not.toHaveBeenCalled();
    });

    it('should use default expiry of 60 days', async () => {
      mockCreateSecret.mockRejectedValue(
        new Error('Secret already exists')
      );
      mockAddSecretVersion.mockResolvedValue([{}]);

      await storePageToken('page1', 'test-token', { db: mockDb });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenExpiresInDays: 60,
        }),
        { merge: true }
      );
    });

    it('should throw error on non-exists secret creation failure', async () => {
      mockCreateSecret.mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(
        storePageToken('page1', 'test-token')
      ).rejects.toThrow('Cannot store token');
    });
  });

  describe('getPageToken', () => {
    it('should retrieve token from Secret Manager', async () => {
      const mockVersion = {
        payload: {
          data: Buffer.from('test-token'),
        },
      };
      mockAccessSecretVersion.mockResolvedValue([mockVersion]);

      const token = await getPageToken('page1');

      expect(token).toBe('test-token');
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/facebook-token-page1/versions/latest',
      });
    });

    it('should return null when secret not found', async () => {
      mockAccessSecretVersion.mockRejectedValue(
        new Error('Secret not found')
      );

      const token = await getPageToken('page1');

      expect(token).toBeNull();
    });

    it('should return null when payload is empty', async () => {
      const mockVersion = {
        payload: {},
      };
      mockAccessSecretVersion.mockResolvedValue([mockVersion]);

      const token = await getPageToken('page1');

      expect(token).toBeNull();
    });
  });

  describe('getApiKey', () => {
    it('should retrieve API key from Secret Manager', async () => {
      const mockVersion = {
        payload: {
          data: Buffer.from('api-key-123'),
        },
      };
      mockAccessSecretVersion.mockResolvedValue([mockVersion]);

      const apiKey = await getApiKey();

      expect(apiKey).toBe('api-key-123');
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/API_SYNC_KEY/versions/latest',
      });
    });

    it('should return null when API key not found', async () => {
      mockAccessSecretVersion.mockRejectedValue(
        new Error('Secret not found')
      );

      const apiKey = await getApiKey();

      expect(apiKey).toBeNull();
    });
  });

  describe('getWebhookVerifyToken', () => {
    it('should retrieve webhook verify token from Secret Manager', async () => {
      const mockVersion = {
        payload: {
          data: Buffer.from('webhook-verify-token-123'),
        },
      };
      mockAccessSecretVersion.mockResolvedValue([mockVersion]);

      const token = await getWebhookVerifyToken();

      expect(token).toBe('webhook-verify-token-123');
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/WEBHOOK_VERIFY_TOKEN/versions/latest',
      });
    });

    it('should return null when webhook verify token not found', async () => {
      mockAccessSecretVersion.mockRejectedValue(
        new Error('Secret not found')
      );

      const token = await getWebhookVerifyToken();

      expect(token).toBeNull();
    });
  });

  describe('checkTokenExpiry', () => {
    it('should return expiring status for tokens expiring soon', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const mockDocData = {
        exists: true,
        data: () => ({
          tokenExpiresAt: {
            toDate: () => futureDate,
          },
        }),
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 7);

      expect(status.isExpiring).toBe(true);
      expect(status.daysUntilExpiry).toBe(5);
      expect(status.expiresAt).toEqual(futureDate);
    });

    it('should return not expiring for tokens with time remaining', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const mockDocData = {
        exists: true,
        data: () => ({
          tokenExpiresAt: {
            toDate: () => futureDate,
          },
        }),
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 7);

      expect(status.isExpiring).toBe(false);
      expect(status.daysUntilExpiry).toBe(30);
    });

    it('should return expiring for tokens that already expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const mockDocData = {
        exists: true,
        data: () => ({
          tokenExpiresAt: {
            toDate: () => pastDate,
          },
        }),
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 7);

      expect(status.isExpiring).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThan(0);
    });

    it('should return expiring when page document does not exist', async () => {
      const mockDocData = {
        exists: false,
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 7);

      expect(status.isExpiring).toBe(true);
      expect(status.daysUntilExpiry).toBe(0);
      expect(status.expiresAt).toBeNull();
    });

    it('should return expiring when tokenExpiresAt is not set', async () => {
      const mockDocData = {
        exists: true,
        data: () => ({}),
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 7);

      expect(status.isExpiring).toBe(true);
      expect(status.daysUntilExpiry).toBe(0);
      expect(status.expiresAt).toBeNull();
    });

    it('should use custom warning days threshold', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const mockDocData = {
        exists: true,
        data: () => ({
          tokenExpiresAt: {
            toDate: () => futureDate,
          },
        }),
      };

      mockGet.mockResolvedValue(mockDocData);

      const status = await checkTokenExpiry(mockDb, 'page1', 3);

      expect(status.isExpiring).toBe(false);
      expect(status.daysUntilExpiry).toBe(5);
    });
  });

  describe('markTokenExpired', () => {
    it('should mark token as expired and deactivate page', async () => {
      await markTokenExpired(mockDb, 'page1');

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenStatus: 'expired',
          active: false,
        }),
        { merge: true }
      );
    });

    it('should include server timestamp', async () => {
      await markTokenExpired(mockDb, 'page1');

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenExpiredAt: expect.anything(),
        }),
        { merge: true }
      );
    });
  });
});

