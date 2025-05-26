const setupWizardService = require('../services/setupWizardService');
const logger = require('../utils/logger');

class WebSocketHandler {
  constructor(io) {
    this.io = io;
    this.setupNamespace = io.of('/setup');
    this.scraperNamespace = io.of('/scraper');
    
    this.setupNamespace.on('connection', this.handleSetupConnection.bind(this));
    this.scraperNamespace.on('connection', this.handleScraperConnection.bind(this));
  }

  handleSetupConnection(socket) {
    logger.info(`Setup client connected: ${socket.id}`);

    socket.on('joinSession', (sessionId) => {
      socket.join(`setup:${sessionId}`);
      logger.info(`Client ${socket.id} joined setup session ${sessionId}`);
    });

    socket.on('elementSelected', async (data) => {
      try {
        const { sessionId, elementInfo, fieldName } = data;
        const result = await setupWizardService.handleElementSelection(
          sessionId,
          elementInfo,
          fieldName
        );
        
        this.setupNamespace.to(`setup:${sessionId}`).emit('selectionResult', {
          success: true,
          fieldName,
          result
        });
      } catch (error) {
        logger.error('Error handling element selection:', error);
        socket.emit('selectionResult', {
          success: false,
          error: error.message
        });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Setup client disconnected: ${socket.id}`);
    });
  }

  handleScraperConnection(socket) {
    logger.info(`Scraper client connected: ${socket.id}`);

    socket.on('joinScraper', (scraperId) => {
      socket.join(`scraper:${scraperId}`);
      logger.info(`Client ${socket.id} joined scraper ${scraperId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Scraper client disconnected: ${socket.id}`);
    });
  }

  updateScraperStatus(scraperId, status) {
    this.scraperNamespace.to(`scraper:${scraperId}`).emit('statusUpdate', status);
  }
}

let instance = null;

module.exports = {
  initialize: (io) => {
    if (!instance) {
      instance = new WebSocketHandler(io);
    }
    return instance;
  },
  getInstance: () => {
    if (!instance) {
      throw new Error('WebSocketHandler not initialized');
    }
    return instance;
  }
};
