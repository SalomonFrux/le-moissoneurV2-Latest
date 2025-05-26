const { Worker } = require('bullmq');
const { playwrightScraper } = require('../scrapers/playwrightScraper');
const { redisConnection } = require('../config/queue');
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');

const worker = new Worker('scraper-queue', async (job) => {
  const { scraperId, url, selectors } = job.data;
  logger.info(`Starting job ${job.id} for scraper ${scraperId}`);

  try {
    // Update scraper status to running
    await supabase
      .from('scrapers')
      .update({ 
        status: 'running',
        last_run: new Date().toISOString()
      })
      .eq('id', scraperId);

    // Run the scraper
    const results = await playwrightScraper(url, selectors, scraperId);

    // Update scraper status to completed
    await supabase
      .from('scrapers')
      .update({ 
        status: 'completed',
        last_run: new Date().toISOString(),
        data_count: (results || []).length
      })
      .eq('id', scraperId);

    return results;
  } catch (error) {
    logger.error(`Job ${job.id} failed:`, error);
    
    // Update scraper status to error
    await supabase
      .from('scrapers')
      .update({ 
        status: 'error',
        last_run: new Date().toISOString()
      })
      .eq('id', scraperId);

    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: parseInt(process.env.MAX_CONCURRENT_JOBS, 10) || 2
});

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
  logger.error(`Job ${job?.id} failed:`, error);
});

module.exports = worker;
