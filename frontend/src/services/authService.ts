import axios from 'axios';
import { supabase } from '@/lib/supabase';
import { inactivityService } from './inactivityService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface AuthResponse {
  token: string;
  user: {
    email: string;
    role: string;
  };
}

interface DecodedToken {
  email: string;
  role: string;
  userId: string;
  exp: number;
  iat: number;
}

export const authService = {
  async login(email: string, password: string): Promise<void> {
    try {
      const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/login`, {
        email,
        password
      });

      const { token, user } = response.data;
      
      // Validate token before storing
      if (!this.isValidToken(token)) {
        throw new Error('Invalid token received from server');
      }
      
      // Store token and user info
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set default Authorization header for all future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Start inactivity monitoring when user logs in
      inactivityService.startTimer();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];

      // Stop inactivity monitoring on logout
      inactivityService.stopTimer();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  },

  getToken(): string | null {
    const token = localStorage.getItem('token');
    if (token && !this.isValidToken(token)) {
      // Token is invalid or expired, clear it
      this.logout();
      return null;
    }
    return token;
  },

  getUser(): { email: string; role: string } | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated(): boolean {
    const token = this.getToken();
    return !!token && this.isValidToken(token);
  },

  async initializeAuth(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    this.token = session?.access_token || null;
    
    if (this.token) {
      localStorage.setItem('token', this.token);
      // Start inactivity monitoring if user is already authenticated
      inactivityService.startTimer();
    }
  },

  async refreshSession(): Promise<void> {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      
      this.token = session?.access_token || null;
      if (this.token) {
        localStorage.setItem('token', this.token);
        // Reset inactivity timer when session is refreshed
        inactivityService.startTimer();
      }
    } catch (error) {
      console.error('Session refresh error:', error);
      throw error;
    }
  },

  isValidToken(token: string): boolean {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const decoded = JSON.parse(jsonPayload) as DecodedToken;
      
      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < currentTime) {
        return false;
      }

      // Validate required fields
      if (!decoded.email || !decoded.userId || !decoded.role) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }
};