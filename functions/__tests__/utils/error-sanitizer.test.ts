import { sanitizeErrorMessage, sanitizeError, createErrorResponse } from '../../utils/error-sanitizer';

describe('Error Sanitizer', () => {
  describe('sanitizeErrorMessage', () => {
    it('should redact tokens', () => {
      const message = 'Failed to authenticate with token=abc123def456';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Failed to authenticate with token=REDACTED');
    });

    it('should redact bearer tokens', () => {
      const message = 'Authorization: bearer xyz789token';
      const result = sanitizeErrorMessage(message);
      // Both 'Authorization:' and 'bearer' patterns are redacted
      expect(result).toContain('REDACTED');
      expect(result).not.toContain('xyz789token');
    });

    it('should redact API keys', () => {
      const message = 'Invalid api-key: sk_test_1234567890';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Invalid api_key=REDACTED');
    });

    it('should redact secrets', () => {
      const message = 'Failed with app_secret=mysecret123';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Failed with app_secret=REDACTED');
    });

    it('should redact passwords', () => {
      const message = 'Login failed: password=mypassword123';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Login failed: password=REDACTED');
    });

    it('should redact email addresses', () => {
      const message = 'Error sending to user@example.com';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Error sending to EMAIL_REDACTED');
    });

    it('should redact Facebook access tokens', () => {
      const message = 'Facebook API error: access_token=EAABwzLixnjYBO1234';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Facebook API error: access_token=REDACTED');
    });

    it('should redact authorization codes', () => {
      const message = 'Exchange failed: code=AQD1234567890';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Exchange failed: code=REDACTED');
    });

    it('should redact secret paths', () => {
      const message = 'Failed to access /projects/myproject-123/secrets/facebook-token-456';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Failed to access /projects/PROJECT_ID/secrets/SECRET_NAME');
    });

    it('should handle multiple sensitive patterns in one message', () => {
      const message = 'Auth failed: token=abc123, key=xyz789, password=secret123';
      const result = sanitizeErrorMessage(message);
      expect(result).toContain('token=REDACTED');
      expect(result).toContain('key=REDACTED');
      expect(result).toContain('password=REDACTED');
    });

    it('should handle empty or invalid input', () => {
      expect(sanitizeErrorMessage('')).toBe('An error occurred');
      expect(sanitizeErrorMessage(null as any)).toBe('An error occurred');
      expect(sanitizeErrorMessage(undefined as any)).toBe('An error occurred');
    });

    it('should handle non-string input gracefully', () => {
      expect(sanitizeErrorMessage(123 as any)).toBe('An error occurred');
      expect(sanitizeErrorMessage({} as any)).toBe('An error occurred');
    });

    it('should not modify safe messages', () => {
      const message = 'Connection timeout after 30 seconds';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe(message);
    });

    it('should be case-insensitive for sensitive patterns', () => {
      const message = 'Failed with TOKEN=abc123 and Key=xyz789';
      const result = sanitizeErrorMessage(message);
      expect(result).toContain('token=REDACTED');
      expect(result).toContain('key=REDACTED');
    });
  });

  describe('sanitizeError', () => {
    it('should handle Error objects', () => {
      const error = new Error('Database connection failed with password=secret123');
      const result = sanitizeError(error);
      expect(result.message).toBe('Database connection failed with password=REDACTED');
      expect(result.type).toBe('Error');
    });

    it('should handle string errors', () => {
      const error = 'Token expired: token=abc123';
      const result = sanitizeError(error);
      expect(result.message).toBe('Token expired: token=REDACTED');
    });

    it('should handle objects with message property', () => {
      const error = { message: 'Failed with key=xyz789', code: 500 };
      const result = sanitizeError(error);
      expect(result.message).toBe('Failed with key=REDACTED');
    });

    it('should handle null/undefined errors', () => {
      expect(sanitizeError(null)).toEqual({ message: 'An unknown error occurred' });
      expect(sanitizeError(undefined)).toEqual({ message: 'An unknown error occurred' });
    });

    it('should convert non-string/non-Error objects to string', () => {
      const error = { status: 500, data: 'error' };
      const result = sanitizeError(error);
      expect(result.message).toBeTruthy();
    });

    it('should preserve error type information', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom error with token=abc123');
      const result = sanitizeError(error);
      expect(result.type).toBe('CustomError');
      expect(result.message).toBe('Custom error with token=REDACTED');
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response without details by default', () => {
      const error = new Error('Database failed with password=secret123');
      const result = createErrorResponse(error);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('An error occurred');
      expect(result.timestamp).toBeTruthy();
      expect(result.details).toBeUndefined();
    });

    it('should include sanitized details when requested', () => {
      const error = new Error('Token invalid: token=abc123');
      const result = createErrorResponse(error, true);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('An error occurred');
      expect(result.details).toBe('Token invalid: token=REDACTED');
      expect(result.timestamp).toBeTruthy();
    });

    it('should format timestamp as ISO string', () => {
      const error = new Error('Test error');
      const result = createErrorResponse(error);
      
      // Check if timestamp is a valid ISO string
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });

    it('should handle string errors', () => {
      const error = 'Simple error string with key=xyz789';
      const result = createErrorResponse(error, true);
      
      expect(result.success).toBe(false);
      expect(result.details).toBe('Simple error string with key=REDACTED');
    });

    it('should handle null/undefined errors', () => {
      const result = createErrorResponse(null, true);
      
      expect(result.success).toBe(false);
      expect(result.details).toBe('An unknown error occurred');
    });

    it('should respect includeDetails flag', () => {
      const error = new Error('Sensitive data: password=secret123');
      
      const withoutDetails = createErrorResponse(error, false);
      expect(withoutDetails.details).toBeUndefined();
      
      const withDetails = createErrorResponse(error, true);
      expect(withDetails.details).toBeTruthy();
      expect(withDetails.details).not.toContain('secret123');
    });
  });

  describe('Integration scenarios', () => {
    it('should protect Facebook token leakage', () => {
      const error = new Error(
        'Facebook API error: Failed to fetch events. Token: EAABwzLixnjYBO123456789, ' +
        'Access Token: abc123def456'
      );
      const result = sanitizeError(error);
      
      expect(result.message).not.toContain('EAABwzLixnjYBO123456789');
      expect(result.message).not.toContain('abc123def456');
      expect(result.message).toContain('REDACTED');
    });

    it('should protect Secret Manager paths', () => {
      const error = new Error(
        'Failed to access secret at /projects/dtuevent-8105b/secrets/facebook-token-123456'
      );
      const result = sanitizeError(error);
      
      expect(result.message).not.toContain('dtuevent-8105b');
      expect(result.message).not.toContain('facebook-token-123456');
      expect(result.message).toContain('PROJECT_ID');
      expect(result.message).toContain('SECRET_NAME');
    });

    it('should protect API keys in authorization headers', () => {
      const error = new Error(
        'Unauthorized: Authorization header "Bearer sk_live_1234567890" is invalid'
      );
      const result = sanitizeError(error);
      
      expect(result.message).not.toContain('sk_live_1234567890');
      expect(result.message).toContain('REDACTED');
    });

    it('should handle complex error messages with multiple sensitive values', () => {
      const error = new Error(
        'OAuth failed: code=AQD123, state=http://localhost:3000, ' +
        'client_secret=abc123, token=xyz789, email: user@example.com'
      );
      const result = sanitizeError(error);
      
      expect(result.message).not.toContain('AQD123');
      expect(result.message).not.toContain('abc123');
      expect(result.message).not.toContain('xyz789');
      expect(result.message).not.toContain('user@example.com');
      expect(result.message).toContain('REDACTED');
    });
  });
});
