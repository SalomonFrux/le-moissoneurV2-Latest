const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisConnection = null;
let scraperQueue = null;

// Only initialize Redis if enabled
if (process.env.REDIS_ENABLED === 'true') {
  try {
    redisConnection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // Create queues
    scraperQueue = new Queue('scraper-queue', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: false,
        removeOnFail: false
      }
    });

    logger.info('Redis connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
  }
} else {
  logger.info('Redis is disabled, queue functionality will not be available');
}

module.exports = {
  scraperQueue,
  redisConnection,
  isEnabled: () => process.env.REDIS_ENABLED === 'true'
};
