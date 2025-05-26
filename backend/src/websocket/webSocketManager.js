const { Server } = require('socket.io');
const logger = require('../utils/logger');

class WebSocketManager {
  constructor() {
    this.io = null;
    this.activeConnections = new Map();
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? ['https://salomonks-moissonneur.vercel.app', 'https://le-moissoneur.vercel.app', 'https://api.sikso.ch']
          : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      logger.info(`New WebSocket connection: ${socket.id}`);

      // Handle scraper monitoring subscription
      socket.on('subscribeScraper', (scraperId) => {
        logger.info(`Client ${socket.id} subscribed to scraper ${scraperId}`);
        socket.join(`scraper-${scraperId}`);
        this.activeConnections.set(socket.id, scraperId);
      });

      // Handle unsubscribe
      socket.on('unsubscribeScraper', (scraperId) => {
        logger.info(`Client ${socket.id} unsubscribed from scraper ${scraperId}`);
        socket.leave(`scraper-${scraperId}`);
        this.activeConnections.delete(socket.id);
      });

      // Handle setup wizard events
      socket.on('startSetup', (sessionId) => {
        logger.info(`Client ${socket.id} started setup session ${sessionId}`);
        socket.join(`setup-${sessionId}`);
      });

      socket.on('endSetup', (sessionId) => {
        logger.info(`Client ${socket.id} ended setup session ${sessionId}`);
        socket.leave(`setup-${sessionId}`);
      });

      socket.on('disconnect', () => {
        const scraperId = this.activeConnections.get(socket.id);
        if (scraperId) {
          logger.info(`Client ${socket.id} disconnected from scraper ${scraperId}`);
          this.activeConnections.delete(socket.id);
        }
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Emit scraper status update
   * @param {string} scraperId - The ID of the scraper
   * @param {Object} status - Status update object
   */
  emitScraperStatus(scraperId, status) {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(`scraper-${scraperId}`).emit('scraperStatus', {
      scraperId,
      ...status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit setup wizard update
   * @param {string} sessionId - Setup session ID
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  emitSetupUpdate(sessionId, event, data) {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(`setup-${sessionId}`).emit('setupUpdate', {
      sessionId,
      event,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit error notification
   * @param {string} scraperId - The ID of the scraper
   * @param {Object} error - Error details
   */
  emitError(scraperId, error) {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(`scraper-${scraperId}`).emit('error', {
      scraperId,
      error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast system alert to all connected clients
   * @param {Object} alert - Alert details
   */
  broadcastAlert(alert) {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.emit('systemAlert', {
      ...alert,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new WebSocketManager();
