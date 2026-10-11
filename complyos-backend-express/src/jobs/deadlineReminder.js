'use strict';
/**
 * ComplianceOS — Deadline Reminder Background Job
 * Uses BullMQ if Redis is available, or in-process interval fallback.
 * Checks for upcoming deadlines at 7, 3, and 1-day intervals and triggers notifications.
 */
import { Queue, Worker } from 'bullmq';

import config from '../config.js';
import logger from '../logger.js';
import { checkDailyDeadlines } from './cronJobs.js';
import { redisAvailable } from './redisAvailable.js';

let reminderWorker = null;
let intervalId = null;

function startIntervalFallback() {
  logger.warn('Redis unavailable; Deadline Reminders using in-process interval fallback');
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  intervalId = setInterval(() => {
    checkDailyDeadlines().catch((e) => logger.warn('Deadline check error', { error: e.message }));
  }, TWELVE_HOURS);
}

export async function startDeadlineReminderJob() {
  const redisOk = await redisAvailable(config.redis.url);
  if (!redisOk) {
    startIntervalFallback();
    return;
  }

  try {
    const connection = {
      url: config.redis.url,
      maxRetriesPerRequest: null,
    };

    const reminderQueue = new Queue('deadline-reminders', { connection });

    reminderQueue.add(
      'check-deadlines',
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        removeOnComplete: true,
      }
    ).catch(() => {});

    reminderWorker = new Worker(
      'deadline-reminders',
      async () => {
        logger.info('Executing scheduled deadline reminders via BullMQ');
        await checkDailyDeadlines();
      },
      { connection }
    );

    reminderWorker.on('failed', (job, err) => {
      logger.warn('Deadline BullMQ job failed', { error: err.message });
    });

    logger.info('Deadline Reminder BullMQ worker initialized');
  } catch (err) {
    logger.warn('BullMQ setup failed for Deadline Reminders, using interval fallback', { error: err.message });
    startIntervalFallback();
  }
}

export function stopDeadlineReminderJob() {
  if (reminderWorker) reminderWorker.close();
  if (intervalId) clearInterval(intervalId);
}
