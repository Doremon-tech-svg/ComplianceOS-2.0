/**
 * ComplianceOS — Quick Redis reachability probe.
 *
 * BullMQ (via ioredis) retries its connection indefinitely, which floods the
 * console with ECONNREFUSED when Redis is not running. We probe once with a
 * short timeout and let callers fall back to in-process timers when Redis is
 * unavailable.
 */
import IORedis from 'ioredis';

/**
 * Resolves true if Redis accepts a connection, false otherwise.
 * @param {string} url - Redis connection URL.
 * @returns {Promise<boolean>}
 */
export function redisAvailable(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      client.quit().catch(() => {});
      resolve(ok);
    };

    const client = new IORedis(url, {
      maxRetriesPerRequest: 0,
      enableReadyCheck: true,
      connectTimeout: 1500,
      retryStrategy: () => null, // do not retry
      lazyConnect: false,
    });

    client.once('ready', () => done(true));
    client.once('error', () => done(false));
    setTimeout(() => done(false), 2000);
  });
}

export default redisAvailable;
