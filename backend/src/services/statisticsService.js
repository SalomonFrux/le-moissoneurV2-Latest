const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');

class StatisticsService {
  /**
   * Get scraper-specific statistics
   * @param {string} scraperId - The ID of the scraper
   * @returns {Promise<Object>} Scraper statistics
   */
  async getScraperStats(scraperId) {
    try {
      // Get scraper jobs
      const { data: jobs } = await supabase
        .from('scraping_jobs')
        .select('*')
        .eq('scraper_id', scraperId)
        .order('created_at', { ascending: false });

      if (!jobs?.length) {
        return {
          totalRuns: 0,
          successRate: 0,
          failureRate: 0,
          averageItemsPerRun: 0,
          lastRun: null,
          itemsOverTime: []
        };
      }

      const successfulJobs = jobs.filter(job => job.status === 'completed');
      const failedJobs = jobs.filter(job => job.status === 'error');

      const stats = {
        totalRuns: jobs.length,
        successRate: (successfulJobs.length / jobs.length) * 100,
        failureRate: (failedJobs.length / jobs.length) * 100,
        averageItemsPerRun: successfulJobs.reduce((acc, job) => acc + job.total_items, 0) / successfulJobs.length || 0,
        lastRun: jobs[0]?.completed_at || jobs[0]?.created_at,
        itemsOverTime: jobs.map(job => ({
          date: job.created_at,
          items: job.total_items || 0,
          status: job.status
        }))
      };

      return stats;
    } catch (error) {
      logger.error(`Error getting stats for scraper ${scraperId}:`, error);
      throw error;
    }
  }

  /**
   * Get overall system statistics
   * @returns {Promise<Object>} System-wide statistics
   */
  async getSystemStats() {
    try {
      // Get all scrapers
      const { data: scrapers } = await supabase
        .from('scrapers')
        .select('id, name, status');

      // Get recent jobs
      const { data: recentJobs } = await supabase
        .from('scraping_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const activeScrapers = scrapers.filter(s => s.status !== 'error' && s.status !== 'disabled');
      const successfulJobs = recentJobs.filter(job => job.status === 'completed');
      const failedJobs = recentJobs.filter(job => job.status === 'error');

      // Group failed jobs by scraper to identify frequently failing ones
      const failuresByScraper = failedJobs.reduce((acc, job) => {
        acc[job.scraper_id] = (acc[job.scraper_id] || 0) + 1;
        return acc;
      }, {});

      const frequentlyFailingScrapers = Object.entries(failuresByScraper)
        .filter(([_, count]) => count >= 3) // Consider "frequent" as 3 or more failures
        .map(([scraperId]) => scrapers.find(s => s.id === scraperId))
        .filter(Boolean);

      return {
        totalScrapers: scrapers.length,
        activeScrapers: activeScrapers.length,
        globalSuccessRate: (successfulJobs.length / recentJobs.length) * 100,
        globalFailureRate: (failedJobs.length / recentJobs.length) * 100,
        frequentlyFailingScrapers,
        totalItemsScraped: successfulJobs.reduce((acc, job) => acc + (job.total_items || 0), 0)
      };
    } catch (error) {
      logger.error('Error getting system stats:', error);
      throw error;
    }
  }

  /**
   * Get detailed error statistics
   * @param {string} scraperId - Optional scraper ID to filter errors
   * @returns {Promise<Object>} Error statistics
   */
  async getErrorStats(scraperId = null) {
    try {
      let query = supabase
        .from('scraping_jobs')
        .select('*')
        .eq('status', 'error')
        .order('created_at', { ascending: false });

      if (scraperId) {
        query = query.eq('scraper_id', scraperId);
      }

      const { data: errorJobs } = await query;

      // Group errors by type/message
      const errorTypes = errorJobs.reduce((acc, job) => {
        const errorType = this.categorizeError(job.error_message);
        acc[errorType] = (acc[errorType] || 0) + 1;
        return acc;
      }, {});

      return {
        totalErrors: errorJobs.length,
        errorTypes,
        recentErrors: errorJobs.slice(0, 10).map(job => ({
          scraperId: job.scraper_id,
          date: job.created_at,
          message: job.error_message
        }))
      };
    } catch (error) {
      logger.error('Error getting error stats:', error);
      throw error;
    }
  }

  /**
   * Categorize error messages into general types
   * @param {string} errorMessage - The error message to categorize
   * @returns {string} Error category
   */
  categorizeError(errorMessage = '') {
    if (!errorMessage) return 'Unknown Error';

    if (errorMessage.includes('timeout')) return 'Timeout';
    if (errorMessage.includes('navigation')) return 'Navigation Error';
    if (errorMessage.includes('selector')) return 'Selector Error';
    if (errorMessage.includes('proxy')) return 'Proxy Error';
    if (errorMessage.includes('blocked') || errorMessage.includes('403')) return 'Access Blocked';
    if (errorMessage.includes('memory')) return 'Memory Error';

    return 'Other';
  }
}

module.exports = new StatisticsService();
