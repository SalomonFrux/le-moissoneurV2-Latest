const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  maxRetriesPerRequest: null
});

// Create queues
const scraperQueue = new Queue('scraper-queue', {
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

module.exports = {
  scraperQueue,
  redisConnection
};
