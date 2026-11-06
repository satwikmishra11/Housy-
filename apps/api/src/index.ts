import type { Request, Response, Express } from 'express';

let appInstance: Express | null = null;
let initError: unknown = null;

async function getApp(): Promise<Express> {
  if (appInstance) return appInstance;
  if (initError) throw initError;

  try {
    const mod = await import('./app.js');
    appInstance = mod.app || mod.createApp();
    return appInstance as Express;
  } catch (err: unknown) {
    initError = err;
    throw err;
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err: unknown) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    const details =
      err && typeof err === 'object' && 'errors' in err
        ? (err as Record<string, unknown>).errors
        : undefined;

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        {
          success: false,
          error: {
            code: 'INITIALIZATION_FAILED',
            message: errorObj.message,
            stack: errorObj.stack,
            details,
          },
        },
        null,
        2,
      ),
    );
  }
}

export { handler, getApp };
