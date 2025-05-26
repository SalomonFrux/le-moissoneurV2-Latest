const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};

// Set winston colors
winston.addColors(colors);

// Create the logger format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  ),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

// Create file transport for rotating logs
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join('logs', '%DATE%-app.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels,
  format,
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'), 
      level: 'error',
      format 
    }),
    // Write all logs to rotating files
    fileRotateTransport,
    // Write all logs with level 'info' and below to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
  ],
});

// Add performance logging methods
logger.performance = (label, durationMs, metadata = {}) => {
  logger.info(`Performance [${label}]: ${durationMs}ms`, { 
    type: 'performance',
    durationMs,
    ...metadata
  });
};

// Add activity logging method
logger.activity = (userId, action, details = {}) => {
  logger.info(`User Activity [${userId}]: ${action}`, {
    type: 'activity',
    userId,
    action,
    ...details
  });
};

// Add scraper logging method
logger.scraper = (scraperId, status, details = {}) => {
  logger.info(`Scraper [${scraperId}]: ${status}`, {
    type: 'scraper',
    scraperId,
    status,
    ...details
  });
};

// Add security logging method
logger.security = (event, details = {}) => {
  logger.info(`Security Event [${event}]`, {
    type: 'security',
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Add backup logging method
logger.backup = (operation, details = {}) => {
  logger.info(`Backup Operation [${operation}]`, {
    type: 'backup',
    operation,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = logger;