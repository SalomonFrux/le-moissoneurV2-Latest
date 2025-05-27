require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client with service role key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Add debug logging
logger.info('Initializing Supabase client...');
logger.info('Supabase URL:', supabaseUrl ? 'Found' : 'Missing');
logger.info('Supabase Service Key:', supabaseServiceKey ? 'Found' : 'Missing');

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

// Create client with additional options
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Test the connection
const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('scrapers').select('count');
    if (error) throw error;
    logger.info('Successfully connected to Supabase');
  } catch (error) {
    logger.error('Failed to connect to Supabase:', error);
    throw error;
  }
};

// Export both the client and the test function
module.exports = { 
  supabase,
  testConnection 
};