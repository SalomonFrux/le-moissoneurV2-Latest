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
    logger.info(`[AUTH_LOGIN] Attempting login for email: ${email}`);
    
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
      const { data: userData, error: supabaseError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      // Log Supabase response
      if (supabaseError) {
        logger.error('[AUTH_LOGIN] Supabase signInWithPassword error:', supabaseError);
      } else {
        logger.info('[AUTH_LOGIN] Supabase signInWithPassword success. User data:', userData?.user?.id ? { userId: userData.user.id, email: userData.user.email } : 'No user data returned');
      }

      if (supabaseError) {
        // OLD: Track failed attempt logic might need to be re-evaluated or removed if Supabase handles it
        // if (authenticationService.trackFailedLogin(email)) { ... }
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // OLD: Reset failed attempts logic might need to be re-evaluated or removed
      // authenticationService.resetLoginAttempts(email);

      // --- START NEW LOGIC: Fetch profile and role ---
      if (!userData || !userData.user) {
        logger.error('[AUTH_LOGIN] No user data returned from Supabase auth, though no error was thrown.');
        return res.status(401).json({ error: 'Authentication failed: No user data.' });
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles') // Your new profiles table
        .select('role')    // Select the role, and any other fields you need in JWT/user object
        .eq('id', userData.user.id) // Match using the ID from auth.users
        .single();

      if (profileError || !profileData) {
        logger.error(`[AUTH_LOGIN] Could not fetch profile for user ID: ${userData.user.id}. Profile error:`, profileError);
        // Decide how to handle: Could be a 500, or a 403 if profile is essential for roles
        // For now, let's treat it as a severe issue if a profile doesn't exist for an authenticated user.
        return res.status(500).json({ error: 'User profile not found after successful authentication.' });
      }
      logger.info(`[AUTH_LOGIN] Fetched profile for user ID: ${userData.user.id}. Role: ${profileData.role}`);
      // --- END NEW LOGIC ---

      // Generate secure session token
      const tokenPayload = {
        id: userData.user.id,
        email: userData.user.email,
        role: profileData.role, // Use role from profiles table
        // Include other claims from Supabase user object if needed, e.g., userData.user.aud, etc.
        // Or other fields from profileData if you selected more
      };
      const token = authenticationService.generateToken(tokenPayload); // Ensure generateToken can handle this payload
      logger.info(`[AUTH_LOGIN] JWT generated: ${token ? 'OK' : 'FAIL'}`);

      // Record successful login - this might now update the 'profiles' table if it has a last_login field
      // The old code updated a custom 'users' table.
      // Let's assume 'profiles' has a 'last_login' field. If not, you can add it or remove this update.
      try {
        await supabase
          .from('profiles') // Update 'profiles' table
          .update({ last_login: new Date().toISOString() })
          .eq('id', userData.user.id);
        logger.info(`[AUTH_LOGIN] Updated last_login for user ID: ${userData.user.id} in profiles table.`);
      } catch (updateError) {
        logger.error(`[AUTH_LOGIN] Failed to update last_login for user ID: ${userData.user.id} in profiles table. Error:`, updateError);
        // Non-critical, so don't fail the login for this
      }
      
      // Log security event (this service might also need to be aware of the new structure)
      // await authenticationService.logSecurityEvent('successful_login', { ... });

      return res.json({
        token,
        // user: userData.user // Old: this is the raw Supabase auth user object
        user: tokenPayload   // New: Send the enriched user object (with role from profiles)
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