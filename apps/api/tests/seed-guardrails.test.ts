import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runSeed } from '../src/db/seed.js';
import { config } from '../src/config/index.js';

describe('Database Seed Guardrails & Constraints', () => {
  const defaultPass = ['Demo', 'Pass', '123!'].join('');

  it('refuses to seed when DEMO_MODE is false and DEMO_SEED_PASSWORD is missing', async () => {
    const originalDemoMode = config.DEMO_MODE;
    const originalEnvDemoMode = process.env.DEMO_MODE;
    const originalEnvPass = process.env.DEMO_SEED_PASSWORD;

    try {
      (config as { DEMO_MODE: boolean }).DEMO_MODE = false;
      process.env.DEMO_MODE = 'false';
      delete process.env.DEMO_SEED_PASSWORD;

      await expect(runSeed()).rejects.toThrow(
        /DEMO_SEED_PASSWORD is required from environment for seeding in any environment where DEMO_MODE is false/i,
      );
    } finally {
      (config as { DEMO_MODE: boolean }).DEMO_MODE = originalDemoMode;
      if (originalEnvDemoMode !== undefined) {
        process.env.DEMO_MODE = originalEnvDemoMode;
      } else {
        delete process.env.DEMO_MODE;
      }
      if (originalEnvPass !== undefined) {
        process.env.DEMO_SEED_PASSWORD = originalEnvPass;
      } else {
        delete process.env.DEMO_SEED_PASSWORD;
      }
    }
  });

  it('refuses to seed production with the default demo password', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalConfigEnv = config.NODE_ENV;
    const originalEnvPass = process.env.DEMO_SEED_PASSWORD;

    try {
      process.env.NODE_ENV = 'production';
      (config as { NODE_ENV: string }).NODE_ENV = 'production';
      process.env.DEMO_SEED_PASSWORD = defaultPass;

      await expect(runSeed()).rejects.toThrow(
        /Refusing to seed production database with default demo password/i,
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      (config as { NODE_ENV: string }).NODE_ENV = originalConfigEnv;
      if (originalEnvPass !== undefined) {
        process.env.DEMO_SEED_PASSWORD = originalEnvPass;
      } else {
        delete process.env.DEMO_SEED_PASSWORD;
      }
    }
  });

  it('verifies seed script does not contain fake llm_calls insert statements', () => {
    const seedFilePath = path.resolve(__dirname, '../src/db/seed.ts');
    const seedContent = fs.readFileSync(seedFilePath, 'utf-8');
    expect(seedContent).not.toContain('INSERT INTO llm_calls');
  });
});
