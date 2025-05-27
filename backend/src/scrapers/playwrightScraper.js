const { chromium } = require('playwright');
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');
const crypto = require('crypto');
const scraperStatusHandler = require('../websocket/scraperStatusHandler');
const alertingService = require('../services/alertingService');
const securityService = require('../services/securityService');
const proxyService = require('../services/proxyService');

// Field type detection patterns
const fieldPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
  price: /^\$?\d+(?:[.,]\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\w+ \d{1,2},? \d{4}/,
  url: /^(https?:\/\/)?[\w-]+(\.[\w-]+)+[/#?]?.*$/,
  address: /(street|avenue|road|boulevard|lane|drive|way|court|circle|plaza|square)/i,
  socialMedia: /(facebook|twitter|linkedin|instagram|youtube)\.com/i
};

/**
 * Detect field type based on content
 * @param {string} value - The field value to analyze
 * @returns {string} The detected field type
 */
function detectFieldType(value) {
  if (!value || typeof value !== 'string') return 'text';
  
  for (const [type, pattern] of Object.entries(fieldPatterns)) {
    if (pattern.test(value.trim())) {
      return type;
    }
  }
  return 'text';
}

/**
 * Generate a DOM hash for verification
 * @param {string} html - The HTML content to hash
 * @returns {string} The SHA-256 hash of the cleaned HTML
 */
function generateDOMHash(html) {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return crypto
    .createHash('sha256')
    .update(cleanHtml)
    .digest('hex');
}

/**
 * Try multiple selectors until one works
 * @param {Object} page - Playwright page object
 * @param {Array} selectorList - Array of selector objects
 * @returns {Promise<{element: ElementHandle, selectorUsed: Object}>}
 */
async function trySelectors(page, selectorList) {
  for (const selector of selectorList) {
    try {
      const element = await page.$(selector.value);
      if (element) {
        return { element, selectorUsed: selector };
      }
    } catch (error) {
      logger.debug(`Selector ${selector.value} failed: ${error.message}`);
    }
  }
  return { element: null, selectorUsed: null };
}

/**
 * Enhanced Playwright scraper with DOM verification, fallback logic, and improved error handling
 */
async function playwrightScraper(url, config, scraperId) {
  // Validate and sanitize configuration
  config = securityService.validateScraperConfig(config);
  url = securityService.sanitizeInput(url);

  // Ensure config.pagination is set from selectors.pagination if present
  config.pagination = config.pagination || config.selectors?.pagination || config.selectors?.paginationConfig || { type: 'nextButton', selectors: [{ type: 'css', value: '' }], maxPages: 20 };

  const metrics = {
    startTime: Date.now(),
    totalRequests: 0,
    errorCount: 0,
    notFoundCount: 0,
    requestsPerSecond: 0,
    errorRate: 0
  };

  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';
  
  logger.info(`Starting playwrightScraper for URL: ${url}`);

  // Get stored DOM hash for verification
  const { data: scraper } = await supabase
    .from('scrapers')
    .select('config')
    .eq('id', scraperId)
    .single();

  const storedHash = scraper?.config?.domHash;
  
  const launchOptions = {
    headless: isProduction ? true : false, // Keep headless true for prod, false for dev
    args: [
      '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--disable-software-rasterizer', '--disable-extensions', '--disable-features=site-per-process',
      '--disable-background-networking', '--disable-default-apps', '--disable-sync', '--mute-audio',
      '--no-first-run', '--no-zygote', /*'--single-process',*/ '--no-startup-window', // single-process can cause issues
      `--window-size=${process.env.SCREEN_WIDTH || 1920},${process.env.SCREEN_HEIGHT || 1080}`,
      '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list',
      '--disable-infobars', '--disable-notifications', '--disable-dev-tools'
    ],
    chromiumSandbox: !isProduction, // false for local dev (Windows), true for production (Linux)
    timeout: parseInt(process.env.BROWSER_LAUNCH_TIMEOUT, 10) || 180000,
    ignoreDefaultArgs: ['--enable-automation'],
    ignoreHTTPSErrors: true,
    handleSIGINT: true,
    handleSIGTERM: true,
    handleSIGHUP: true
  };

  if (isProduction && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  } else if (!isProduction) {
    // For local dev, don't set executablePath to let Playwright use its installed browser
    // unless explicitly overridden by a .env var for local dev.
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_DEV) {
        launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH_DEV;
    }
  }
  
  logger.info('Launching browser with Playwright options:', launchOptions);

  let browser = null;
  let context = null;
  let page = null;
  let results = [];
  let pageNum = 1;
  let hasNextPage = true;
  let retryCount = 0;
  let errorCount = 0;
  let pageLoadTimes = [];
  let hashMismatchReported = false;
  let proxy = null;

  try {
    // Get proxy for this run (if any)
    try {
      proxy = await proxyService.getNextProxy(scraperId);
      if (proxy) {
        logger.info(`Using proxy for scraper ${scraperId}: ${proxy.host}:${proxy.port}`);
        launchOptions.proxy = {
          server: `http://${proxy.host}:${proxy.port}`
        };
        if (proxy.username && proxy.password) {
          launchOptions.proxy.username = proxy.username;
          launchOptions.proxy.password = proxy.password;
        }
      }
    } catch (e) {
      logger.warn(`No proxy used for scraper ${scraperId}: ${e.message}`);
    }

    const browserType = chromium; // Or specify based on config if needed
    browser = await browserType.launch(launchOptions);
    logger.info('Playwright browser launched successfully.');
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'running', currentPage: 0, totalItems: 0, type: 'info', message: 'Browser launched successfully'
    });

    logger.info('Creating new browser context...');
    context = await browser.newContext({
        ignoreHTTPSErrors: true, // Already in launchOptions but good for context too
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // Optional: set a common user agent
    });
    logger.info('Browser context created.');

    logger.info('Creating new page...');
    page = await context.newPage();
    logger.info('New page created.');
    
    const navigationTimeout = parseInt(process.env.NAVIGATION_TIMEOUT, 10) || 60000;
    logger.info(`Setting default navigation timeout to ${navigationTimeout}ms`);
    page.setDefaultNavigationTimeout(navigationTimeout);
    page.setDefaultTimeout(navigationTimeout); // For other actions like clicks, waitForSelector

    let currentUrl = url;

    while (hasNextPage && (pageNum <= (config.pagination?.maxPages || parseInt(process.env.MAX_PAGES_PER_SCRAPE, 10) || 50))) {
      metrics.totalRequests++;
      const pageStartTime = Date.now();
      
      // Update metrics
      const duration = (Date.now() - metrics.startTime) / 1000; // in seconds
      metrics.requestsPerSecond = metrics.totalRequests / duration;
      metrics.errorRate = metrics.errorCount / metrics.totalRequests;

      // Check for suspicious activity
      if (securityService.detectSuspiciousActivity(metrics)) {
        await alertingService.createAlert({
          scraperId,
          severity: 'critical',
          category: 'security',
          message: 'Suspicious scraping activity detected',
          data: metrics
        });
        throw new Error('Scraping terminated due to suspicious activity');
      }

      logger.info(`Scraping page ${pageNum}: ${currentUrl}`);
      scraperStatusHandler.sendStatus(scraperId, {
        status: 'running', currentPage: pageNum, totalItems: results.length, type: 'info', message: `Navigating to page ${pageNum}: ${currentUrl.substring(0, 100)}...`
      });

      try {
        logger.info(`Attempting page.goto('${currentUrl}')`);
        const response = await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        if (response) {
            logger.info(`Navigation to ${currentUrl} successful. Status: ${response.status()}`);
        } else {
            logger.warn(`Navigation to ${currentUrl} returned null/undefined response object.`);
        }
        scraperStatusHandler.sendStatus(scraperId, {
            status: 'running', currentPage: pageNum, totalItems: results.length, type: 'info', message: `Page ${pageNum} loaded. Searching for content...`
        });
      } catch (navError) {
        metrics.errorCount++;
        const shouldRetry = await handleError(navError, scraperId, pageNum, results, browser, retryCount);
        if (shouldRetry) {
          retryCount++;
          continue;
        }
        throw navError;
      }

      // Verify DOM structure if hash exists
      if (storedHash && !hashMismatchReported) {
        const currentDom = await page.evaluate(() => document.documentElement.outerHTML);
        const currentHash = generateDOMHash(currentDom);

        if (currentHash !== storedHash) {
          logger.warn(`DOM structure changed for scraper ${scraperId}. Hash mismatch.`);
          hashMismatchReported = true;
          
          // Update scraper status with warning
          await supabase
            .from('scrapers')
            .update({
              status: 'warning',
              config: {
                ...scraper.config,
                lastHashMismatch: new Date().toISOString(),
                currentHash: currentHash
              }
            })
            .eq('id', scraperId);

          scraperStatusHandler.sendStatus(scraperId, {
            status: 'warning',
            currentPage: pageNum,
            totalItems: results.length,
            type: 'warning',
            message: 'Website structure may have changed. Using fallback selectors.'
          });
        }
      }

      // Handle expandable elements with fallback
      if (config.expandableElements) {
        for (const expandConfig of config.expandableElements) {
          const { element } = await trySelectors(page, expandConfig.selectors);
          if (element) {
            try {
              await element.click();
              await page.waitForTimeout(expandConfig.waitAfterClick || 200);
            } catch (e) {
              logger.warn(`Failed to click expandable element: ${e.message}`);
              scraperStatusHandler.sendStatus(scraperId, {
                status: 'running', currentPage: pageNum, totalItems: results.length, type: 'warning', message: `Failed to click expandable element: ${e.message}`
              });
            }
          }
        }
      }

      // Extract data with enhanced selector support and fallback
      try {
        const pageResults = await page.evaluate((config) => {
          function detectFieldType(value) {
            if (!value || typeof value !== 'string') return 'text';
            for (const [type, pattern] of Object.entries(fieldPatterns)) {
              if (pattern.test(value.trim())) {
                return type;
              }
            }
            return 'text';
          }

          // Ensure detectFieldType is available in evaluate context if it was defined outside
          const fieldPatterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
            price: /^\$?\d+(?:[.,]\d{2})?$/,
            date: /^\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\w+ \d{1,2},? \d{4}/,
            url: /^(https?:\/\/)?[\w-]+(\.[\w-]+)+[/#?]?.*$/,
            address: /(street|avenue|road|boulevard|lane|drive|way|court|circle|plaza|square)/i,
            socialMedia: /(facebook|twitter|linkedin|instagram|youtube)\.com/i
          };
          function localDetectFieldType(value) {
            if (!value || typeof value !== 'string') return 'text';
            for (const [type, pattern] of Object.entries(fieldPatterns)) {
              if (pattern.test(value.trim())) {
                return type;
              }
            }
            return 'text';
          }

          function extractFieldValue(container, fieldConfig) {
            // Ensure fieldConfig.selectors is an array
            const selectorsToTry = Array.isArray(fieldConfig.selectors) ? fieldConfig.selectors :
                                   (typeof fieldConfig === 'string' ? [{ type: 'css', value: fieldConfig }] : []);

            for (const selectorObj of selectorsToTry) {
              try {
                const selectorValue = typeof selectorObj === 'string' ? selectorObj : selectorObj.value;
                if (!selectorValue) continue;
                const element = container.querySelector(selectorValue);
                if (element) {
                  const rawValue = element.innerText.trim();
                  const href = element.href;
                  const fieldType = (typeof selectorObj === 'object' && selectorObj.type) || fieldConfig.type || localDetectFieldType(rawValue);
                  
                  switch(fieldType) {
                    case 'email': return href?.startsWith('mailto:') ? href.replace('mailto:', '') : rawValue;
                    case 'url': return href || rawValue;
                    case 'phone': return href?.startsWith('tel:') ? href.replace('tel:', '') : rawValue;
                    case 'price': return rawValue.replace(/[^0-9.]/g, '');
                    case 'date': try { return new Date(rawValue).toISOString(); } catch { return rawValue; }
                    default: return rawValue;
                  }
                }
              } catch (error) {
                console.warn(`Selector ${selectorObj.value || selectorObj} failed:`, error);
                continue;
              }
            }
            return null;
          }

          const results = [];
          let mainElements = [];

          // Adapt for config.main being a string or an object with a selectors array
          const mainSelectorConfigs = Array.isArray(config.main?.selectors) ? config.main.selectors :
                                      (typeof config.main === 'string' ? [{ type: 'css', value: config.main }] : []);

          for (const mainSelectorConfig of mainSelectorConfigs) {
            if (typeof mainSelectorConfig.value !== 'string') continue; // Skip if no valid selector value
            mainElements = document.querySelectorAll(mainSelectorConfig.value);
            if (mainElements.length > 0) break;
          }

          mainElements.forEach(container => {
            const data = {
              text: container.innerText,
              metadata: {}
            };

            // Extract data using enhanced field selectors
            if (config.fields) {
              Object.entries(config.fields).forEach(([key, fieldConfig]) => {
                const value = extractFieldValue(container, fieldConfig);
                if (value) {
                  data.metadata[key] = value;
                }
              });
            }

            results.push(data);
          });

          return results;
        }, config);

        logger.info(`Found ${pageResults.length} results on page ${pageNum}`);
        results = results.concat(pageResults);

        scraperStatusHandler.sendStatus(scraperId, {
          status: 'running', currentPage: pageNum, totalItems: results.length, type: 'success', message: `Found ${pageResults.length} items on page ${pageNum}. Total: ${results.length}`
        });

        // Monitor data quality after each page
        await alertingService.monitorDataQuality(scraperId, pageResults, config);
      } catch (extractError) {
        metrics.errorCount++;
        const shouldRetry = await handleError(extractError, scraperId, pageNum, results, browser, retryCount);
        if (shouldRetry) {
          retryCount++;
          continue;
        }
        throw extractError;
      }

      // Monitor page load time
      pageLoadTimes.push(Date.now() - pageStartTime);
      const avgResponseTime = pageLoadTimes.reduce((a, b) => a + b, 0) / pageLoadTimes.length;
      
      // Monitor performance
      await alertingService.monitorPerformance(scraperId, {
        errorRate: errorCount / pageNum,
        averageResponseTime: avgResponseTime,
        memoryUsage: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal
      });

      // Enhanced pagination handling with fallback
      if (config.pagination) {
        try {
          let nextPageElement = null;
          let nextUrl = null;

          // Try each pagination type in order
          const paginationTypes = ['nextButton', 'numberLinks', 'loadMore'];
          
          for (const type of paginationTypes) {
            if (config.pagination.type === type) {
              switch(type) {
                case 'nextButton': {
                  const { element } = await trySelectors(page, config.pagination.selectors);
                  if (element && await element.isEnabled()) {
                    nextPageElement = element;
                  }
                  break;
                }
                case 'numberLinks': {
                  // Find the active page number and try to click the next one
                  const currentPageNum = pageNum;
                  const allPageLinks = await page.$$(config.pagination.selectors[0].value);
                  for (const link of allPageLinks) {
                    const text = await link.textContent();
                    if (parseInt(text) === currentPageNum + 1) {
                      nextPageElement = link;
                      break;
                    }
                  }
                  break;
                }
                case 'loadMore': {
                  const { element: loadMoreBtn } = await trySelectors(page, config.pagination.selectors);
                  if (loadMoreBtn && await loadMoreBtn.isVisible()) {
                    await loadMoreBtn.click();
                    await page.waitForTimeout(config.pagination.waitAfterClick || 1000);
                    // Don't update URL for "Load More" pagination
                    continue;
                  }
                  break;
                }
              }
              
              if (nextPageElement) break;
            }
          }

          if (nextPageElement) {
            if (config.pagination.type !== 'loadMore') {
              nextUrl = await page.evaluate(el => el.href, nextPageElement);
              if (nextUrl) {
                currentUrl = nextUrl;
                pageNum++;
                continue;
              }
            }
          }

          // If we reach here, no more pages
          hasNextPage = false;

        } catch (paginationError) {
          logger.error('Pagination error:', paginationError);
          hasNextPage = false;
        }
      }
    }

    logger.info('Scraping loop completed.');
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'completed', currentPage: pageNum -1, totalItems: results.length, type: 'success', message: 'Scraping process finished by Playwright.'
    });

    // Final performance check
    const totalTime = Date.now() - startTime;
    if (totalTime > (config.expectedDuration || 300000)) { // 5 minutes default
      await alertingService.createAlert({
        scraperId,
        severity: 'warning',
        category: 'performance',
        message: `Scraping took longer than expected: ${Math.round(totalTime / 1000)}s`,
        data: { actualDuration: totalTime, expectedDuration: config.expectedDuration }
      });
    }

    return results;

  } catch (error) {
    metrics.errorCount++;
    const shouldRetry = await handleError(error, scraperId, pageNum, results, browser, retryCount);
    if (shouldRetry && !securityService.detectSuspiciousActivity(metrics)) {
      return playwrightScraper(url, config, scraperId);
    }
    logger.error(`Playwright scraper final failure for ${scraperId} after ${retryCount} retries: ${error.message}`);
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      logger.info('Finalizing Playwright: closing browser...');
      try {
        await browser.close();
        logger.info('Playwright browser closed successfully in finally block.');
      } catch (e) {
        logger.error('Error closing Playwright browser in finally block:', e);
      }
    } else if (browser && !browser.isConnected()) {
        logger.info('Playwright browser already disconnected in finally.')
    }
  }
}

