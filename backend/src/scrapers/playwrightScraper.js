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
  phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{3,10}$/,
  price: /^\$?\d+(?:[.,]\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\w+ \d{1,2},? \d{4}/,
  url: /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/,
  address: /((?:\d+[A-Za-z]?,?\s*)?(?:[A-ZaZ\u00C0-\u017F]+\.?\s*)*(?:street|avenue|road|boulevard|lane|drive|way|court|circle|plaza|square|rue|avenue|bd|boulevard|route|quartier|zone|city|cité|lot|immeuble|building).*)/i,
  socialMedia: /(facebook|twitter|linkedin|instagram|youtube|tiktok)\.com/i,
  postalCode: /\b\d{5}(?:[-\s]\d{4})?\b/,
  coordinates: /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
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
            phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{3,10}$/,
            price: /^\$?\d+(?:[.,]\d{2})?$/,
            date: /^\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\w+ \d{1,2},? \d{4}/,
            url: /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/,
            address: /((?:\d+[A-Za-z]?,?\s*)?(?:[A-ZaZ\u00C0-\u017F]+\.?\s*)*(?:street|avenue|road|boulevard|lane|drive|way|court|circle|plaza|square|rue|avenue|bd|boulevard|route|quartier|zone|city|cité|lot|immeuble|building).*)/i,
            socialMedia: /(facebook|twitter|linkedin|instagram|youtube|tiktok)\.com/i,
            postalCode: /\b\d{5}(?:[-\s]\d{4})?\b/,
            coordinates: /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
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
          let usedFallback = false;

          // Adapt for config.main being a string or an object with a selectors array
          let mainSelectorConfigs = [];
          if (config.main) {
            if (typeof config.main === 'string') {
              mainSelectorConfigs = [{ type: 'css', value: config.main }];
            } else if (typeof config.main === 'object') {
              if (Array.isArray(config.main.selectors)) {
                mainSelectorConfigs = config.main.selectors;
              } else if (typeof config.main.selectors === 'string') {
                mainSelectorConfigs = [{ type: 'css', value: config.main.selectors }];
              } else {
                if (typeof config.main.value === 'string') {
                   mainSelectorConfigs = [{ type: 'css', value: config.main.value }];
                } else {
                   mainSelectorConfigs = [];
                }
              }
            }
          }

          for (const mainSelectorConfig of mainSelectorConfigs) {
            if (typeof mainSelectorConfig.value !== 'string') continue;
            mainElements = document.querySelectorAll(mainSelectorConfig.value);
            if (mainElements.length > 0) break;
          }

          // Fallback: if no elements found, use body
          if (mainElements.length === 0) {
            usedFallback = true;
            mainElements = [document.body];
            // Log a warning in the results for debugging
            results.push({
              text: '[WARNING] Main selector matched 0 elements. Fallback to body.',
              metadata: { selector: mainSelectorConfigs.map(s => s.value).join(', '), htmlSnippet: document.body.innerHTML.slice(0, 500) }
            });
          }

          mainElements.forEach(container => {
            const data = {
              text: container.innerText,
              metadata: {}
            };

            if (config.fields && Object.keys(config.fields).length > 0 && !usedFallback) {
              Object.entries(config.fields).forEach(([key, fieldConfig]) => {
                const value = extractFieldValue(container, fieldConfig);
                if (value) {
                  data.metadata[key] = value;
                }
              });
            } else {
              // No child selectors/fields provided or fallback: use heuristics/regex on text
              const text = container.innerText;
              
              // Phone numbers (multiple formats)
              const phoneMatches = [...text.matchAll(/(?:(?:\+|00)[1-9]\d{0,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?\d{2,}(?:[\s.-]?\d{2,})+/g)];
              for (const match of phoneMatches) {
                const phone = match[0].replace(/[\s.-]/g, '');
                if (phone.length >= 8 && phone.length <= 15) {
                  data.metadata.phone = data.metadata.phone || phone;
                }
              }

              // Email addresses
              const emailMatches = [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)];
              for (const match of emailMatches) {
                if (!match[0].includes('example') && !match[0].includes('domain')) {
                  data.metadata.email = data.metadata.email || match[0].toLowerCase();
                }
              }

              // Websites
              const websiteMatches = [...text.matchAll(/(?:https?:\/\/)?([\w-]+(?:\.[\w-]+)+)(?:[\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])?/g)];
              for (const match of websiteMatches) {
                const website = match[0].startsWith('http') ? match[0] : 'http://' + match[0];
                if (!website.includes('facebook.com') && !website.includes('twitter.com')) {
                  data.metadata.website = data.metadata.website || website;
                }
              }

              // Physical address - look for common patterns
              const addressMatches = [...text.matchAll(/(?:(?:\d+[A-Za-z]?,?\s*)?(?:[A-ZaZ\u00C0-\u017F]+\.?\s*)*(?:street|avenue|road|boulevard|lane|drive|way|court|circle|plaza|square|rue|avenue|bd|boulevard|route|quartier|zone|city|cité|lot|immeuble|building).*?)(?=\n|$)/gi)];
              for (const match of addressMatches) {
                if (match[0].length > 10) { // Avoid very short matches
                  data.metadata.address = data.metadata.address || match[0].trim();
                }
              }

              // Business sector/category - comprehensive list
              const sectorMatch = text.match(/(Commerce|Industrie|Services|Santé|Éducation|Transport|Agroalimentaire|Informatique|Télécom|Banque|Assurance|Immobilier|Tourisme|Hôtellerie|Restauration|Artisanat|Mode|Beauté|Sport|Culture|Média|Distribution|Énergie|Environnement|BTP|Logistique|Sécurité|Nettoyage|Recyclage|Formation|Conseil|Audit|Finance|Juridique|RH|Recrutement|Marketing|Communication|Publicité|Événementiel|Traduction|Design|Architecture|Photographie|Vidéo|Musique|Spectacle|Loisirs|Association|Administration|Organisation)/i);
              if (sectorMatch) {
                data.metadata.sector = data.metadata.sector || sectorMatch[0];
              }

              // Company name - first non-empty line that's not a URL, email, or phone number
              const lines = text.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 2 && 
                  !l.match(fieldPatterns.email) && 
                  !l.match(fieldPatterns.url) && 
                  !l.match(fieldPatterns.phone));
              
              if (lines.length > 0) {
                data.metadata.name = data.metadata.name || lines[0];
              }

              // Social media profiles
              const socialMatches = [...text.matchAll(/(?:https?:\/\/)?(?:www\.)?(facebook|twitter|linkedin|instagram|youtube|tiktok)\.com\/[a-zA-Z0-9._%+-]+/g)];
              const socialProfiles = {};
              for (const match of socialMatches) {
                const platform = match[1].toLowerCase();
                socialProfiles[platform] = match[0];
              }
              if (Object.keys(socialProfiles).length > 0) {
                data.metadata.socialProfiles = socialProfiles;
              }
            }

            results.push(data);
          });

          return results;
        }, config);

        results = results.flat().map(result => {
          // Clean up metadata fields
          const cleanedMetadata = {};
          for (const [key, value] of Object.entries(result.metadata)) {
            if (value && typeof value === 'string') {
              cleanedMetadata[key] = value.trim();
            }
          }
          return { text: result.text, metadata: cleanedMetadata };
        });

        // Log the raw results for debugging
        logger.debug('Raw results:', JSON.stringify(results, null, 2));

        // Further processing or filtering of results if needed
        // ...

        // Store results in Supabase
        const { data: insertResults, error: insertError } = await supabase
          .from('scraped_data')
          .insert(results.map(result => ({
            scraper_id: scraperId,
            page_url: currentUrl,
            data: result
          })))
          .select('id, scraper_id, page_url, data')
          .limit(results.length);

        if (insertError) {
          logger.error('Error inserting results into Supabase:', insertError);
          throw new Error('Database insert error');
        }

        logger.info(`Inserted ${insertResults.length} records into Supabase`);

        // Update scraper status
        await supabase
          .from('scrapers')
          .update({
            status: 'success',
            last_scraped_at: new Date().toISOString(),
            total_pages_scraped: pageNum,
            total_records_inserted: results.length
          })
          .eq('id', scraperId);

        scraperStatusHandler.sendStatus(scraperId, {
          status: 'success',
          currentPage: pageNum,
          totalItems: results.length,
          type: 'success',
          message: `Scraping completed successfully. ${results.length} records inserted.`
        });

        hasNextPage = false; // Exit loop after successful scrape
      } catch (extractionError) {
        metrics.errorCount++;
        logger.error(`Error extracting data on page ${pageNum}: ${extractionError.message}`, { stack: extractionError.stack });
        
        // Retry logic for extraction errors
        if (retryCount < 3) {
          logger.info(`Retrying page ${pageNum} due to extraction error...`);
          retryCount++;
          continue;
        }

        // Mark page as not found if specific error occurs
        if (extractionError.message.includes('not found') || extractionError.message.includes('404')) {
          metrics.notFoundCount++;
          logger.warn(`Page not found (404) for URL: ${currentUrl}`);
          scraperStatusHandler.sendStatus(scraperId, {
            status: 'completed',
            currentPage: pageNum,
            totalItems: results.length,
            type: 'warning',
            message: `Page not found (404): ${currentUrl}`
          });
          hasNextPage = false;
          continue;
        }

        // Handle specific known errors with custom messages
        if (extractionError.message.includes('timeout')) {
          logger.warn(`Timeout error on page ${pageNum}: ${currentUrl}`);
          scraperStatusHandler.sendStatus(scraperId, {
            status: 'warning',
            currentPage: pageNum,
            totalItems: results.length,
            type: 'warning',
            message: `Timeout error on page ${pageNum}: ${currentUrl}`
          });
        } else if (extractionError.message.includes('network')) {
          logger.warn(`Network error on page ${pageNum}: ${currentUrl}`);
          scraperStatusHandler.sendStatus(scraperId, {
            status: 'warning',
            currentPage: pageNum,
            totalItems: results.length,
            type: 'warning',
            message: `Network error on page ${pageNum}: ${currentUrl}`
          });
        } else {
          // Unknown error, rethrow
          throw extractionError;
        }

        hasNextPage = false; // Exit loop on error
      }

      pageNum++;
      hasNextPage = config.pagination?.type === 'nextButton' ? await handleNextPageButton(page, config.pagination.selectors, scraperId) : hasNextPage;
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);
    logger.info(`Scraping completed in ${minutes}m ${seconds}s`);

    // Final status update
    await supabase
      .from('scrapers')
      .update({
        status: 'completed',
        last_scraped_at: new Date().toISOString(),
        total_pages_scraped: pageNum - 1,
        total_records_inserted: results.length
      })
      .eq('id', scraperId);

    scraperStatusHandler.sendStatus(scraperId, {
      status: 'completed',
      currentPage: pageNum - 1,
      totalItems: results.length,
      type: 'success',
      message: `Scraping completed successfully. ${results.length} records inserted.`
    });
  } catch (error) {
    logger.error('Error in playwrightScraper:', error);
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'error',
      currentPage: pageNum,
      totalItems: results.length,
      type: 'error',
      message: `Error in scraper: ${error.message}`
    });

    // Final status update on error
    await supabase
      .from('scrapers')
      .update({
        status: 'error',
        last_scraped_at: new Date().toISOString(),
        total_pages_scraped: pageNum,
        total_records_inserted: results.length
      })
      .eq('id', scraperId);
  } finally {
    // Cleanup: close browser and context
    try {
      if (page) {
        await page.close();
        logger.info('Page closed');
      }
    } catch (e) {
      logger.warn('Error closing page:', e.message);
    }

    try {
      if (context) {
        await context.close();
        logger.info('Context closed');
      }
    } catch (e) {
      logger.warn('Error closing context:', e.message);
    }

    try {
      if (browser) {
        await browser.close();
        logger.info('Browser closed');
      }
    } catch (e) {
      logger.warn('Error closing browser:', e.message);
    }

    // Release proxy back to pool
    try {
      if (proxy) {
        await proxyService.releaseProxy(proxy);
        logger.info(`Proxy ${proxy.host}:${proxy.port} released back to pool`);
      }
    } catch (e) {
      logger.warn('Error releasing proxy:', e.message);
    }
  }
}

module.exports = {
  playwrightScraper
};
