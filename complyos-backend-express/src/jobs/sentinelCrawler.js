/**
 * ComplianceOS — SENTINEL Crawler Background Job
 * Uses BullMQ if Redis is reachable, otherwise runs graceful in-process timer.
 */
import { Queue, Worker } from 'bullmq';
import config from '../config.js';
import logger from '../logger.js';
import { runSentinelCrawl } from '../agents/sentinel/index.js';
import { redisAvailable } from './redisAvailable.js';

let sentinelWorker = null;
let intervalId = null;

function startIntervalFallback() {
  logger.warn('Redis unavailable; SENTINEL using in-process interval fallback');
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  intervalId = setInterval(() => {
    runSentinelCrawl().catch((e) => logger.warn('SENTINEL interval error', { error: e.message }));
  }, TWENTY_FOUR_HOURS);
}

export async function startSentinelJob() {
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

    const sentinelQueue = new Queue('sentinel-crawl', { connection });

    // Schedule repeatable crawl job every 24 hours
    sentinelQueue.add(
      'daily-crawl',
      {},
      {
        repeat: { pattern: '0 2 * * *' }, // 2:00 AM daily
        removeOnComplete: true,
      }
    ).catch(() => {});

    sentinelWorker = new Worker(
      'sentinel-crawl',
      async () => {
        logger.info('Executing scheduled SENTINEL crawl via BullMQ');
        await runSentinelCrawl();
      },
      { connection }
    );

    sentinelWorker.on('failed', (job, err) => {
      logger.warn('SENTINEL BullMQ job failed', { error: err.message });
    });

    logger.info('SENTINEL BullMQ worker initialized');
  } catch (err) {
    logger.warn('BullMQ setup failed for SENTINEL, falling back to interval', { error: err.message });
    startIntervalFallback();
  }
}

export function stopSentinelJob() {
  if (sentinelWorker) sentinelWorker.close();
  if (intervalId) clearInterval(intervalId);
}

export default { startSentinelJob, stopSentinelJob };
