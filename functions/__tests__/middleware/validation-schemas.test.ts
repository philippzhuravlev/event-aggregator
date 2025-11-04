import { z } from 'zod';
import { validateQueryParams, validateBody } from '../../middleware/validation-schemas';
import { logger } from '../../utils/logger';

jest.mock('../../utils/logger');

describe('validation-schemas helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateQueryParams', () => {
    it('parses valid query params using schema transforms', () => {
      const schema = z.object({
        limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 10)).pipe(z.number().int()),
      });

      const req = { query: { limit: '5' }, path: '/test' } as unknown as Request;
      const res = validateQueryParams(req, schema);

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ limit: 5 });
    });

    it('returns errors and logs warning for invalid query', () => {
      const schema = z.object({
        limit: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().min(1))
      });

      const req = { query: { limit: 'not-a-number' }, path: '/test' } as unknown as Request;
      const res = validateQueryParams(req, schema);

      expect(res.success).toBe(false);
      expect(res.errors && res.errors.length).toBeGreaterThan(0);
      expect((logger.warn as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('validateBody', () => {
    it('parses valid body using schema', () => {
      const schema = z.object({ name: z.string() });
      const req = { body: { name: 'Alice' }, path: '/test' } as unknown as Request;
      const res = validateBody(req, schema);

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ name: 'Alice' });
    });

    it('returns errors and logs warning for invalid body', () => {
      const schema = z.object({ age: z.number().int().min(0) });
      const req = { body: { age: -5 }, path: '/test' } as unknown as Request;
      const res = validateBody(req, schema);

      expect(res.success).toBe(false);
      expect(res.errors && res.errors.length).toBeGreaterThan(0);
      expect((logger.warn as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('handles unexpected non-Zod errors and logs error', () => {
      // Create a fake schema-like object whose parse throws a non-Zod Error
  const badSchema = { parse: () => { throw new Error('boom'); } } as unknown as z.ZodTypeAny;
      const req = { body: { foo: 'bar' }, path: '/test' } as unknown as Request;
      const res = validateBody(req, badSchema);

      expect(res.success).toBe(false);
      expect(res.errors).toBeDefined();
      expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
