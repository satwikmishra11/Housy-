import type { Request, Response } from 'express';
import { app, createApp } from './app.js';

const serverlessHandler = (req: Request, res: Response): void => {
  try {
    app(req, res);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          {
            success: false,
            error: {
              code: 'SERVERLESS_INVOCATION_ERROR',
              message: error.message,
              stack: error.stack,
            },
          },
          null,
          2,
        ),
      );
    }
  }
};

Object.setPrototypeOf(serverlessHandler, app);
Object.assign(serverlessHandler, app);

export { app, createApp, serverlessHandler };
export default serverlessHandler;
