import { verifyWebhookSignature, handleWebhookVerification, validateWebhookPayload } from '../../handlers/facebook-webhooks';
import crypto from 'crypto';

describe('facebook-webhooks', () => {
  const testAppSecret = 'test-secret-12345';

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      
      // Create valid signature
      const hmac = crypto.createHmac('sha256', testAppSecret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = verifyWebhookSignature(payload, signature, testAppSecret);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=invalid_hash_here';

      const result = verifyWebhookSignature(payload, invalidSignature, testAppSecret);

      expect(result).toBe(false);
    });

    it('should reject missing signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      const result = verifyWebhookSignature(payload, undefined, testAppSecret);

      expect(result).toBe(false);
    });

    it('should reject signature with wrong format', () => {
      const payload = JSON.stringify({ test: 'data' });
      const wrongFormat = 'md5=abcdef123'; // Not sha256

      const result = verifyWebhookSignature(payload, wrongFormat, testAppSecret);

      expect(result).toBe(false);
    });

    it('should reject tampered payload', () => {
      const originalPayload = JSON.stringify({ test: 'data' });
      const tamperedPayload = JSON.stringify({ test: 'tampered' });
      
      // Create signature for original
      const hmac = crypto.createHmac('sha256', testAppSecret);
      hmac.update(originalPayload);
      const signature = `sha256=${hmac.digest('hex')}`;

      // Try to verify with tampered payload
      const result = verifyWebhookSignature(tamperedPayload, signature, testAppSecret);

      expect(result).toBe(false);
    });
  });

  describe('handleWebhookVerification', () => {
    const verifyToken = 'test-verify-token-123';

    it('should return challenge for valid verification', () => {
      const query = {
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-string-123',
        'hub.verify_token': verifyToken,
      };

      const result = handleWebhookVerification(query, verifyToken);

      expect(result).toBe('challenge-string-123');
    });

    it('should reject if mode is not subscribe', () => {
      const query = {
        'hub.mode': 'unsubscribe',
        'hub.challenge': 'challenge-string-123',
        'hub.verify_token': verifyToken,
      };

      const result = handleWebhookVerification(query, verifyToken);

      expect(result).toBeNull();
    });

    it('should reject if verify token does not match', () => {
      const query = {
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-string-123',
        'hub.verify_token': 'wrong-token',
      };

      const result = handleWebhookVerification(query, verifyToken);

      expect(result).toBeNull();
    });

    it('should reject if challenge is missing', () => {
      const query = {
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
      };

      const result = handleWebhookVerification(query, verifyToken);

      expect(result).toBeNull();
    });

    it('should reject if mode is missing', () => {
      const query = {
        'hub.challenge': 'challenge-string-123',
        'hub.verify_token': verifyToken,
      };

      const result = handleWebhookVerification(query, verifyToken);

      expect(result).toBeNull();
    });
  });

  describe('validateWebhookPayload', () => {
    it('should validate correct webhook payload', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123456789',
            time: 1234567890,
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_123',
                  verb: 'create',
                  page_id: '123456789',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null payload', () => {
      const result = validateWebhookPayload(null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payload: must be an object');
    });

    it('should reject non-object payload', () => {
      const result = validateWebhookPayload('string');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payload: must be an object');
    });

    it('should reject payload with wrong object type', () => {
      const payload = {
        object: 'user',
        entry: [],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payload: object must be "page"');
    });

    it('should reject payload with missing entry array', () => {
      const payload = {
        object: 'page',
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payload: entry must be an array');
    });

    it('should reject payload with non-array entry', () => {
      const payload = {
        object: 'page',
        entry: 'not an array',
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payload: entry must be an array');
    });

    it('should reject entry with missing id', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            changes: [],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0]: missing or invalid id');
    });

    it('should reject entry with non-array changes', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: 'not an array',
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0]: changes must be an array');
    });

    it('should reject change with missing field', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {},
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0].changes[0]: missing or invalid field');
    });

    it('should reject change with missing value', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0].changes[0]: missing or invalid value');
    });

    it('should reject event change with missing event_id', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
                value: {
                  verb: 'create',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0].changes[0].value: missing or invalid event_id');
    });

    it('should reject event change with invalid verb', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_123',
                  verb: 'invalid_verb',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid entry[0].changes[0].value: invalid verb (must be create/update/delete)');
    });

    it('should accept valid update verb', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_123',
                  verb: 'update',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid delete verb', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_123',
                  verb: 'delete',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip validation of non-event fields', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'feed',
                value: {
                  // Non-event field, should not validate event-specific fields
                  some_data: 'value',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple entries and changes', () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_1',
                  verb: 'create',
                },
              },
              {
                field: 'events',
                value: {
                  event_id: 'event_2',
                  verb: 'update',
                },
              },
            ],
          },
          {
            id: '456',
            changes: [
              {
                field: 'events',
                value: {
                  event_id: 'event_3',
                  verb: 'delete',
                },
              },
            ],
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', () => {
      const payload = {
        object: 'user', // Wrong object type
        entry: [
          {
            // Missing id
            changes: 'not an array', // Invalid changes
          },
        ],
      };

      const result = validateWebhookPayload(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Invalid payload: object must be "page"');
      expect(result.errors).toContain('Invalid entry[0]: missing or invalid id');
      expect(result.errors).toContain('Invalid entry[0]: changes must be an array');
    });
  });
});

