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

  it('should expose production URLs when GCLOUD_PROJECT is set', () => {
    process.env.GCLOUD_PROJECT = 'my-project-123';
    process.env.FUNCTION_REGION = 'europe-west1';

  const constants = require('../../utils/constants');

    expect(constants.URLS.WEB_APP).toContain('https://my-project-123');
    expect(constants.URLS.OAUTH_CALLBACK).toContain('cloudfunctions.net');
  });

  it('should expose localhost URLs when not in production', () => {
    delete process.env.GCLOUD_PROJECT;
    delete process.env.FUNCTIONS_EMULATOR;

  const constants = require('../../utils/constants');

    expect(constants.URLS.WEB_APP).toBe('http://localhost:5173');
    expect(constants.URLS.OAUTH_CALLBACK).toContain('http://localhost');
  });
});
