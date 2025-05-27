const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * Get dashboard data
 */
async function getDashboardData(req, res) {
  try {
    logger.info('Starting getDashboardData...');

    // Get total entries
    const { count: totalEntries, error: countError } = await supabase
      .from('scraped_data')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      logger.error('Error getting total entries:', countError);
    }

    // Get unique scrapers that have data
    const { data: uniqueScrapersData, error: uniqueScrapersError } = await supabase
      .from('scraped_data')
      .select('scraper_id')
      .not('scraper_id', 'is', null);

    if (uniqueScrapersError) {
      logger.error('Error getting unique scrapers:', uniqueScrapersError);
    }

    // Count unique scraper_ids
    const uniqueScrapers = new Set(uniqueScrapersData?.map(d => d.scraper_id) || []).size;

    // Get unique countries
    const { data: countriesData, error: countriesError } = await supabase
      .from('scraped_data')
      .select('pays')
      .not('pays', 'is', null)
      .not('pays', 'eq', 'Aucune donnée')
      .not('pays', 'eq', '')
      .not('pays', 'eq', 'Unknown');

    if (countriesError) {
      logger.error('Error getting unique countries:', countriesError);
    }

    // Count unique countries
    const uniqueCountries = new Set(countriesData?.map(d => d.pays) || []).size;

    // Get unique sectors
    const { data: sectorsData, error: sectorsError } = await supabase
      .from('scraped_data')
      .select('secteur')
      .not('secteur', 'is', null)
      .not('secteur', 'eq', 'Aucune donnée')
      .not('secteur', 'eq', '')
      .not('secteur', 'eq', 'Unknown');

    if (sectorsError) {
      logger.error('Error getting unique sectors:', sectorsError);
    }

    // Count unique sectors
    const uniqueSectors = new Set(sectorsData?.map(d => d.secteur) || []).size;

    // Calculate completeness rate
    const { data: completenessData, error: completenessError } = await supabase
      .from('scraped_data')
      .select('email, telephone, adresse, site_web');

    if (completenessError) {
      logger.error('Error calculating completeness:', completenessError);
    }

    let completeness = 0;
    if (completenessData && completenessData.length > 0) {
      const totalFields = completenessData.length * 4; // 4 fields we're checking
      const filledFields = completenessData.reduce((acc, row) => {
        return acc + 
          (row.email ? 1 : 0) +
          (row.telephone ? 1 : 0) +
          (row.adresse ? 1 : 0) +
          (row.site_web ? 1 : 0);
      }, 0);
      completeness = Math.round((filledFields / totalFields) * 100);
    }

    // Send response
    res.json({
      stats: {
        totalEntries: totalEntries || 0,
        uniqueScrapers: uniqueScrapers || 0,
        uniqueSectors: uniqueSectors || 0,
        uniqueCountries: uniqueCountries || 0,
        completeness: completeness || 0
      }
    });

  } catch (error) {
    logger.error('Error in getDashboardData:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

// Add RPC function for direct count
const rpcSQL = `
CREATE OR REPLACE FUNCTION get_total_records()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM scraped_data);
END;
$$ LANGUAGE plpgsql;
`;

// Add this function to test the connection
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('scraped_data')
      .select('count')
      .single();
    
    if (error) {
      logger.error('Supabase connection test error:', error);
      return false;
    }
    
    logger.info('Supabase connection test successful');
    return true;
  } catch (error) {
    logger.error('Supabase connection test failed:', error);
    return false;
  }
}

async function getDebugData(req, res) {
  try {
    // Test connection first
    const isConnected = await testSupabaseConnection();
    
    // Log Supabase client details (without sensitive info)
    logger.info('Supabase client config:', {
      url: supabase.supabaseUrl,
      hasKey: !!supabase.supabaseKey,
    });

    // Try different query approaches
    const basicQuery = await supabase
      .from('scraped_data')
      .select('*');

    const countQuery = await supabase
      .from('scraped_data')
      .select('*', { count: 'exact', head: true });

    const scrapersQuery = await supabase
      .from('scrapers')
      .select('*');

    // Try with explicit schema
    const schemaQuery = await supabase
      .schema('public')
      .from('scraped_data')
      .select('*');

    // Try a simpler query with just one column
    const simpleQuery = await supabase
      .from('scraped_data')
      .select('id');

    // Try with a range query
    const rangeQuery = await supabase
      .from('scraped_data')
      .select('*')
      .range(0, 9);

    // Log detailed results with full error information
    logger.info('Basic query result:', {
      hasData: !!basicQuery.data,
      count: basicQuery.data?.length,
      error: basicQuery.error,
      status: basicQuery.status,
      statusText: basicQuery.statusText
    });

    logger.info('Count query result:', {
      count: countQuery.count,
      error: countQuery.error,
      status: countQuery.status,
      statusText: countQuery.statusText
    });

    logger.info('Scrapers query result:', {
      hasData: !!scrapersQuery.data,
      count: scrapersQuery.data?.length,
      error: scrapersQuery.error,
      status: scrapersQuery.status,
      statusText: scrapersQuery.statusText
    });

    logger.info('Schema query result:', {
      hasData: !!schemaQuery.data,
      count: schemaQuery.data?.length,
      error: schemaQuery.error,
      status: schemaQuery.status,
      statusText: schemaQuery.statusText
    });

    logger.info('Simple query result:', {
      hasData: !!simpleQuery.data,
      count: simpleQuery.data?.length,
      error: simpleQuery.error,
      status: simpleQuery.status,
      statusText: simpleQuery.statusText
    });

    logger.info('Range query result:', {
      hasData: !!rangeQuery.data,
      count: rangeQuery.data?.length,
      error: rangeQuery.error,
      status: rangeQuery.status,
      statusText: rangeQuery.statusText
    });

    res.json({
      connection_test: isConnected,
      supabase_config: {
        hasUrl: !!supabase.supabaseUrl,
        hasKey: !!supabase.supabaseKey,
      },
      queries: {
        basic: {
          data: basicQuery.data,
          error: basicQuery.error,
          count: basicQuery.data?.length || 0,
          status: basicQuery.status,
          statusText: basicQuery.statusText
        },
        count: {
          count: countQuery.count,
          error: countQuery.error,
          status: countQuery.status,
          statusText: countQuery.statusText
        },
        scrapers: {
          data: scrapersQuery.data,
          error: scrapersQuery.error,
          count: scrapersQuery.data?.length || 0,
          status: scrapersQuery.status,
          statusText: scrapersQuery.statusText
        },
        schema: {
          data: schemaQuery.data,
          error: schemaQuery.error,
          count: schemaQuery.data?.length || 0,
          status: schemaQuery.status,
          statusText: schemaQuery.statusText
        },
        simple: {
          data: simpleQuery.data,
          error: simpleQuery.error,
          count: simpleQuery.data?.length || 0,
          status: simpleQuery.status,
          statusText: simpleQuery.statusText
        },
        range: {
          data: rangeQuery.data,
          error: rangeQuery.error,
          count: rangeQuery.data?.length || 0,
          status: rangeQuery.status,
          statusText: rangeQuery.statusText
        }
      }
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = {
  getDashboardData,
  getDebugData
}; 