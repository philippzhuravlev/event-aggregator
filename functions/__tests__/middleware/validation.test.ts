import { isAllowedOrigin, validateOAuthState, sanitizeErrorMessage } from '../../middleware/validation';

describe('validation middleware', () => {
  describe('isAllowedOrigin', () => {
    it('should allow localhost origins', () => {
      expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedOrigin('http://localhost:5000')).toBe(true);
    });

    it('should allow Firebase hosting domains', () => {
      expect(isAllowedOrigin('https://dtuevent-8105b.web.app')).toBe(true);
      expect(isAllowedOrigin('https://dtuevent-8105b.firebaseapp.com')).toBe(true);
    });

    it('should reject unauthorized origins', () => {
      expect(isAllowedOrigin('https://evil-site.com')).toBe(false);
      expect(isAllowedOrigin('http://malicious.org')).toBe(false);
    });

    it('should reject undefined origin', () => {
      expect(isAllowedOrigin(undefined)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isAllowedOrigin('')).toBe(false);
    });
  });

  describe('validateOAuthState', () => {
    it('should validate correct state with allowed origin', () => {
      const state = encodeURIComponent('http://localhost:5173');
      const result = validateOAuthState(state);

      expect(result.isValid).toBe(true);
      expect(result.origin).toBe('http://localhost:5173');
      expect(result.error).toBeNull();
    });

    it('should reject state with unauthorized origin', () => {
      const state = encodeURIComponent('https://evil-site.com');
      const result = validateOAuthState(state);

      expect(result.isValid).toBe(false);
      expect(result.origin).toBeNull();
      expect(result.error).toBe('Unauthorized redirect origin');
    });

    it('should reject empty state', () => {
      const result = validateOAuthState('');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Missing state parameter');
    });

    it('should reject invalid URL format', () => {
      const result = validateOAuthState('not-a-valid-url');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid state parameter format');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact tokens', () => {
      const message = 'Error: token=abc123xyz';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('abc123xyz');
      expect(sanitized).toContain('token=REDACTED');
    });

    it('should redact API keys', () => {
      const message = 'Invalid key=sk_live_12345';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('sk_live_12345');
      expect(sanitized).toContain('key=REDACTED');
    });

    it('should redact secrets', () => {
      const message = 'Failed with secret:abc123xyz';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('abc123xyz');
      expect(sanitized).toContain('secret=REDACTED');
    });

    it('should redact passwords', () => {
      const message = 'Auth failed password=supersecret123';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('supersecret123');
      expect(sanitized).toContain('password=REDACTED');
    });

    it('should handle case-insensitive matching', () => {
      const message = 'Error: token=abc123 key=xyz789';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('token=REDACTED');
      expect(sanitized).toContain('key=REDACTED');
    });

    it('should handle multiple secrets in same message', () => {
      const message = 'token=abc123 key=xyz789 secret=secret123';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('abc123');
      expect(sanitized).not.toContain('xyz789');
      expect(sanitized).not.toContain('secret123');
      expect(sanitized.match(/REDACTED/g)?.length).toBe(3);
    });

    it('should leave non-sensitive messages unchanged', () => {
      const message = 'Connection timeout after 30 seconds';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toBe(message);
    });
  });
});

