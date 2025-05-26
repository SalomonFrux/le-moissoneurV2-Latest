const worker = require('./src/workers/scraperWorker');
const logger = require('./src/utils/logger');

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

logger.info('Starting scraper worker process...');

// The worker is already initialized in scraperWorker.js
// Just keep the process running
process.stdin.resume();
