import { isAllowedOrigin, validateOAuthState, validateOAuthCallback, handleCORS, sanitizeErrorMessage } from '../../middleware/validation';

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

  describe('validateOAuthCallback', () => {
    it('should validate callback with code', () => {
      const query = { code: 'valid-code-123' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate callback with error param', () => {
      const query = { error: 'access_denied' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject callback without code or error', () => {
      const query = {};
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing authorization code or error parameter');
    });

    it('should reject invalid code format', () => {
      const query = { code: 'invalid code with spaces!' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid authorization code format');
    });

    it('should validate code with allowed characters', () => {
      const query = { code: 'valid-code_123.abc~xyz' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(true);
    });

    it('should validate state if present', () => {
      const state = encodeURIComponent('http://localhost:5173');
      const query = { code: 'abc123', state };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(true);
    });

    it('should reject invalid state', () => {
      const query = { code: 'abc123', state: 'invalid-url' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid state parameter format');
    });

    it('should validate without state parameter', () => {
      const query = { code: 'abc123' };
      const result = validateOAuthCallback(query);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('handleCORS', () => {
    let mockRes: any;

    beforeEach(() => {
      mockRes = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
    });

    it('should set CORS headers for allowed origin', () => {
      const mockReq = {
        headers: { origin: 'http://localhost:5173' },
        method: 'POST',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.set).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173');
      expect(mockRes.set).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockRes.set).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    });

    it('should use referer as fallback for origin', () => {
      const mockReq = {
        headers: { referer: 'http://localhost:5173/page' },
        method: 'GET',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.set).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173');
    });

    it('should reject unauthorized origin', () => {
      const mockReq = {
        headers: { origin: 'https://evil-site.com' },
        method: 'POST',
        path: '/api/sync',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.set).not.toHaveBeenCalled();
    });

    it('should handle missing origin gracefully', () => {
      const mockReq = {
        headers: {},
        method: 'POST',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.set).not.toHaveBeenCalled();
    });

    it('should handle invalid origin URL', () => {
      const mockReq = {
        headers: { origin: 'not-a-valid-url' },
        method: 'POST',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
    });

    it('should handle OPTIONS preflight request', () => {
      const mockReq = {
        headers: { origin: 'http://localhost:5173' },
        method: 'OPTIONS',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalledWith('');
    });

    it('should handle non-OPTIONS request normally', () => {
      const mockReq = {
        headers: { origin: 'http://localhost:5173' },
        method: 'GET',
      } as any;

      const result = handleCORS(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.status).not.toHaveBeenCalled();
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

