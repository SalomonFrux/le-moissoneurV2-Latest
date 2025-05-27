const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { getPublisher, getSubscriber } = require('../utils/redisPubSub');
const REDIS_CHANNEL = 'scraper:status';

class ScraperStatusHandler {
  constructor() {
    this.io = null;
    this.isApiProcess = !!process.env.API_PROCESS; // Set this env in API process
    this.subscriber = null;
  }

  setIo(io) {
    this.io = io;
    if (this.isApiProcess) {
      this.setupRedisSubscriber();
    }
  }

  setupRedisSubscriber() {
    if (this.subscriber) return;
    this.subscriber = getSubscriber();
    this.subscriber.subscribe(REDIS_CHANNEL, (err) => {
      if (err) logger.error('Failed to subscribe to Redis channel:', err);
      else logger.info(`Subscribed to Redis channel: ${REDIS_CHANNEL}`);
    });
    this.subscriber.on('message', (channel, message) => {
      if (channel === REDIS_CHANNEL) {
        try {
          const { scraperId, ...status } = JSON.parse(message);
          this._emitStatus(scraperId, status);
        } catch (e) {
          logger.error('Failed to parse Redis pub/sub message:', e);
        }
      }
    });
  }

  sendStatus(scraperId, status) {
    if (!this.io) {
      // In worker: publish to Redis
      const publisher = getPublisher();
      publisher.publish(REDIS_CHANNEL, JSON.stringify({ scraperId, ...status }));
      return;
    }
    this._emitStatus(scraperId, status);
  }

  _emitStatus(scraperId, status) {
    try {
      const message = {
        scraperId: scraperId,
        ...status,
        messages: status.messages?.map(msg => ({
          ...msg,
          timestamp: msg.timestamp?.toISOString?.() || msg.timestamp
        })) || []
      };
      this.io.to(`scraper-${scraperId}`).emit('scraper-status', message);
      logger.info(`Status update sent to scraper room ${scraperId}`);
    } catch (error) {
      logger.error('Error sending status update:', error);
    }
  }

  joinScraperRoom(socket, scraperId) {
    if (!this.io) {
      logger.warn(`Socket.IO not initialized in scraperStatusHandler (PID: ${process.pid}). Cannot join room for ${scraperId}.`);
      return;
    }
    socket.join(`scraper-${scraperId}`);
    logger.info(`Client joined scraper room ${scraperId}`);
  }

  leaveScraperRoom(socket, scraperId) {
    if (!this.io) {
      logger.warn(`Socket.IO not initialized in scraperStatusHandler (PID: ${process.pid}). Cannot leave room for ${scraperId}.`);
      return;
    }
    socket.leave(`scraper-${scraperId}`);
    logger.info(`Client left scraper room ${scraperId}`);
  }
}

// Export a singleton instance instead of the class
const scraperStatusHandler = new ScraperStatusHandler();
module.exports = scraperStatusHandler;