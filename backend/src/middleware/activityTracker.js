const userActivityService = require('../services/userActivityService');
const logger = require('../utils/logger');

/**
 * Middleware to track user activity
 */
async function activityTracker(req, res, next) {
  const startTime = Date.now();

  // Store the original end function
  const originalEnd = res.end;

  // Override the end function to capture response
  res.end = async function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    
    try {
      // Extract user info from request
      const userId = req.user?.id;
      if (!userId) {
        return originalEnd.call(this, chunk, encoding);
      }

      // Determine resource type and action from route
      const resourceType = getResourceType(req.path);
      const action = getActionType(req.method, req.path);

      // Get resource ID if available
      const resourceId = req.params.id || null;

      // Collect activity details
      const activityDetails = {
        method: req.method,
        path: req.path,
        query: req.query,
        responseTime,
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      };

      // Log specific details for certain actions
      if (action === 'create_scraper') {
        activityDetails.targetUrl = req.body.url;
        activityDetails.scraperConfig = req.body.config;
      } else if (action === 'run_scraper') {
        activityDetails.scraperId = req.params.id;
        activityDetails.options = req.body.options;
      }

      // Log the activity
      await userActivityService.logActivity({
        userId,
        action,
        resourceType,
        resourceId,
        details: activityDetails,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

    } catch (error) {
      logger.error('Error tracking user activity:', error);
    }

    // Call the original end function
    originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Determine resource type from path
 */
function getResourceType(path) {
  const pathMap = {
    '/api/scrapers': 'scraper',
    '/api/proxies': 'proxy',
    '/api/data': 'scraped_data',
    '/api/statistics': 'statistics',
    '/api/exports': 'export'
  };

  for (const [prefix, type] of Object.entries(pathMap)) {
    if (path.startsWith(prefix)) return type;
  }

  return 'other';
}

/**
 * Determine action type from method and path
 */
function getActionType(method, path) {
  // Special cases for specific actions
  if (path.match(/\/api\/scrapers\/[\w-]+\/run/)) {
    return 'run_scraper';
  }
  if (path.match(/\/api\/scrapers\/[\w-]+\/stop/)) {
    return 'stop_scraper';
  }
  if (path.match(/\/api\/exports\/download/)) {
    return 'download_export';
  }

  // Generic CRUD actions
  const methodMap = {
    GET: 'view',
    POST: 'create',
    PUT: 'update',
    DELETE: 'delete'
  };

  const baseAction = methodMap[method] || 'other';
  const resource = getResourceType(path);

  return `${baseAction}_${resource}`;
}

module.exports = activityTracker;
