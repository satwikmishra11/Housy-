import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/index.js';
import { jobsService } from './services/jobs.service.js';
import { reminderJob } from './jobs/reminder.job.js';

let server: ReturnType<typeof app.listen> | undefined;

if (!process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.NOW_REGION) {
  server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        healthUrl: `http://localhost:${config.PORT}/api/health`,
      },
      `Housy API server running on port ${config.PORT}`,
    );

    // Run initial background jobs (slot top-up to 28 days, reminders, etc.) on startup asynchronously
    jobsService.runAllJobs().catch((err) => {
      logger.warn({ err }, 'Initial background jobs run skipped/failed on startup');
    });

    if (config.NODE_ENV !== 'test') {
      // Run reminder worker every minute in daemonized environments
      const reminderInterval = setInterval(() => {
        reminderJob.execute().catch((err) => {
          logger.warn({ err }, 'Periodic reminder job execution error');
        });
      }, 60 * 1000);
      reminderInterval.unref();
    }
  });

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

async function handleShutdown(signal: string): Promise<void> {
  logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await closePool();
        logger.info('Database pool closed.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during database pool closure.');
        process.exit(1);
      }
    });

    // Force close if graceful takes too long
    setTimeout(() => {
      logger.error('Shutdown timed out, forcefully exiting.');
      process.exit(1);
    }, 10000).unref();
  }
}

export { app };
export default app;

