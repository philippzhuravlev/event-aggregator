import { describe, it, expect, beforeEach } from '@jest/globals';

describe('constants environment variations', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // clear module cache
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should expose production environment constants when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';

    const constants = require('../../utils/constants');

    expect(constants.IS_PRODUCTION).toBe(true);
    expect(constants.IS_DEVELOPMENT).toBe(false);
  });

  it('should expose development environment constants when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';

    const constants = require('../../utils/constants');

    expect(constants.IS_PRODUCTION).toBe(false);
    expect(constants.IS_DEVELOPMENT).toBe(true);
  });
});
