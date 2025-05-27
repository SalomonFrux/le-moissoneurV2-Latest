const crypto = require('crypto');
const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');
const alertingService = require('./alertingService');

class SecurityService {
  constructor() {
    this.rateLimit = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100 // per IP
    };
    this.requestCounts = new Map();
    this.blacklist = new Set();
  }

  /**
   * Generate a secure request signature
   * @param {Object} params - Request parameters
   * @returns {string} - HMAC signature
   */
  generateRequestSignature(params) {
    const secret = process.env.REQUEST_SIGNING_SECRET;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(params));
    return hmac.digest('hex');
  }

  /**
   * Validate request authenticity
   * @param {Object} params - Request parameters
   * @param {string} signature - Request signature
   * @returns {boolean} - Whether the request is valid
   */
  validateRequest(params, signature) {
    const expectedSignature = this.generateRequestSignature(params);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Check if an IP is rate limited
   * @param {string} ip - IP address
   * @returns {boolean} - Whether the IP is rate limited
   */
  isRateLimited(ip) {
    const now = Date.now();
    const requests = this.requestCounts.get(ip) || [];
    
    // Clear old requests
    const validRequests = requests.filter(
      time => now - time < this.rateLimit.windowMs
    );
    
    if (validRequests.length >= this.rateLimit.maxRequests) {
      this.blacklist.add(ip);
      alertingService.createSecurityAlert('rate_limit_exceeded', { ip });
      return true;
    }
    
    validRequests.push(now);
    this.requestCounts.set(ip, validRequests);
    return false;
  }

  /**
   * Sanitize user input to prevent XSS and injection attacks
   * @param {string} input - User input
   * @returns {string} - Sanitized input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/data:/gi, '') // Remove data: protocol
      .trim();
  }

  /**
   * Validate and sanitize scraper configuration
   * @param {Object} config - Scraper configuration
   * @returns {Object} - Sanitized configuration
   */
  validateScraperConfig(config) {
    const sanitizedConfig = {
      ...config,
      url: this.sanitizeInput(config.url),
      fields: {}
    };

    // Sanitize field selectors
    for (const [field, fieldConfig] of Object.entries(config.fields || {})) {
      sanitizedConfig.fields[this.sanitizeInput(field)] = {
        ...fieldConfig,
        selectors: fieldConfig.selectors.map(selector => ({
          ...selector,
          value: this.sanitizeInput(selector.value)
        }))
      };
    }

    return sanitizedConfig;
  }

  /**
   * Log security event
   * @param {string} eventType - Type of security event
   * @param {Object} details - Event details
   */
  async logSecurityEvent(eventType, details) {
    try {
      await supabase
        .from('security_events')
        .insert([{
          event_type: eventType,
          details,
          timestamp: new Date().toISOString()
        }]);

      if (eventType === 'attack_detected') {
        await alertingService.createAlert({
          severity: 'critical',
          category: 'security',
          message: 'Potential security threat detected',
          data: details
        });
      }
    } catch (error) {
      logger.error('Error logging security event:', error);
    }
  }

  /**
   * Check for suspicious patterns in scraping behavior
   * @param {Object} metrics - Scraping metrics
   * @returns {boolean} - Whether suspicious activity was detected
   */
  detectSuspiciousActivity(metrics) {
    const suspicious = {
      highFrequency: metrics.requestsPerSecond > 10,
      unusual404s: metrics.notFoundCount > metrics.totalRequests * 0.2,
      highErrorRate: metrics.errorRate > 0.3,
      blacklistedIPs: metrics.clientIp && this.blacklist.has(metrics.clientIp)
    };

    if (Object.values(suspicious).some(Boolean)) {
      this.logSecurityEvent('suspicious_activity', {
        metrics,
        suspicious
      });
      return true;
    }

    return false;
  }
}

module.exports = new SecurityService();
