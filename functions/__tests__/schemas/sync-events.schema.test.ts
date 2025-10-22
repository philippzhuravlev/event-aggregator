import { syncEventsQuerySchema } from '../../schemas/sync-events.schema';

describe('syncEventsQuerySchema', () => {
  it('defaults daysBack to 30 when absent and transforms to number', () => {
    const parsed = syncEventsQuerySchema.parse({});
    expect(parsed.daysBack).toBe(30);
  });

  it('parses force true/false strings to boolean', () => {
    const parsedTrue = syncEventsQuerySchema.parse({ force: 'true' });
    expect(parsedTrue.force).toBe(true);

    const parsedFalse = syncEventsQuerySchema.parse({ force: 'false' });
    expect(parsedFalse.force).toBe(false);

    const parsedUndefined = syncEventsQuerySchema.parse({});
    expect(parsedUndefined.force).toBe(false);
  });

  it('validates daysBack min and max and integer', () => {
    expect(() => syncEventsQuerySchema.parse({ daysBack: '0' })).toThrow();
    expect(() => syncEventsQuerySchema.parse({ daysBack: '366' })).toThrow();
    expect(() => syncEventsQuerySchema.parse({ daysBack: '1.5' })).toThrow();
    expect(() => syncEventsQuerySchema.parse({ daysBack: '15' })).not.toThrow();
  });

  it('accepts pageId as optional string', () => {
    const parsed = syncEventsQuerySchema.parse({ pageId: 'p123' });
    expect(parsed.pageId).toBe('p123');
  });
});
