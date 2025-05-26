const { chromium } = require('playwright');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate a DOM snapshot and hash for verification
 * @param {string} html - The HTML content to hash
 * @returns {string} The SHA-256 hash of the cleaned HTML
 */
function generateDOMHash(html) {
  // Clean the HTML by removing scripts, comments, and unnecessary attributes
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
 * Client-side script to be injected for element selection
 */
const SELECTOR_SCRIPT = `
window.setupWizard = {
  highlightedElement: null,
  
  init() {
    document.body.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.body.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.body.addEventListener('click', this.handleClick.bind(this));
  },

  handleMouseOver(event) {
    event.stopPropagation();
    const element = event.target;
    element.style.outline = '2px solid #00ff00';
    element.style.cursor = 'pointer';
    this.highlightedElement = element;
  },

  handleMouseOut(event) {
    event.stopPropagation();
    const element = event.target;
    element.style.outline = '';
    element.style.cursor = '';
  },

  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const element = event.target;
    const selector = this.generateSelector(element);
    const elementInfo = {
      selector,
      tagName: element.tagName.toLowerCase(),
      textContent: element.textContent.trim(),
      attributes: Array.from(element.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      }))
    };
    
    window.socket.emit('elementSelected', elementInfo);
  },

  generateSelector(element) {
    const selectors = [];
    let currentElement = element;
    
    while (currentElement && currentElement !== document.body) {
      let selector = currentElement.tagName.toLowerCase();
      
      // Add ID if present
      if (currentElement.id) {
        return '#' + currentElement.id;
      }
      
      // Add classes
      const classes = Array.from(currentElement.classList).join('.');
      if (classes) {
        selector += '.' + classes;
      }
      
      // Check if selector is unique
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
      
      // Add nth-child if needed
      const parent = currentElement.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(currentElement) + 1;
        selector += ':nth-child(' + index + ')';
      }
      
      selectors.unshift(selector);
      currentElement = currentElement.parentElement;
    }
    
    return selectors.join(' > ');
  }
};

window.setupWizard.init();
`;

class SetupWizardService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Start a new setup session
   * @param {string} url - The target URL to scrape
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<{sessionId: string, pageTitle: string}>}
   */
  async startSession(url, sessionId) {
    logger.info(`Starting setup session ${sessionId} for URL: ${url}`);

    const browser = await chromium.launch({
      headless: false,
      args: ['--disable-dev-shm-usage', '--no-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Store session data
    this.sessions.set(sessionId, {
      browser,
      context,
      page,
      selectors: {
        main: null,
        fields: {}
      },
      domSnapshot: null,
      domHash: null
    });

    try {
      await page.goto(url);
      await page.addScriptTag({ content: SELECTOR_SCRIPT });
      
      const pageTitle = await page.title();
      return { sessionId, pageTitle };
    } catch (error) {
      logger.error(`Error starting setup session: ${error.message}`);
      await this.endSession(sessionId);
      throw error;
    }
  }

  /**
   * Handle element selection during setup
   * @param {string} sessionId - Session identifier
   * @param {Object} elementInfo - Information about the selected element
   * @param {string} fieldName - Name of the field being selected
   * @returns {Promise<Object>} Updated selectors configuration
   */
  async handleElementSelection(sessionId, elementInfo, fieldName) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const { page, selectors } = session;

    // Verify the selector works
    const elements = await page.$$(elementInfo.selector);
    const count = elements.length;

    if (fieldName === 'main') {
      selectors.main = {
        selectors: [{
          type: 'css',
          value: elementInfo.selector
        }]
      };
    } else {
      selectors.fields[fieldName] = {
        type: 'text',
        selectors: [{
          type: 'css',
          value: elementInfo.selector
        }]
      };
    }

    return {
      selectors,
      matchCount: count,
      sampleData: await this.getSampleData(page, elementInfo.selector, count)
    };
  }

  /**
   * Get sample data for the selected elements
   * @param {Page} page - Playwright page object
   * @param {string} selector - CSS selector
   * @param {number} count - Number of elements matched
   * @returns {Promise<string[]>} Sample data from matched elements
   */
  async getSampleData(page, selector, count) {
    const samples = await page.evaluate((sel, max) => {
      const elements = document.querySelectorAll(sel);
      const results = [];
      for (let i = 0; i < Math.min(max, 3); i++) {
        if (elements[i]) {
          results.push(elements[i].textContent.trim());
        }
      }
      return results;
    }, selector, count);

    return samples;
  }

  /**
   * Finalize the setup and generate DOM snapshot
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Final configuration with DOM snapshot and hash
   */
  async finalizeSetup(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const { page, selectors } = session;

    // Generate DOM snapshot
    const domSnapshot = await page.evaluate(() => document.documentElement.outerHTML);
    const domHash = generateDOMHash(domSnapshot);

    const config = {
      selectors,
      domSnapshot,
      domHash
    };

    await this.endSession(sessionId);
    return config;
  }

  /**
   * End a setup session and cleanup resources
   * @param {string} sessionId - Session identifier
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const { browser } = session;
      await browser.close();
      this.sessions.delete(sessionId);
      logger.info(`Setup session ${sessionId} ended`);
    }
  }
}

module.exports = new SetupWizardService();
