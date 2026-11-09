import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runner } from 'node-pg-migrate';
import * as seedModule from '../src/db/seed.js';
import { setupProdDatabase } from '../src/db/setup-prod.js';

vi.mock('node-pg-migrate', () => ({
  runner: vi.fn(),
}));

describe('db:setup:prod routine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies migrations and skips demo seeds when demoMode is false', async () => {
    vi.mocked(runner).mockResolvedValueOnce([
      { name: '001_create_tables', timestamp: 1 },
      { name: '002_create_indexes', timestamp: 2 },
    ] as unknown as Awaited<ReturnType<typeof runner>>);
    const seedSpy = vi.spyOn(seedModule, 'runSeed').mockResolvedValueOnce();

    const result = await setupProdDatabase({
      databaseUrl: 'postgres://housy_user:housy_password@localhost:5432/housy_test',
      demoMode: false,
    });

    expect(runner).toHaveBeenCalled();
    expect(seedSpy).not.toHaveBeenCalled();
    expect(result.migrationsCount).toBe(2);
    expect(result.seeded).toBe(false);
    expect(result.migrationsApplied).toEqual(['001_create_tables', '002_create_indexes']);

    seedSpy.mockRestore();
  });

  it('applies migrations and runs demo seeds when demoMode is true', async () => {
    vi.mocked(runner).mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof runner>>);
    const seedSpy = vi.spyOn(seedModule, 'runSeed').mockResolvedValueOnce();

    const result = await setupProdDatabase({
      databaseUrl: 'postgres://housy_user:housy_password@localhost:5432/housy_test',
      demoMode: true,
    });

    expect(runner).toHaveBeenCalled();
    expect(seedSpy).toHaveBeenCalled();
    expect(result.migrationsCount).toBe(0);
    expect(result.seeded).toBe(true);

    seedSpy.mockRestore();
  });
});
