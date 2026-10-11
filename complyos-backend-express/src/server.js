'use strict';
/**
 * ComplianceOS — Server Entry Point
 */
import app from './app.js';
import config from './config.js';
import logger from './logger.js';
import prisma from './db.js';
import { startSentinelJob } from './jobs/sentinelCrawler.js';
import { startDeadlineReminderJob } from './jobs/deadlineReminder.js';

async function main() {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connected via Prisma');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    if (config.env === 'production') {
      process.exit(1);
    }
    logger.warn('Continuing startup without database (development mode). DB-dependent routes will fail at runtime.');
  }

  try {
    await startSentinelJob();
    await startDeadlineReminderJob();
    logger.info('Background jobs started');
  } catch (err) {
    logger.warn('Background jobs failed to start', { error: err.message });
  }

  const server = app.listen(config.port, () => {
    logger.info(`ComplianceOS API running`, {
      port: config.port,
      env: config.env,
      stack: 'PERN (PostgreSQL + Express + React + Node.js)',
    });
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server closed, DB disconnected');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message });
  process.exit(1);
});
