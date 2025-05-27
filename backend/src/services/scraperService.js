const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');
const { genericScraper } = require('../scrapers/genericScraper');
const { newsPortalScraper } = require('../scrapers/newsPortalScraper');
const { playwrightScraper } = require('../scrapers/playwrightScraper');
const { puppeteerScraper } = require('../scrapers/puppeteerScraper');
const dataTransformationService = require('./dataTransformationService');

// Configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 3000;
const MAX_DELAY = 30000;
const MAX_CONCURRENT_PAGES = 2;

let lastRequestTime = 0;
const activeRequests = new Set();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < INITIAL_DELAY) {
    await sleep(INITIAL_DELAY - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
}

async function withRetry(operation, maxRetries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Rate limiting
      await waitForRateLimit();
      
      return await operation();
    } catch (error) {
      lastError = error;
      
      const isRetryableError = 
        error.message.includes('socket hang up') ||
        error.message.includes('net::') ||
        error.message.includes('Protocol error') ||
        error.message.includes('Target closed') ||
        error.message.includes('Connection closed') ||
        error.message.includes('ERR_CONNECTION_RESET') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_EMPTY_RESPONSE');
      
      if (!isRetryableError) throw error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(
          INITIAL_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000,
          MAX_DELAY
        );
        
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

async function createBrowserInstance() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920x1080',
    '--no-first-run',
    '--no-zygote',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-apps',
    '--mute-audio',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-http2',
    '--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost"',
    '--disable-features=site-per-process,TranslateUI',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-breakpad',
    '--disable-ipc-flooding-protection'
  ];

  // Wait for concurrent requests limit
  while (activeRequests.size >= MAX_CONCURRENT_PAGES) {
    await sleep(1000);
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      },
      timeout: 60000,
      protocolTimeout: 60000
    });

    browser.on('disconnected', () => {
      activeRequests.delete(browser);
    });

    activeRequests.add(browser);
    return browser;
  } catch (error) {
    logger.error(`Failed to create browser instance: ${error.message}`);
    throw error;
  }
}

