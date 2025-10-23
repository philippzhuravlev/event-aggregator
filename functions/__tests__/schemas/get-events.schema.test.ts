import { getEventsQuerySchema } from '../../schemas/get-events.schema';

describe('getEventsQuerySchema', () => {
  it('applies default limit when missing', () => {
    const parsed = getEventsQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
  });

  it('parses provided limit and enforces bounds', () => {
    const parsed = getEventsQuerySchema.parse({ limit: '20' });
    expect(parsed.limit).toBe(20);

    // too small
    expect(() => getEventsQuerySchema.parse({ limit: '0' })).toThrow();
    // too large
    expect(() => getEventsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('parses upcoming flag correctly', () => {
    expect(getEventsQuerySchema.parse({ upcoming: 'false' }).upcoming).toBe(false);
    expect(getEventsQuerySchema.parse({ upcoming: 'true' }).upcoming).toBe(true);
    // default (when missing) should be true
    expect(getEventsQuerySchema.parse({}).upcoming).toBe(true);
  });

  it('validates search length and trimming', () => {
    const parsed = getEventsQuerySchema.parse({ search: '  hello  ' });
    expect(parsed.search).toBe('hello');

    // empty after trim should fail
    expect(() => getEventsQuerySchema.parse({ search: '   ' })).toThrow();

    // too long
    const tooLong = 'x'.repeat(201);
    expect(() => getEventsQuerySchema.parse({ search: tooLong })).toThrow();
  });
});