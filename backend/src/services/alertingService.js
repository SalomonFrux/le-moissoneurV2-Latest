const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');
// const webSocketManager = require('../websocket/webSocketManager'); // Removed
const scraperStatusHandler = require('../websocket/scraperStatusHandler'); // Added
const nodemailer = require('nodemailer');

// Alert severity levels
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Alert categories
const CATEGORY = {
  SCRAPER_ERROR: 'scraper_error',
  PERFORMANCE: 'performance',
  DATA_QUALITY: 'data_quality',
  SECURITY: 'security',
  SYSTEM: 'system'
};

class AlertingService {
  constructor() {
    this.thresholds = {
      errorRate: 0.1, // 10% error rate threshold
      responseTime: 5000, // 5 seconds response time threshold
      memoryUsage: 0.8, // 80% memory usage threshold
      dataMissing: 0.2 // 20% missing data threshold
    };
    // Setup nodemailer transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    this.adminEmail = process.env.ALERT_ADMIN_EMAIL;
  }

  async sendEmail(subject, text) {
    if (!this.adminEmail) return;
    try {
      await this.transporter.sendMail({
        from: `Le Moissonneur Alerts <${this.transporter.options.auth.user}>`,
        to: this.adminEmail,
        subject,
        text
      });
    } catch (err) {
      logger.error('Failed to send alert email:', err);
    }
  }

  /**
   * Create and send an alert
   * @param {Object} params Alert parameters
   */
  async createAlert({
    scraperId,
    severity,
    category,
    message,
    data = {},
    notificationChannels = ['websocket', 'database']
  }) {
    const alert = {
      scraper_id: scraperId,
      severity,
      category,
      message,
      data: JSON.stringify(data),
      created_at: new Date().toISOString(),
      status: 'active'
    };

    try {
      // Store alert in database
      if (notificationChannels.includes('database')) {
        const { error } = await supabase
          .from('alerts')
          .insert([alert]);

        if (error) throw error;
      }

      // Send real-time notification via scraperStatusHandler
      if (notificationChannels.includes('websocket') && scraperStatusHandler.io) {
        const alertPayload = {
          id: alert.id, // Assuming supabase returns the id after insert, or generate one before
          scraperId: scraperId, // Keep scraperId for room targeting
          severity,
          category,
          message,
          data,
          created_at: alert.created_at
        };
        if (scraperId) {
          scraperStatusHandler.io.to(`scraper-${scraperId}`).emit('new-alert', alertPayload);
          logger.info(`WebSocket alert sent to room scraper-${scraperId}`);
        } else {
          // If no scraperId, maybe emit to a general admin room or all connected clients
          // For now, let's log if scraperId is missing for an alert destined for WebSocket
          logger.warn('Cannot send WebSocket alert: scraperId is missing and no general room defined.');
        }
      } else if (notificationChannels.includes('websocket') && !scraperStatusHandler.io) {
        logger.warn('Cannot send WebSocket alert: Socket.IO not initialized in scraperStatusHandler.');
      }

      // Send email for critical alerts
      if (severity === SEVERITY.CRITICAL) {
        const subject = `[CRITICAL ALERT] ${category} - ${message}`;
        const text = `A critical alert was triggered.\n\nCategory: ${category}\nMessage: ${message}\nScraper ID: ${scraperId}\nData: ${JSON.stringify(data, null, 2)}\nTime: ${alert.created_at}`;
        await this.sendEmail(subject, text);
      }

      logger.info(`Alert created: [${severity}] ${message}`);
    } catch (error) {
      logger.error('Error creating alert:', error);
    }
  }

  /**
   * Monitor scraper performance and create alerts if thresholds are exceeded
   * @param {string} scraperId The ID of the scraper
   * @param {Object} metrics Performance metrics
   */
  async monitorPerformance(scraperId, metrics) {
    // Check error rate
    if (metrics.errorRate > this.thresholds.errorRate) {
      await this.createAlert({
        scraperId,
        severity: SEVERITY.WARNING,
        category: CATEGORY.PERFORMANCE,
        message: `High error rate detected: ${(metrics.errorRate * 100).toFixed(1)}%`,
        data: { errorRate: metrics.errorRate, threshold: this.thresholds.errorRate }
      });
    }

    // Check response time
    if (metrics.averageResponseTime > this.thresholds.responseTime) {
      await this.createAlert({
        scraperId,
        severity: SEVERITY.WARNING,
        category: CATEGORY.PERFORMANCE,
        message: `Slow response time: ${metrics.averageResponseTime}ms`,
        data: { responseTime: metrics.averageResponseTime, threshold: this.thresholds.responseTime }
      });
    }

    // Check memory usage
    if (metrics.memoryUsage > this.thresholds.memoryUsage) {
      await this.createAlert({
        scraperId,
        severity: SEVERITY.WARNING,
        category: CATEGORY.SYSTEM,
        message: `High memory usage: ${(metrics.memoryUsage * 100).toFixed(1)}%`,
        data: { memoryUsage: metrics.memoryUsage, threshold: this.thresholds.memoryUsage }
      });
    }
  }

  /**
   * Monitor data quality and create alerts for issues
   * @param {string} scraperId The ID of the scraper
   * @param {Array} results The scraped results
   * @param {Object} config The scraper configuration
   */
  async monitorDataQuality(scraperId, results, config) {
    if (!results || !results.length) return;

    const requiredFields = Object.keys(config.fields || {});
    const missingDataCounts = {};
    let totalMissingRate = 0;

    // Check for missing required fields
    requiredFields.forEach(field => {
      const missingCount = results.filter(r => !r.metadata[field]).length;
      const missingRate = missingCount / results.length;
      
      if (missingRate > this.thresholds.dataMissing) {
        missingDataCounts[field] = missingCount;
        totalMissingRate += missingRate;
      }
    });

    if (Object.keys(missingDataCounts).length > 0) {
      await this.createAlert({
        scraperId,
        severity: SEVERITY.WARNING,
        category: CATEGORY.DATA_QUALITY,
        message: `High rate of missing data detected`,
        data: {
          missingFields: missingDataCounts,
          totalMissingRate: totalMissingRate / requiredFields.length
        }
      });
    }
  }

  /**
   * Create a security alert
   * @param {string} scraperId The ID of the scraper
   * @param {string} type The type of security issue
   * @param {Object} details Additional details about the security issue
   */
  async createSecurityAlert(scraperId, type, details) {
    await this.createAlert({
      scraperId,
      severity: SEVERITY.ERROR,
      category: CATEGORY.SECURITY,
      message: `Security issue detected: ${type}`,
      data: details
    });
  }
}

module.exports = new AlertingService();
