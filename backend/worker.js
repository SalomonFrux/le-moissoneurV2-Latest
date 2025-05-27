const { Worker } = require('bullmq');
const logger = require('./src/utils/logger');
const { redisConnection, isEnabled } = require('./src/config/queue');
const scraperService = require('./src/services/scraperService');

logger.info('Starting scraper worker process...');

if (isEnabled()) {
  const worker = new Worker('scraper-queue', async job => {
    logger.info(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      await scraperService.processScrapeJob(job.data);
      logger.info(`Job ${job.id} completed successfully`);
    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);
      throw error;
    }
  }, {
    connection: redisConnection,
    concurrency: parseInt(process.env.CONCURRENT_SCRAPES, 10) || 2
  });

  worker.on('completed', job => {
    logger.info(`Job ${job.id} has completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} has failed with ${err.message}`);
  });

  logger.info('Queue worker initialized and ready to process jobs');
} else {
  logger.info('Redis is disabled, worker will run in passive mode');
  
  // Keep the process alive with a reasonable interval (5 minutes)
  const keepAliveInterval = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    logger.info('Worker process keepalive check');
  }, keepAliveInterval);
}
