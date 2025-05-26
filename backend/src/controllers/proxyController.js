const proxyService = require('../services/proxyService');
const logger = require('../utils/logger');

/**
 * Add a proxy to a scraper's configuration
 */
async function addProxy(req, res) {
  try {
    const { scraperId } = req.params;
    const proxyConfig = req.body;

    // Validate required fields
    if (!proxyConfig.host || !proxyConfig.port) {
      return res.status(400).json({
        error: 'Proxy host and port are required'
      });
    }

    // Add unique ID to proxy config
    proxyConfig.id = `proxy_${Date.now()}`;

    const updatedScraper = await proxyService.addProxy(scraperId, proxyConfig);
    res.json(updatedScraper);
  } catch (error) {
    logger.error('Error adding proxy:', error);
    res.status(500).json({
      error: 'Failed to add proxy',
      details: error.message
    });
  }
}

/**
 * Remove a proxy from a scraper's configuration
 */
async function removeProxy(req, res) {
  try {
    const { scraperId, proxyId } = req.params;
    await proxyService.removeProxy(scraperId, proxyId);
    res.json({ message: 'Proxy removed successfully' });
  } catch (error) {
    logger.error('Error removing proxy:', error);
    res.status(500).json({
      error: 'Failed to remove proxy',
      details: error.message
    });
  }
}

/**
 * Get all proxies for a scraper
 */
async function getProxies(req, res) {
  try {
    const { scraperId } = req.params;
    const { data, error } = await supabase
      .from('scrapers')
      .select('config')
      .eq('id', scraperId)
      .single();

    if (error) {
      throw error;
    }

    const proxies = data.config.proxies || [];
    res.json(proxies);
  } catch (error) {
    logger.error('Error getting proxies:', error);
    res.status(500).json({
      error: 'Failed to get proxies',
      details: error.message
    });
  }
}

/**
 * Test a proxy connection
 */
async function testProxy(req, res) {
  try {
    const { host, port, username, password } = req.body;
    const testUrl = 'http://example.com'; // Use a reliable test URL

    const browser = await chromium.launch({
      proxy: {
        server: `http://${host}:${port}`,
        username,
        password
      }
    });

    try {
      const page = await browser.newPage();
      await page.goto(testUrl);
      await browser.close();

      res.json({
        success: true,
        message: 'Proxy connection successful'
      });
    } catch (error) {
      await browser.close();
      throw new Error(`Proxy test failed: ${error.message}`);
    }
  } catch (error) {
    logger.error('Error testing proxy:', error);
    res.status(500).json({
      error: 'Proxy test failed',
      details: error.message
    });
  }
}

module.exports = {
  addProxy,
  removeProxy,
  getProxies,
  testProxy
};
