const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class ScraperStatusHandler {
  constructor() {
    this.io = null;
  }

  setIo(io) {
    this.io = io;
  }

  sendStatus(scraperId, status) {
    if (!this.io) {
      logger.error('Socket.IO not initialized');
      return;
    }

    try {
      const message = {
        scraperId: scraperId,
        ...status,
        messages: status.messages?.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString()
        })) || []
      };

      this.io.to(`scraper-${scraperId}`).emit('scraper-status', message);
      logger.info(`Status update sent to scraper room ${scraperId}`);
    } catch (error) {
      logger.error('Error sending status update:', error);
    }
  }

  joinScraperRoom(socket, scraperId) {
    socket.join(`scraper-${scraperId}`);
    logger.info(`Client joined scraper room ${scraperId}`);
  }

  leaveScraperRoom(socket, scraperId) {
    socket.leave(`scraper-${scraperId}`);
    logger.info(`Client left scraper room ${scraperId}`);
  }
}

// Export a singleton instance instead of the class
const scraperStatusHandler = new ScraperStatusHandler();
module.exports = scraperStatusHandler;