const logger = require('../utils/logger');

class ErrorHandler {
  static handle(err, req, res, next) {
    // Log error with stack trace and request details
    logger.error('Application Error:', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id
    });

    // Handle specific types of errors
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        type: 'validation',
        message: err.message,
        details: err.details
      });
    }

    if (err.name === 'UnauthorizedError' || err.status === 401) {
      return res.status(401).json({
        status: 'error',
        type: 'auth',
        message: 'Unauthorized access'
      });
    }

    if (err.name === 'NotFoundError' || err.status === 404) {
      return res.status(404).json({
        status: 'error',
        type: 'not_found',
        message: err.message || 'Resource not found'
      });
    }

    // Return sanitized error response in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(err.status || 500).json({
        status: 'error',
        message: err.expose ? err.message : 'Internal server error'
      });
    }

    // Return detailed error in development
    return res.status(err.status || 500).json({
      status: 'error',
      message: err.message,
      stack: err.stack,
      details: err.details || {}
    });
  }
}

module.exports = ErrorHandler;
