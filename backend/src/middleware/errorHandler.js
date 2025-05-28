/* const logger = require('../utils/logger');

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
 */




//New pasted from  google jules


const logger = require('../utils/logger');

/**
 * Error handling middleware for Express.
 * This function processes errors passed via next(err) or thrown in route handlers.
 *
 * @param {Error} err - The error object.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
function errorHandlerMiddleware(err, req, res, next) {
  // Log error with stack trace and request details
  logger.error('Application Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id // Access req.user safely
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
      message: err.message || 'Unauthorized access' // Use err.message if available
    });
  }

  if (err.name === 'NotFoundError' || err.status === 404) {
    return res.status(404).json({
      status: 'error',
      type: 'not_found',
      message: err.message || 'Resource not found'
    });
  }
  
  // Handle JWT errors specifically if needed (example)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
        status: 'error',
        type: 'auth',
        message: 'Invalid or expired token. Please log in again.'
    });
  }

  // Default error response
  const statusCode = err.status || 500;
  const response = {
    status: 'error',
    message: err.expose && process.env.NODE_ENV === 'production' ? err.message : 'Internal server error'
  };

  // Include stack trace and details only in development
  if (process.env.NODE_ENV !== 'production') {
    response.message = err.message; // Show actual message in dev
    response.stack = err.stack;
    if (err.details) {
      response.details = err.details;
    }
  }

  return res.status(statusCode).json(response);
}

module.exports = errorHandlerMiddleware;
