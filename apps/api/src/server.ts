import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/index.js';
import { runSlotGeneration } from './jobs/slot-generator.job.js';
import { reminderJob } from './jobs/reminder.job.js';
import { slotRepository } from './repositories/slot.repository.js';

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      healthUrl: `http://localhost:${config.PORT}/api/health`,
    },
    `Housy API server running on port ${config.PORT}`,
  );

  // Run initial slot generation on startup asynchronously
  if (config.NODE_ENV !== 'test') {
    runSlotGeneration(slotRepository, 21).catch((err) => {
      logger.warn({ err }, 'Initial slot generation skipped/failed on startup');
    });

    // Run reminder worker every minute
    const reminderInterval = setInterval(() => {
      reminderJob.execute().catch((err) => {
        logger.warn({ err }, 'Periodic reminder job execution error');
      });
    }, 60 * 1000);
    reminderInterval.unref();
  }
});

async function handleShutdown(signal: string): Promise<void> {
  logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);

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

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

