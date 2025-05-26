const { supabase } = require('../db/supabase');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const alertingService = require('./alertingService');

class AuthenticationService {
  constructor() {
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT, 10) || 3600; // 1 hour
    this.maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
    this.lockoutDuration = parseInt(process.env.LOCKOUT_DURATION, 10) || 900; // 15 minutes
    this.loginAttempts = new Map();
  }

  /**
   * Generate a secure password hash
   * @param {string} password - The password to hash
   * @returns {Promise<{hash: string, salt: string}>} - The password hash and salt
   */
  async hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
  }

  /**
   * Verify a password against its hash
   * @param {string} password - The password to verify
   * @param {string} hash - The stored password hash
   * @param {string} salt - The stored salt
   * @returns {Promise<boolean>} - Whether the password is valid
   */
  async verifyPassword(password, hash, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(derivedKey.toString('hex') === hash);
      });
    });
  }

  /**
   * Generate a secure JWT token
   * @param {Object} user - User data
   * @returns {string} - JWT token
   */
  generateToken(user) {
    const payload = {
      uid: user.id,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: this.sessionTimeout,
      algorithm: 'HS512'
    });
  }

  /**
   * Track failed login attempts
   * @param {string} identifier - User identifier (email/username)
   * @returns {boolean} - Whether the account should be locked
   */
  trackFailedLogin(identifier) {
    const attempts = this.loginAttempts.get(identifier) || [];
    const now = Date.now();
    
    // Clear old attempts
    const recentAttempts = attempts.filter(time => now - time < this.lockoutDuration * 1000);
    recentAttempts.push(now);
    
    this.loginAttempts.set(identifier, recentAttempts);
    
    if (recentAttempts.length >= this.maxLoginAttempts) {
      this.handleAccountLockout(identifier);
      return true;
    }
    
    return false;
  }

  /**
   * Handle account lockout
   * @param {string} identifier - User identifier
   */
  async handleAccountLockout(identifier) {
    try {
      // Update user status in database
      await supabase
        .from('users')
        .update({ 
          locked_until: new Date(Date.now() + this.lockoutDuration * 1000).toISOString(),
          failed_attempts: this.maxLoginAttempts
        })
        .eq('email', identifier);

      // Create security alert
      await alertingService.createAlert({
        severity: 'warning',
        category: 'security',
        message: `Account locked due to multiple failed login attempts: ${identifier}`,
        data: {
          identifier,
          attempts: this.maxLoginAttempts,
          lockoutDuration: this.lockoutDuration
        }
      });

      logger.warn(`Account locked: ${identifier}`);
    } catch (error) {
      logger.error('Error handling account lockout:', error);
    }
  }

  /**
   * Reset failed login attempts
   * @param {string} identifier - User identifier
   */
  resetLoginAttempts(identifier) {
    this.loginAttempts.delete(identifier);
  }

  /**
   * Validate password strength
   * @param {string} password - The password to validate
   * @returns {Object} - Validation result
   */
  validatePasswordStrength(password) {
    const minLength = 12;
    const requirements = {
      length: password.length >= minLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };

    const valid = Object.values(requirements).every(Boolean);
    return {
      valid,
      requirements,
      message: valid ? 'Password meets requirements' : 'Password does not meet requirements'
    };
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

      if (['suspicious_activity', 'brute_force_attempt'].includes(eventType)) {
        await alertingService.createAlert({
          severity: 'critical',
          category: 'security',
          message: `Security event detected: ${eventType}`,
          data: details
        });
      }
    } catch (error) {
      logger.error('Error logging security event:', error);
    }
  }

  /**
   * Validate token and check permissions
   * @param {string} token - JWT token
   * @param {string[]} requiredPermissions - Required permissions
   * @returns {Promise<Object>} - Validation result
   */
  async validateTokenAndPermissions(token, requiredPermissions = []) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check token expiration
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      // Get user permissions
      const { data: userPermissions } = await supabase
        .from('user_permissions')
        .select('permission')
        .eq('user_id', decoded.uid);

      const hasPermission = requiredPermissions.every(
        permission => userPermissions.some(p => p.permission === permission)
      );

      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }

      return {
        valid: true,
        user: decoded
      };
    } catch (error) {
      await this.logSecurityEvent('invalid_token', {
        error: error.message,
        token: token.substring(0, 10) + '...' // Log only part of the token
      });

      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new AuthenticationService();
