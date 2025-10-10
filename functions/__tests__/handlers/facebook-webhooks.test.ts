import { verifyWebhookSignature, handleWebhookVerification } from '../../handlers/facebook-webhooks';
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
});

