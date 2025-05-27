const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const scraperStatusHandler = require('../websocket/scraperStatusHandler');
const fs = require('fs');

/**
 * Puppeteer scraper: supports clicking dropdowns and extracting any content via multiple selectors.
 * This is optimized for VM environment.
 * @param {string} url - The starting URL.
 * @param {Object} selectors - Object containing main, child, pagination, and dropdownClick selectors
 * @param {string} scraperId - The ID of the scraper for status updates
 * @returns {Promise<object[]>}
 */
async function puppeteerScraper(url, selectors, scraperId) {
  const isProduction = process.env.NODE_ENV === 'production';
  logger.info(`Launching browser in ${isProduction ? 'headless' : 'visible'} mode for Puppeteer`);

  const launchOptions = {
    headless: isProduction ? 'new' : false,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas', '--disable-gpu',
      `--window-size=${process.env.SCREEN_WIDTH || 1920},${process.env.SCREEN_HEIGHT || 1080}`,
      /*'--single-process',*/ '--no-zygote', // single-process can be problematic
      '--disable-extensions', '--disable-features=site-per-process',
      '--disable-component-extensions-with-background-pages', '--disable-default-apps',
      '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list',
      '--disable-infobars', '--disable-notifications', '--disable-dev-tools'
    ],
    timeout: parseInt(process.env.BROWSER_LAUNCH_TIMEOUT, 10) || 180000,
    protocolTimeout: parseInt(process.env.BROWSER_LAUNCH_TIMEOUT, 10) || 180000, // Ensure this is adequate
    ignoreHTTPSErrors: true,
    handleSIGINT: true,
    handleSIGTERM: true,
    handleSIGHUP: true
  };

  if (isProduction && process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else if (!isProduction) {
    if (process.env.PUPPETEER_EXECUTABLE_PATH_DEV) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH_DEV;
    }
  }

  logger.info('Launching browser with Puppeteer options:', launchOptions);

  let browser = null;
  let page = null;
  let results = [];
  let pageNum = 1;
  let hasNextPage = true;

  try {
    browser = await puppeteer.launch(launchOptions);
    logger.info('Puppeteer browser launched successfully.');
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'running', currentPage: 0, totalItems: 0, type: 'info', message: 'Browser (Puppeteer) launched successfully'
    });

    logger.info('Puppeteer: Creating new page...');
    page = await browser.newPage();
    logger.info('Puppeteer: New page created.');

    const navigationTimeout = parseInt(process.env.NAVIGATION_TIMEOUT, 10) || 60000;
    logger.info(`Puppeteer: Setting default navigation timeout to ${navigationTimeout}ms`);
    page.setDefaultNavigationTimeout(navigationTimeout);
    page.setDefaultTimeout(navigationTimeout); // For other actions
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    let currentUrl = url;
    while (hasNextPage && (pageNum <= (parseInt(process.env.MAX_PAGES_PER_SCRAPE, 10) || 50))) {
      logger.info(`Puppeteer: Scraping page ${pageNum}: ${currentUrl || 'URL not defined'}`);
      scraperStatusHandler.sendStatus(scraperId, {
        status: 'running', 
        currentPage: pageNum, 
        totalItems: results.length, 
        type: 'info', 
        message: `Puppeteer: Navigating to page ${pageNum}: ${(currentUrl || 'N/A').substring(0,100)}...`
      });

      try {
        if (!currentUrl) {
          logger.warn('Puppeteer: currentUrl is undefined, cannot navigate. Ending pagination.');
          hasNextPage = false;
          continue;
        }
        logger.info(`Puppeteer: Attempting page.goto(\'${currentUrl}\')`);
        const response = await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        if (response) {
            logger.info(`Puppeteer: Navigation to ${currentUrl} successful. Status: ${response.status()}`);
        } else {
            logger.warn(`Puppeteer: Navigation to ${currentUrl} returned null/undefined response object.`);
        }
        scraperStatusHandler.sendStatus(scraperId, {
            status: 'running', currentPage: pageNum, totalItems: results.length, type: 'info', message: `Puppeteer: Page ${pageNum} loaded. Searching for content...`
        });
      } catch (navError) {
        logger.error(`Puppeteer page.goto(\'${currentUrl}\') failed:`, navError);
        scraperStatusHandler.sendStatus(scraperId, {
            status: 'error', currentPage: pageNum, totalItems: results.length, type: 'error', message: `Puppeteer: Failed to navigate to ${currentUrl.substring(0,100)}: ${navError.message}`
        });
        throw navError; // Propagate to main catch
      }

      // Click all dropdowns/arrows if a selector is provided
      if (selectors.dropdownClick) {
        const dropdowns = await page.$$(selectors.dropdownClick);
        logger.info(`Found ${dropdowns.length} dropdown elements to click`);
        scraperStatusHandler.sendStatus(scraperId, {
          status: 'running', currentPage: pageNum, totalItems: results.length, type: 'info', message: `Puppeteer: Found ${dropdowns.length} dropdown elements to expand`
        });

        for (const dropdown of dropdowns) {
          try {
            await dropdown.click();
            await page.waitForTimeout(200);
          } catch (e) {
            logger.warn(`Puppeteer: Failed to click dropdown: ${e.message}`);
            scraperStatusHandler.sendStatus(scraperId, {
              status: 'running', currentPage: pageNum, totalItems: results.length, type: 'warning', message: `Puppeteer: Failed to click a dropdown element: ${e.message}`
            });
          }
        }
      }

      // Wait for the main container to appear
      try {
        logger.info(`Puppeteer: Waiting for main selector: ${selectors.main}`);
        await page.waitForSelector(selectors.main, { timeout: 15000 });
        logger.info('Puppeteer: Main selector found.');
        // Extract data from all matching main containers
        const pageResults = await page.evaluate((config) => {
          const mainContainers = document.querySelectorAll(config.main);
          const results = [];

          mainContainers.forEach(container => {
            const data = {
              text: container.innerText,
              metadata: {}
            };

            // Extract data using child selectors
            if (config.child) {
              Object.entries(config.child).forEach(([key, selector]) => {
                const element = container.querySelector(selector);
                if (element) {
                  if (key === 'email' && element.href?.startsWith('mailto:')) {
                    data.metadata[key] = element.href.replace('mailto:', '');
                  } else if (key === 'website' && element.href) {
                    data.metadata[key] = element.href;
                  } else if (key === 'phone' && element.href?.startsWith('tel:')) {
                    data.metadata[key] = element.href.replace('tel:', '');
                  } else {
                    data.metadata[key] = element.innerText.trim();
                  }
                }
              });
            }

            results.push(data);
          });

          return results;
        }, selectors);

        logger.info(`Puppeteer: Found ${pageResults.length} results on page ${pageNum}`);
        results = results.concat(pageResults);

        scraperStatusHandler.sendStatus(scraperId, {
          status: 'running', currentPage: pageNum, totalItems: results.length, type: 'success', message: `Puppeteer: Found ${pageResults.length} items on page ${pageNum}. Total: ${results.length}`
        });
      } catch (e) {
        logger.error(`Puppeteer: Main selector ${selectors.main} not found on ${currentUrl}: ${e.message}`);
        scraperStatusHandler.sendStatus(scraperId, {
          status: 'error', currentPage: pageNum, totalItems: results.length, type: 'info', message: `Puppeteer: Main content not found on page ${pageNum}.`
        });
        hasNextPage = false; 
        continue;
      }

      // Handle pagination if selector is provided
      if (selectors.pagination) {
        try {
            const nextPageLink = await page.$(selectors.pagination);
            if (nextPageLink) {
                const nextHref = await page.evaluate(el => el.href, nextPageLink);
                if (nextHref && typeof nextHref === 'string') {
                    currentUrl = nextHref;
                    logger.info(`Puppeteer: Found next page link: ${currentUrl}`);
                    pageNum++;
                } else {
                    logger.info('Puppeteer: Next page link found, but href is invalid or missing. Ending pagination.');
                    hasNextPage = false;
                }
            } else {
                logger.info('Puppeteer: No next page link found.');
                hasNextPage = false;
            }
        } catch (paginationError) {
            logger.error('Puppeteer: Error finding or evaluating pagination selector:', paginationError);
            hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
    // ... (end of while loop)

    logger.info('Puppeteer: Scraping loop completed.');
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'completed', currentPage: pageNum -1, totalItems: results.length, type: 'success', message: 'Scraping process finished by Puppeteer.'
    });
    return results;

  } catch (error) {
    logger.error(`Puppeteer scraper failed: ${error.message}. Stack: ${error.stack}`);
    scraperStatusHandler.sendStatus(scraperId, {
      status: 'error',
      currentPage: pageNum,
      totalItems: results.length,
      type: 'error',
      message: `Puppeteer failed: ${error.message.substring(0,150)}`,
      error: error.message
    });
    // Do not fall back from Puppeteer, just let it fail.
    // throw error; // Optionally re-throw if needed by calling code
    return []; // Or return empty results on failure
  } finally {
    if (browser) {
      logger.info('Finalizing Puppeteer: closing browser...');
      try {
        await browser.close();
        logger.info('Puppeteer browser closed successfully.');
      } catch (e) {
        logger.error('Error closing Puppeteer browser:', e);
      }
    }
  }
}

module.exports = {
  puppeteerScraper
}; 