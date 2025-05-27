const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');
const authenticationService = require('../services/authenticationService');

// Ensure JWT_SECRET is available
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

class AuthController {
  /**
   * Middleware to verify JWT token
   */
  verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      logger.error('Token verification error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  /**
   * Handle user login with enhanced security
   */
  async login(req, res) {
    const { email, password } = req.body;
    
    try {
      // Check if account is locked
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({
          error: 'Account is locked. Please try again later.'
        });
      }

      // Verify credentials
      const { data: userData, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        // Track failed attempt
        if (authenticationService.trackFailedLogin(email)) {
          await authenticationService.logSecurityEvent('account_locked', {
            email,
            reason: 'Multiple failed login attempts'
          });
        }

        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Reset failed attempts on successful login
      authenticationService.resetLoginAttempts(email);

      // Generate secure session token
      const token = authenticationService.generateToken(userData.user);

      // Record successful login
      await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          failed_attempts: 0
        })
        .eq('id', userData.user.id);

      // Log security event
      await authenticationService.logSecurityEvent('successful_login', {
        userId: userData.user.id,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.json({
        token,
        user: userData.user
      });

    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle password change with security checks
   */
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // From auth middleware

    try {
      // Validate password strength
      const validation = authenticationService.validatePasswordStrength(newPassword);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Password does not meet security requirements',
          requirements: validation.requirements
        });
      }

      // Verify current password
      const { data: user } = await supabase
        .from('users')
        .select('password_hash, password_salt')
        .eq('id', userId)
        .single();

      const isValid = await authenticationService.verifyPassword(
        currentPassword,
        user.password_hash,
        user.password_salt
      );

      if (!isValid) {
        return res.status(401).json({
          error: 'Current password is incorrect'
        });
      }

      // Generate new password hash
      const { hash, salt } = await authenticationService.hashPassword(newPassword);

      // Update password
      const { error } = await supabase
        .from('users')
        .update({
          password_hash: hash,
          password_salt: salt,
          last_password_change: new Date().toISOString(),
          require_password_change: false
        })
        .eq('id', userId);

      if (error) throw error;

      // Log security event
      await authenticationService.logSecurityEvent('password_changed', {
        userId,
        ip: req.ip
      });

      return res.json({
        message: 'Password updated successfully'
      });

    } catch (error) {
      logger.error('Password change error:', error);
      return res.status(500).json({
        error: 'Failed to update password'
      });
    }
  }

  /**
   * Handle user logout
   */
  async logout(req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    
    try {
      // Revoke session
      await supabase
        .from('user_sessions')
        .update({
          revoked_at: new Date().toISOString(),
          revocation_reason: 'user_logout'
        })
        .eq('token_hash', authenticationService.hashToken(token));

      // Log security event
      await authenticationService.logSecurityEvent('logout', {
        userId: req.user.id,
        ip: req.ip
      });

      return res.json({
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      return res.status(500).json({
        error: 'Failed to logout'
      });
    }
  }
}

// Create an instance of the controller
const authController = new AuthController();

// Export both the instance and the middleware function
module.exports = {
  ...authController,
  verifyToken: authController.verifyToken.bind(authController),
  login: authController.login.bind(authController),
  generateTestHash: authController.generateTestHash?.bind(authController)
};