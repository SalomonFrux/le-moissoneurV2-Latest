const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisConnection = null;
let scraperQueue = null;

// Add this log
logger.info(`[QUEUE_CONFIG] Initializing: REDIS_ENABLED is \"${process.env.REDIS_ENABLED}\" (type: ${typeof process.env.REDIS_ENABLED})`);

// Only initialize Redis if enabled
if (process.env.REDIS_ENABLED === 'true') {
  try {
    // Create Redis connection with improved configuration
    redisConnection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
      keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE, 10) || 30000,
      retryStrategy: (times) => {
        if (process.env.REDIS_RETRY_STRATEGY === 'false') return null;
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        logger.error('Redis connection error:', err);
        return true; // Reconnect on error
      }
    });

    // Add this log
    if (redisConnection) {
      logger.info('[QUEUE_CONFIG] redisConnection object created.');
    } else {
      logger.warn('[QUEUE_CONFIG] redisConnection object is NULL after new Redis().');
    }

    // Add connection event listeners
    redisConnection.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisConnection.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    redisConnection.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisConnection.on('close', () => {
      logger.warn('Redis connection closed');
    });

    // Create queue with connection
    scraperQueue = new Queue('scraper-queue', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      }
    });

    // Verify queue connection
    scraperQueue.on('error', (err) => {
      logger.error('Queue error:', err);
    });

    scraperQueue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
    });

    logger.info('Redis and Queue initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis and Queue:', error);
    // Add this log
    logger.error('[QUEUE_CONFIG] Error during Redis/Queue initialization. redisConnection might be null.');
    process.exit(1);
  }
} else {
  logger.warn('Redis is disabled - Queue functionality will not be available');
}

// Add this log
if (redisConnection) {
  logger.info(`[QUEUE_CONFIG] Exporting: redisConnection status is \"${redisConnection.status}\"`);
} else {
  logger.warn('[QUEUE_CONFIG] Exporting: redisConnection is NULL.');
}

// Helper function to check if Redis is connected
const isRedisConnected = () => {
  return redisConnection && redisConnection.status === 'ready';
};

module.exports = {
  scraperQueue,
  redisConnection,
  isEnabled: () => process.env.REDIS_ENABLED === 'true',
  isConnected: isRedisConnected
};
