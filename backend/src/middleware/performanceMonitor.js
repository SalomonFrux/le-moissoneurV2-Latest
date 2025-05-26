const logger = require('../utils/logger');

const performanceMonitor = (req, res, next) => {
    const start = process.hrtime();
    
    // Add response finish handler
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const time = diff[0] * 1e3 + diff[1] * 1e-6; // Convert to milliseconds
        
        logger.performance('request', time, {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            userAgent: req.get('user-agent'),
            contentLength: res.get('content-length')
        });

        // Alert on slow responses
        if (time > 5000) { // 5 seconds threshold
            logger.warn(`Slow response detected: ${req.method} ${req.url} took ${time.toFixed(2)}ms`);
        }
    });

    next();
};
