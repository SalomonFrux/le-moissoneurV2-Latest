const logger = require('../utils/logger');

const SESSION_TIMEOUT = process.env.SESSION_TIMEOUT || 30 * 60 * 1000; // 30 minutes by default

const sessionTimeout = (req, res, next) => {
    // Skip this middleware for public routes
    if (req.path.startsWith('/api/auth/login') || req.path === '/api/health') {
        return next();
    }

    const lastActivity = req.session?.lastActivity;
    const currentTime = Date.now();

    if (lastActivity && (currentTime - lastActivity > SESSION_TIMEOUT)) {
        logger.info(`Session expired for user ${req.user?.id || 'unknown'}`);
        return res.status(440).json({
            error: 'session_expired',
            message: 'Your session has expired. Please login again.'
        });
    }

    // Update last activity time
    if (req.session) {
        req.session.lastActivity = currentTime;
    }

    next();
};

module.exports = sessionTimeout;
