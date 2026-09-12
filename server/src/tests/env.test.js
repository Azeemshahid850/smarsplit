import { describe, it, expect, afterEach } from 'vitest';
import { assertEnv } from '../config/env.js';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

const production = (overrides = {}) => {
  process.env = {
    ...original,
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://localhost/x',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    CLIENT_URL: 'https://smartsplit.vercel.app',
    ...overrides,
  };
};

describe('assertEnv', () => {
  it('passes with a complete production environment', () => {
    production();
    expect(() => assertEnv()).not.toThrow();
  });

  it('refuses a missing database URI', () => {
    production({ MONGO_URI: '' });
    expect(() => assertEnv()).toThrow('Missing required env vars: MONGO_URI');
  });

  it('refuses the example secret values in production', () => {
    production({ JWT_ACCESS_SECRET: 'replace_with_long_random_string' });
    expect(() => assertEnv()).toThrow('still hold the example value');
  });

  it('refuses short secrets in production', () => {
    production({ JWT_ACCESS_SECRET: 'short' });
    expect(() => assertEnv()).toThrow('at least 32 characters');
  });

  it('refuses identical access and refresh secrets', () => {
    production({ JWT_REFRESH_SECRET: 'a'.repeat(64) });
    expect(() => assertEnv()).toThrow('must differ');
  });

  it('refuses a missing CLIENT_URL in production', () => {
    production({ CLIENT_URL: '' });
    expect(() => assertEnv()).toThrow('CLIENT_URL is required');
  });

  it('is lenient outside production', () => {
    process.env = { ...original, NODE_ENV: 'development', MONGO_URI: 'mongodb://localhost/x', JWT_ACCESS_SECRET: 'x', JWT_REFRESH_SECRET: 'y' };
    expect(() => assertEnv()).not.toThrow();
  });
});
