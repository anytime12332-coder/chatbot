/**
 * Request queue to handle concurrent AI requests
 * Using p-queue v6 (CommonJS compatible)
 */
let aiQueue;

try {
  const PQueue = require('p-queue');
  // p-queue v6 exports default as a class directly
  const QueueClass = PQueue.default || PQueue;
  aiQueue = new QueueClass({
    concurrency: 10,
    intervalCap: 50,
    interval: 60 * 1000,
    timeout: 120000,
    throwOnTimeout: true,
  });
  console.log('[Queue] AI request queue initialized (concurrency: 10)');
} catch (err) {
  console.error('[Queue] Failed to initialize p-queue:', err.message);
  // Fallback: no queue, just run directly
  aiQueue = {
    add: (fn) => fn(),
    on: () => {},
  };
  console.log('[Queue] Using fallback (no queue)');
}

module.exports = { aiQueue };
