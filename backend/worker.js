const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') }); // Load .env from current (backend) directory

const { Worker } = require('bullmq');
const logger = require('./src/utils/logger');
const { redisConnection, isEnabled } = require('./src/config/queue');
const scraperService = require('./src/services/scraperService');
const { supabase } = require('./src/db/supabase'); // Added Supabase import

logger.info('Starting scraper worker process...');

if (isEnabled()) {
  const worker = new Worker('scraper-queue', async job => {
    logger.info(`Processing job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)}`);
    
    try {
      const { scraperId } = job.data;
      if (!scraperId) {
        throw new Error('scraperId not found in job data');
      }

      // Fetch scraper configuration from Supabase
      const { data: scraper, error: fetchError } = await supabase
        .from('scrapers')
        .select('*')
        .eq('id', scraperId)
        .single();

      if (fetchError) {
        logger.error(`Error fetching scraper ${scraperId} for job ${job.id}:`, fetchError);
        throw fetchError;
      }

      if (!scraper) {
        logger.error(`Scraper ${scraperId} not found for job ${job.id}`);
        throw new Error(`Scraper ${scraperId} not found`);
      }

      // Pass the full scraper object and jobId to executeScraper
      await scraperService.executeScraper(scraper, job.id); 
      logger.info(`Job ${job.id} completed successfully for scraper ${scraperId}`);
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
