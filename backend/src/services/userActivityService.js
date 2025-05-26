const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');
const alertingService = require('./alertingService');

class UserActivityService {
  constructor() {
    this.suspiciousPatterns = {
      maxScrapersPerHour: 10,
      maxFailedLogins: 5,
      maxConcurrentSessions: 3
    };
  }

  /**
   * Log user activity
   * @param {Object} params Activity parameters
   */
  async logActivity({ 
    userId, 
    action, 
    resourceType, 
    resourceId = null, 
    details = {}, 
    ipAddress, 
    userAgent 
  }) {
    try {
      const activityData = {
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      };

      await supabase
        .from('user_activities')
        .insert([activityData]);

      // Check for suspicious patterns
      await this.checkSuspiciousActivity(userId, action, details);

    } catch (error) {
      logger.error('Error logging user activity:', error);
    }
  }

  /**
   * Check for suspicious activity patterns
   * @param {string} userId User ID
   * @param {string} action Action performed
   * @param {Object} details Activity details
   */
  async checkSuspiciousActivity(userId, action, details) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    try {
      // Check scraper creation frequency
      if (action === 'create_scraper') {
        const { data: recentScrapers } = await supabase
          .from('user_activities')
          .select('id')
          .eq('user_id', userId)
          .eq('action', 'create_scraper')
          .gte('timestamp', oneHourAgo);

        if (recentScrapers?.length >= this.suspiciousPatterns.maxScrapersPerHour) {
          await this.handleSuspiciousActivity(userId, 'high_scraper_creation_rate', {
            count: recentScrapers.length,
            timeframe: '1 hour'
          });
        }
      }

      // Check failed login attempts
      if (action === 'failed_login') {
        const { data: failedLogins } = await supabase
          .from('user_activities')
          .select('id')
          .eq('user_id', userId)
          .eq('action', 'failed_login')
          .gte('timestamp', oneHourAgo);

        if (failedLogins?.length >= this.suspiciousPatterns.maxFailedLogins) {
          await this.handleSuspiciousActivity(userId, 'multiple_failed_logins', {
            count: failedLogins.length,
            timeframe: '1 hour'
          });
        }
      }

      // Check concurrent sessions
      if (action === 'login') {
        const { data: activeSessions } = await supabase
          .from('user_sessions')
          .select('id')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .lt('expires_at', new Date().toISOString());

        if (activeSessions?.length >= this.suspiciousPatterns.maxConcurrentSessions) {
          await this.handleSuspiciousActivity(userId, 'multiple_concurrent_sessions', {
            count: activeSessions.length
          });
        }
      }
    } catch (error) {
      logger.error('Error checking suspicious activity:', error);
    }
  }

  /**
   * Handle detected suspicious activity
   * @param {string} userId User ID
   * @param {string} type Type of suspicious activity
   * @param {Object} details Activity details
   */
  async handleSuspiciousActivity(userId, type, details) {
    try {
      // Log security event
      await supabase
        .from('security_events')
        .insert([{
          user_id: userId,
          event_type: type,
          details,
          timestamp: new Date().toISOString()
        }]);

      // Create alert
      await alertingService.createAlert({
        severity: 'warning',
        category: 'security',
        message: `Suspicious user activity detected: ${type}`,
        data: {
          userId,
          type,
          details
        }
      });

      // Get user info for the alert
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      logger.warn(`Suspicious activity detected for user ${user?.email}: ${type}`);

    } catch (error) {
      logger.error('Error handling suspicious activity:', error);
    }
  }

  /**
   * Get user activity summary
   * @param {string} userId User ID
   * @returns {Promise<Object>} Activity summary
   */
  async getActivitySummary(userId) {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: activities } = await supabase
        .from('user_activities')
        .select('action, resource_type, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', twentyFourHoursAgo);

      const summary = {
        total_actions: activities?.length || 0,
        actions_by_type: {},
        resources_accessed: new Set(),
        last_activity: null
      };

      activities?.forEach(activity => {
        // Count actions by type
        summary.actions_by_type[activity.action] = 
          (summary.actions_by_type[activity.action] || 0) + 1;
        
        // Track unique resources
        if (activity.resource_type) {
          summary.resources_accessed.add(activity.resource_type);
        }

        // Track last activity
        if (!summary.last_activity || activity.timestamp > summary.last_activity) {
          summary.last_activity = activity.timestamp;
        }
      });

      summary.resources_accessed = Array.from(summary.resources_accessed);
      return summary;

    } catch (error) {
      logger.error('Error getting activity summary:', error);
      return null;
    }
  }

  /**
   * Get real-time user activity stream
   * @param {string} userId User ID
   * @returns {Promise<Array>} Recent activities
   */
  async getRealtimeActivity(userId) {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: activities } = await supabase
        .from('user_activities')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', fiveMinutesAgo)
        .order('timestamp', { ascending: false });

      return activities || [];

    } catch (error) {
      logger.error('Error getting realtime activity:', error);
      return [];
    }
  }
}

module.exports = new UserActivityService();
