import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setup } from './global-setup.js';
import { resetDatabase } from '../src/db/reset.js';

describe('Vitest Global Setup & Test DB Safety Invariants', () => {
  const originalTestDbUrl = process.env.TEST_DATABASE_URL;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = originalTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }

    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }

    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  it('fails fast with a clear fatal error message when TEST_DATABASE_URL does not end in _test', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://housy_user:housy_password@localhost:5432/housy_db';

    await expect(setup()).rejects.toThrow(
      'FATAL: Test database name must end in "_test". Received database name: "housy_db". Refusing to run tests against non-test database.',
    );
  });

  it('fails fast when connection string has query params but non-test DB name', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://housy_user:housy_password@localhost:5432/production_data?sslmode=disable';

    await expect(setup()).rejects.toThrow(
      'FATAL: Test database name must end in "_test". Received database name: "production_data". Refusing to run tests against non-test database.',
    );
  });

  it('passes validation and runs successfully against a test database ending in _test', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://housy_user:housy_password@localhost:5432/housy_test';

    await expect(setup()).resolves.toBeUndefined();
  });

  it('resetDatabase() rejects non-test database when called under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      resetDatabase('postgres://housy_user:housy_password@localhost:5432/housy_db'),
    ).rejects.toThrow(
      'FATAL: Refusing to reset test database "housy_db". Database name must end in "_test".',
    );
  });
});
