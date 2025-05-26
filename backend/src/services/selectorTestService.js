const { chromium } = require('playwright');
const logger = require('../utils/logger');

/**
 * Test a selector against a URL and return matching elements
 * @param {string} url - The URL to test against
 * @param {Object} selector - The selector object to test
 * @returns {Promise<{matches: number, samples: string[]}>}
 */
async function testSelector(url, selector) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Get all matching elements
    const elements = await page.$$(selector.value);
    const matches = elements.length;

    // Get sample text content from up to 3 elements
    const samples = [];
    for (let i = 0; i < Math.min(3, elements.length); i++) {
      const text = await elements[i].textContent();
      samples.push(text.trim());
    }

    return {
      matches,
      samples
    };

  } catch (error) {
    logger.error(`Error testing selector: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Test pagination configuration
 * @param {string} url - The URL to test against
 * @param {Object} paginationConfig - The pagination configuration to test
 * @returns {Promise<{success: boolean, nextUrl?: string, message: string}>}
 */
async function testPagination(url, paginationConfig) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    let result = {
      success: false,
      message: ''
    };

    switch(paginationConfig.type) {
      case 'nextButton': {
        const nextButton = await page.$(paginationConfig.selectors[0].value);
        if (nextButton) {
          const isEnabled = await nextButton.isEnabled();
          const href = await nextButton.getAttribute('href');
          result = {
            success: true,
            nextUrl: href,
            message: `Next button found${isEnabled ? ' and enabled' : ' but disabled'}`
          };
        } else {
          result = {
            success: false,
            message: 'Next button not found'
          };
        }
        break;
      }

      case 'numberLinks': {
        const pageLinks = await page.$$(paginationConfig.selectors[0].value);
        if (pageLinks.length > 0) {
          const pageNumbers = [];
          for (const link of pageLinks) {
            const text = await link.textContent();
            if (/^\d+$/.test(text.trim())) {
              pageNumbers.push(parseInt(text.trim()));
            }
          }
          result = {
            success: pageNumbers.length > 0,
            message: `Found ${pageNumbers.length} numbered page links`
          };
        } else {
          result = {
            success: false,
            message: 'No page number links found'
          };
        }
        break;
      }

      case 'loadMore': {
        const loadMoreButton = await page.$(paginationConfig.selectors[0].value);
        if (loadMoreButton) {
          const isVisible = await loadMoreButton.isVisible();
          result = {
            success: isVisible,
            message: isVisible ? 'Load more button found and visible' : 'Load more button found but not visible'
          };
        } else {
          result = {
            success: false,
            message: 'Load more button not found'
          };
        }
        break;
      }
    }

    return result;

  } catch (error) {
    logger.error(`Error testing pagination: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  testSelector,
  testPagination
};
