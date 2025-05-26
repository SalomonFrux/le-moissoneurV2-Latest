const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');

class ProxyService {
  /**
   * Add a new proxy to a scraper's configuration
   * @param {string} scraperId - The ID of the scraper
   * @param {Object} proxyConfig - Proxy configuration object
   * @returns {Promise<Object>} Updated scraper configuration
   */
  async addProxy(scraperId, proxyConfig) {
    try {
      // Validate proxy configuration
      if (!proxyConfig.host || !proxyConfig.port) {
        throw new Error('Proxy host and port are required');
      }

      const { data: scraper, error: fetchError } = await supabase
        .from('scrapers')
        .select('config')
        .eq('id', scraperId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Update config with new proxy
      const updatedConfig = {
        ...scraper.config,
        proxies: [
          ...(scraper.config.proxies || []),
          {
            ...proxyConfig,
            lastUsed: null,
            successCount: 0,
            failureCount: 0
          }
        ]
      };

      const { data, error } = await supabase
        .from('scrapers')
        .update({ config: updatedConfig })
        .eq('id', scraperId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error adding proxy to scraper ${scraperId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a proxy from a scraper's configuration
   * @param {string} scraperId - The ID of the scraper
   * @param {string} proxyId - The ID of the proxy to remove
   */
  async removeProxy(scraperId, proxyId) {
    try {
      const { data: scraper, error: fetchError } = await supabase
        .from('scrapers')
        .select('config')
        .eq('id', scraperId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const updatedConfig = {
        ...scraper.config,
        proxies: (scraper.config.proxies || []).filter(p => p.id !== proxyId)
      };

      const { error } = await supabase
        .from('scrapers')
        .update({ config: updatedConfig })
        .eq('id', scraperId);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error(`Error removing proxy ${proxyId} from scraper ${scraperId}:`, error);
      throw error;
    }
  }

  /**
   * Get the next available proxy for a scraper
   * @param {string} scraperId - The ID of the scraper
   * @returns {Promise<Object|null>} The next proxy to use
   */
  async getNextProxy(scraperId) {
    try {
      const { data: scraper, error } = await supabase
        .from('scrapers')
        .select('config')
        .eq('id', scraperId)
        .single();

      if (error) {
        throw error;
      }

      const proxies = scraper.config.proxies || [];
      if (proxies.length === 0) {
        return null;
      }

      // Simple round-robin selection for now
      // Could be enhanced with more sophisticated selection based on success rates
      const proxy = proxies.reduce((prev, current) => {
        if (!prev.lastUsed) return current;
        if (!current.lastUsed) return current;
        return new Date(prev.lastUsed) > new Date(current.lastUsed) ? current : prev;
      });

      // Update last used timestamp
      const updatedProxies = proxies.map(p => 
        p.id === proxy.id 
          ? { ...p, lastUsed: new Date().toISOString() }
          : p
      );

      await supabase
        .from('scrapers')
        .update({
          config: {
            ...scraper.config,
            proxies: updatedProxies
          }
        })
        .eq('id', scraperId);

      return proxy;
    } catch (error) {
      logger.error(`Error getting next proxy for scraper ${scraperId}:`, error);
      throw error;
    }
  }

  /**
   * Update proxy statistics after use
   * @param {string} scraperId - The ID of the scraper
   * @param {string} proxyId - The ID of the proxy
   * @param {boolean} success - Whether the proxy was used successfully
   */
  async updateProxyStats(scraperId, proxyId, success) {
    try {
      const { data: scraper, error: fetchError } = await supabase
        .from('scrapers')
        .select('config')
        .eq('id', scraperId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const updatedProxies = (scraper.config.proxies || []).map(p => 
        p.id === proxyId
          ? {
              ...p,
              successCount: p.successCount + (success ? 1 : 0),
              failureCount: p.failureCount + (success ? 0 : 1),
              lastUsed: new Date().toISOString()
            }
          : p
      );

      const { error } = await supabase
        .from('scrapers')
        .update({
          config: {
            ...scraper.config,
            proxies: updatedProxies
          }
        })
        .eq('id', scraperId);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error(`Error updating proxy stats for scraper ${scraperId}:`, error);
      throw error;
    }
  }
}

module.exports = new ProxyService();