async function executeScraper(scraper, jobId = null) {
  logger.info(`Starting scraper: ${scraper.name} (${scraper.id})`);
  
  let browser;
  let scrapedData = [];
  const runId = jobId || `manual-${Date.now()}`;
  let jobRecordId = null;
  const startedAt = new Date().toISOString();

  // Insert job run record at start
  try {
    const { data: jobInsert, error: jobInsertError } = await supabase
      .from('scraping_jobs')
      .insert({
        scraper_id: scraper.id,
        job_id: runId,
        status: 'running',
        started_at: startedAt
      })
      .select('id')
      .single();
    if (jobInsertError) {
      logger.error(`Failed to insert scraping_jobs record: ${jobInsertError.message}`);
    } else {
      jobRecordId = jobInsert.id;
    }
  } catch (e) {
    logger.error('Exception inserting scraping_jobs record:', e);
  }

  // Helper function to extract data using regex patterns
  const extractInfo = (text, pattern) => {
    if (!text) return null;
    const match = text.match(new RegExp(pattern, 'i'));
    return match ? match[1].trim() : null;
  };

  try {
    await withRetry(async () => {
      // Use Playwright if type is 'playwright'
      if (scraper.type === 'playwright') {
        // Get existing data before scraping
        const { data: existingData, error } = await supabase
          .from('scraped_data')
          .select('*')
          .eq('scraper_id', scraper.id);
          
        if (error) {
          logger.error(`Error fetching scraped data: ${JSON.stringify(error)}`);
          // Continue with empty existing data
        }
        
        const safeExistingData = Array.isArray(existingData) ? existingData : [];

        try {
          // Try using Playwright first
          logger.info(`Attempting to use Playwright for scraper ${scraper.id}`);
          
          // Scrape new data with Playwright
          scrapedData = await playwrightScraper(
            scraper.source || scraper.url,
            {
              main: scraper.selectors?.main,
              child: scraper.selectors?.child || {},
              pagination: scraper.selectors?.pagination,
              dropdownClick: scraper.selectors?.dropdownClick
            },
            scraper.id // Pass the scraper ID for WebSocket status updates
          );
        } catch (playwrightError) {
          // If Playwright fails, try Puppeteer as a fallback
          logger.warn(`Playwright failed with error: ${playwrightError.message}. Trying Puppeteer as fallback.`);
          
          // Send status update about fallback
          const scraperStatusHandler = require('../websocket/scraperStatusHandler');
          scraperStatusHandler.sendStatus(scraper.id, {
            status: 'running',
            currentPage: 0,
            totalItems: 0,
            type: 'warning',
            message: `Switching to fallback scraper (Puppeteer): ${playwrightError.message}`
          });
          
          // Scrape with Puppeteer
          scrapedData = await puppeteerScraper(
            scraper.source || scraper.url,
            {
              main: scraper.selectors?.main,
              child: scraper.selectors?.child || {},
              pagination: scraper.selectors?.pagination,
              dropdownClick: scraper.selectors?.dropdownClick
            },
            scraper.id 
          );
        }
        
        if (scrapedData.length === 0) {
          logger.warn(`No data scraped for ${scraper.id}`);
        }
        
        // Map results to expected format, preserving existing values
        scrapedData = scrapedData.map((result, index) => {
          const existing = safeExistingData[index] || {};
          const existingMetadata = existing.metadata || {};
          
          // --- PATCH: Add regex fallback for all key fields (name, phone, email, website, address, category) ---
          // This ensures that if selectors miss a field, we still try to extract it from the text, like the old code.
          const text = result.text || '';
          const newMetadata = {
            name: result.metadata?.name || result.name || extractInfo(text, /(?:name|nom)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.name,
            phone: result.metadata?.phone || result.phone || extractInfo(text, /(?:tel|phone|t[ée]l[ée]phone)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.phone,
            email: result.metadata?.email || result.email || extractInfo(text, /(?:email|e-mail|mail)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.email,
            website: result.metadata?.website || result.website || extractInfo(text, /(?:website|site web|site)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.website,
            address: result.metadata?.address || result.address || extractInfo(text, /(?:address|adresse)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.address,
            category: result.metadata?.category || result.category || extractInfo(text, /(?:sector|secteur|cat[ée]gorie)\s*:?[ \t]*([^\n]+)/i) || existingMetadata.category
          };
          return {
            title: newMetadata.name || scraper.name,
            content: result.text,
            url: scraper.source || scraper.url,
            metadata: newMetadata
          };
          // --- END PATCH ---
        });
        
        return;
      }
      
      // For other scraper types
      browser = await createBrowserInstance();
      const scrapeOperation = async () => {
        if (scraper.type === 'news') {
          return await newsPortalScraper(browser, scraper);
        } else {
          return await genericScraper(browser, scraper);
        }
      };
      scrapedData = await scrapeOperation();
    });

    if (scrapedData.length > 0) {
      const dataToInsert = scrapedData.map(item => {
        // Extract data from metadata and content
        const metadata = item.metadata || {};
        const content = item.content || '';
        
        // Use metadata values if available, otherwise try to extract from content
        const extractedData = {
          name: metadata.name || item.title || 'Unknown',
          sector: metadata.category || 'Unknown',
          country: scraper.country || 'Unknown',
          website: metadata.website || extractInfo(content, /Site web\s*:\s*([^\n]+)/i),
          email: metadata.email || extractInfo(content, /E-mail\s*:\s*([^\n]+)/i),
          phone: metadata.phone || extractInfo(content, /Tel\s*:\s*([^\n]+)/i),
          address: metadata.address || extractInfo(content, /Address\s*:\s*([^\n]+)/i),
          source: scraper.source,
          last_updated: new Date().toISOString()
        };

        // Clean up website URL if it exists and isn't already formatted
        if (extractedData.website && !extractedData.website.toLowerCase().startsWith('http')) {
          extractedData.website = `https://${extractedData.website}`;
        }

        return {
          scraper_id: scraper.id,
          nom: extractedData.name,
          secteur: extractedData.sector || scraper.sector || 'Aucune donnée',
          pays: scraper.country || 'Maroc',
          site_web: extractedData.website,
          email: extractedData.email,
          telephone: extractedData.phone,
          adresse: extractedData.address,
          contenu: item.content,
          lien: item.url || scraper.source || null,
          metadata: {
            ...metadata,
            original_content: item.content,
            extracted_data: extractedData
          },
          created_at: new Date().toISOString()
        };
      });

      await withRetry(async () => {
        // First, delete existing entries for this scraper
        const { error: deleteError } = await supabase
          .from('scraped_data')
          .delete()
          .eq('scraper_id', scraper.id);

        if (deleteError) {
          throw new Error(`Failed to delete existing data: ${deleteError.message}`);
        }

        // Then insert the new data
        const { error: insertError } = await supabase
          .from('scraped_data')
          .insert(dataToInsert);

        if (insertError) {
          throw new Error(`Failed to store scraped data: ${insertError.message}`);
        }
      });

      // Extract and insert company data
      for (const item of scrapedData) {
        let content = item.content;
        let metadata = item.metadata;

        // Parse content if it's a string
        if (typeof content === 'string') {
          try {
            const parsedContent = JSON.parse(content);
            content = parsedContent;
            metadata = parsedContent.metadata || metadata;
          } catch (e) {
            // If parsing fails, use the string content
            content = { text: content };
          }
        }

        // Extract information from content
        const text = content.text || '';
        
        // Extract data using regex patterns
        const extractedData = {
          name: item.title || 'Unknown',
          sector: 'Unknown',
          country: scraper.country || 'Unknown', // Use the country from scraper config
          website: extractInfo(text, /Site web\s*:\s*([^\n]+)/i),
          email: extractInfo(text, /E-mail\s*:\s*([^\n]+)/i),
          phone: extractInfo(text, /Tel\s*:\s*([^\n]+)/i),
          address: extractInfo(text, /Address\s*:\s*([^\n]+)/i),
          source: scraper.source, // Use the source URL instead of scraper name
          last_updated: new Date().toISOString()
        };

        // Clean up the data
        if (extractedData.website && !extractedData.website.startsWith('http')) {
          extractedData.website = `http://${extractedData.website}`;
        }

        // Remove any HTML tags from the extracted data
        Object.keys(extractedData).forEach(key => {
          if (typeof extractedData[key] === 'string') {
            extractedData[key] = extractedData[key].replace(/<[^>]*>/g, '');
          }
        });

        await supabase.from('companies').upsert(extractedData, { 
          onConflict: ['name', 'country', 'source'],
          ignoreDuplicates: false
        });
      }

      const { data: currentData, error: countError } = await supabase
        .from('scraped_data')
        .select('id')
        .eq('scraper_id', scraper.id);

      if (countError) {
        logger.error(`Error getting data count: ${countError.message}`);
      }

      const dataCount = currentData?.length || 0;

      await withRetry(async () => {
        await supabase
          .from('scrapers')
          .update({ 
            status: 'completed',
            last_run: new Date().toISOString(),
            data_count: dataCount
          })
          .eq('id', scraper.id);
      });

      // Update job run record on success
      try {
        await supabase
          .from('scraping_jobs')
          .update({
            status: 'completed',
            total_items: dataCount,
            total_pages: 1, // TODO: update if multi-page
            completed_at: new Date().toISOString()
          })
          .eq('job_id', runId);
      } catch (e) {
        logger.error('Failed to update scraping_jobs record on success:', e);
      }

      // Apply transformation rules if defined
      const transformations = scraper.config?.transformations || [];
      if (transformations.length > 0) {
        scrapedData = scrapedData.map(item => dataTransformationService.applyTransformations(item, transformations));
      }

      logger.info(`Stored ${dataToInsert.length} items for scraper ${scraper.id}. Total items: ${dataCount}`);
    } else {
      logger.warn(`No data scraped for ${scraper.id}`);
      
      await withRetry(async () => {
        await supabase
          .from('scrapers')
          .update({ 
            status: 'completed',
            last_run: new Date().toISOString()
          })
          .eq('id', scraper.id);
      });
    }

    return scrapedData;
    
  } catch (error) {
    logger.error(`Error executing scraper ${scraper.id}: ${error.message}`);
    
    await withRetry(async () => {
      await supabase
        .from('scrapers')
        .update({ 
          status: 'error', 
          last_run: new Date().toISOString() 
        })
        .eq('id', scraper.id);
    });
    
    // Update job run record on error
    try {
      await supabase
        .from('scraping_jobs')
        .update({
          status: 'error',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('job_id', runId);
    } catch (e) {
      logger.error('Failed to update scraping_jobs record on error:', e);
    }
    
    throw error;
  } finally {
    if (browser) {
      try {
        activeRequests.delete(browser);
        await browser.close();
      } catch (error) {
        logger.error(`Error closing browser: ${error.message}`);
      }
    }
  }
}

/**
 * Populate the companies table with data extracted from the scraped_data table.
 */
async function populateCompanies() {
  const { data: scrapedData, error } = await supabase.from('scraped_data').select('*');
  if (error) return logger.error('Error fetching scraped_data:', error);
  for (const record of scrapedData) {
    const meta = record.content || record.metadata || {};
    const company = {
      name: meta.name || record.title || 'Unknown',
      sector: meta.sector || 'Unknown',
      country: meta.country || 'Unknown',
      website: meta.website || null,
      linkedin: meta.linkedin || null,
      email: meta.email || null,
      source: record.scraper_id,
      last_updated: record.scraped_at,
    };
    const { data: exists } = await supabase.from('companies').select('id').eq('name', company.name).single();
    if (!exists) {
      await supabase.from('companies').insert(company);
    }
  }
  logger.info('Companies enrichment done.');
}

// Call after scraping
async function runScraperAndEnrich(scraper) {
  await executeScraper(scraper);
  await populateCompanies();
}

// Helper function to extract city from address
function extractCityFromAddress(address) {
  if (!address) return null;
  const cityMatch = address.match(/\s*-\s*([^-]+)$/);
  return cityMatch ? cityMatch[1].trim() : null;
}

module.exports = {
  executeScraper,
  populateCompanies,
  runScraperAndEnrich
};