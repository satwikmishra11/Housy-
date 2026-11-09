import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';

describe('Built Server Bundle Spawning (npm start path)', () => {
  const candidatePaths = [
    path.resolve(process.cwd(), 'dist/server.js'),
    path.resolve(process.cwd(), 'apps/api/dist/server.js'),
  ];

  const serverBundlePath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0]!;

  beforeAll(() => {
    // If dist/server.js does not exist yet, build it with esbuild
    if (!fs.existsSync(serverBundlePath)) {
      const srcServer = fs.existsSync(path.resolve(process.cwd(), 'src/server.ts'))
        ? path.resolve(process.cwd(), 'src/server.ts')
        : path.resolve(process.cwd(), 'apps/api/src/server.ts');

      const outDir = path.dirname(serverBundlePath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      buildSync({
        entryPoints: [srcServer],
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        outfile: serverBundlePath,
        external: ['argon2'],
      });
    }
  });

  it('spawns dist/server.js, calls app.listen, and serves GET /api/health successfully', async () => {
    expect(fs.existsSync(serverBundlePath)).toBe(true);

    const testPort = 3500 + Math.floor(Math.random() * 400);
    const child: ChildProcess = spawn(process.execPath, [serverBundlePath], {
      env: {
        ...process.env,
        PORT: String(testPort),
        NODE_ENV: 'test',
        // Clear serverless environment markers so server.ts binds to port
        VERCEL: '',
        VERCEL_ENV: '',
        AWS_LAMBDA_FUNCTION_NAME: '',
        NOW_REGION: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutData = '';
    let stderrData = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdoutData += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderrData += d.toString();
    });

    try {
      const targetUrl = `http://127.0.0.1:${testPort}/api/health`;
      let responsive = false;
      let lastResponse: Response | null = null;
      let lastJson: Record<string, unknown> | null = null;

      // Poll until the server responds or 12 seconds elapse
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        try {
          const res = await fetch(targetUrl);
          lastResponse = res;
          if (res.status === 200 || res.status === 503) {
            lastJson = (await res.json()) as Record<string, unknown>;
            responsive = true;
            break;
          }
        } catch {
          // Server still starting up, continue polling
        }
      }

      if (!responsive) {
        throw new Error(
          `Spawned server failed to answer on ${targetUrl} within timeout. Stdout: ${stdoutData}. Stderr: ${stderrData}`,
        );
      }

      expect(lastResponse).not.toBeNull();
      expect([200, 503]).toContain(lastResponse?.status);
      expect(lastJson).not.toBeNull();
      expect(lastJson).toHaveProperty('status');
      expect(lastJson).toHaveProperty('database');
      expect(lastJson).toHaveProperty('llm');
    } finally {
      // Graceful termination
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }, 20000);
});
