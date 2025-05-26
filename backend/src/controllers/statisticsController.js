const statisticsService = require('../services/statisticsService');
const logger = require('../utils/logger');

/**
 * Get statistics for a specific scraper
 */
async function getScraperStats(req, res) {
  try {
    const { id: scraperId } = req.params;
    const stats = await statisticsService.getScraperStats(scraperId);
    res.json(stats);
  } catch (error) {
    logger.error('Error getting scraper stats:', error);
    res.status(500).json({
      error: 'Failed to get scraper statistics',
      details: error.message
    });
  }
}

/**
 * Get overall system statistics
 */
async function getSystemStats(req, res) {
  try {
    const stats = await statisticsService.getSystemStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting system stats:', error);
    res.status(500).json({
      error: 'Failed to get system statistics',
      details: error.message
    });
  }
}

/**
 * Get error statistics
 */
async function getErrorStats(req, res) {
  try {
    const { id: scraperId } = req.params;
    const stats = await statisticsService.getErrorStats(scraperId);
    res.json(stats);
  } catch (error) {
    logger.error('Error getting error stats:', error);
    res.status(500).json({
      error: 'Failed to get error statistics',
      details: error.message
    });
  }
}

/**
 * Run a preview scrape
 */
async function previewScrape(req, res) {
  try {
    const { id: scraperId } = req.params;
    
    // Get scraper configuration
    const { data: scraper, error } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', scraperId)
      .single();
    
    if (error) {
      throw error;
    }

    // Modify configuration for preview
    const previewConfig = {
      ...scraper.config,
      pagination: {
        ...scraper.config.pagination,
        maxPages: 1 // Only scrape first page for preview
      }
    };

    // Run scraper with preview configuration
    const results = await playwrightScraper(
      scraper.source,
      previewConfig,
      scraperId
    );

    // Return first 5-10 items
    res.json({
      totalItems: results.length,
      preview: results.slice(0, 10)
    });
  } catch (error) {
    logger.error('Error running preview scrape:', error);
    res.status(500).json({
      error: 'Failed to run preview scrape',
      details: error.message
    });
  }
}

module.exports = {
  getScraperStats,
  getSystemStats,
  getErrorStats,
  previewScrape
};