/**
 * Handle errors with retries and fallback mechanisms
 * @param {Error} error - The error object
 * @param {string} scraperId - The ID of the scraper
 * @param {number} pageNum - The current page number
 * @param {Array} results - The results array
 * @param {Object} browser - The browser instance
 * @param {number} retryCount - The current retry count
 * @returns {Promise<boolean>} - Whether to retry the operation
 */
async function handleError(error, scraperId, pageNum, results, browser, retryCount = 0) {
  const errorType = categorizeError(error);
  
  // Create alert for the error
  await alertingService.createAlert({
    scraperId,
    severity: errorType === 'BLOCKED' ? 'critical' : 'error',
    category: 'scraper_error',
    message: `Scraping error: ${error.message}`,
    data: {
      errorType,
      pageNumber: pageNum,
      retryCount,
      itemsCollected: results.length
    }
  });

  logger.error(`Scraper ${scraperId} error (attempt ${retryCount + 1}): ${error.message}`);
  
  scraperStatusHandler.sendStatus(scraperId, {
    status: 'error',
    type: 'error',
    message: `Error on page ${pageNum} (attempt ${retryCount + 1}): ${error.message.substring(0,100)}`,
    currentPage: pageNum,
    totalItems: results.length,
    error: error.message
  });

  // Handle specific error types
  switch (errorType) {
    case 'NAVIGATION':
      if (retryCount < maxRetries) {
        logger.info(`Retrying navigation after error (attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 5000 * (retryCount + 1)));
        return true; // Indicate retry
      }
      break;

    case 'SELECTOR':
      // Try fallback selectors if available
      return false; // Don't retry, use fallback mechanism

    case 'BLOCKED':
      // Switch proxy if available
      const nextProxy = await proxyService.getNextProxy(scraperId);
      if (nextProxy) {
        logger.info('Switching to next proxy after being blocked');
        return true; // Indicate retry with new proxy
      }
      break;

    case 'MEMORY':
      if (browser) {
        try {
          await browser.close();
          logger.info('Browser closed due to memory error');
        } catch (closeError) {
          logger.error('Error closing browser:', closeError);
        }
      }
      if (retryCount < maxRetries) {
        return true; // Indicate retry with fresh browser
      }
      break;
  }

  return false; // Don't retry if we reach here
}

/**
 * Categorize errors into predefined types
 * @param {Error} error - The error object
 * @returns {string} - The error type
 */
function categorizeError(error) {
  const message = error.message.toLowerCase();
  if (message.includes('timeout') || message.includes('navigation')) return 'NAVIGATION';
  if (message.includes('selector') || message.includes('element not found')) return 'SELECTOR';
  if (message.includes('blocked') || message.includes('403') || message.includes('captcha')) return 'BLOCKED';
  if (message.includes('memory') || message.includes('crashed')) return 'MEMORY';
  return 'UNKNOWN';
}

module.exports = {
  playwrightScraper,
  generateDOMHash
};
