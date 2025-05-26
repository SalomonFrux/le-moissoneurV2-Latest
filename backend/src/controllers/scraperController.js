const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');
const { scraperQueue } = require('../config/queue');

/**
 * Run a scraper by ID
 */
async function runScraper(req, res, next) {
  try {
    const { id } = req.params;
    
    // Get scraper details from Supabase
    const { data: scraper, error } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      logger.error(`Error fetching scraper with ID ${id}: ${error.message}`);
      return res.status(404).json({ 
        error: `Scraper with ID ${id} not found`,
        details: error.message 
      });
    }
    
    // Add job to queue
    const job = await scraperQueue.add('scrape', {
      scraperId: id,
      url: scraper.source,
      selectors: scraper.selectors
    }, {
      jobId: `scraper-${id}-${Date.now()}`,
      attempts: 3
    });
    
    // Update scraper status to queued
    await supabase
      .from('scrapers')
      .update({ 
        status: 'queued',
        job_id: job.id
      })
      .eq('id', id);
    
    return res.status(202).json({
      message: `Scraper ${id} has been queued`,
      scraper: {
        id: scraper.id,
        name: scraper.name,
        status: 'queued',
        jobId: job.id
      }
    });
  } catch (err) {
    logger.error(`Error in runScraper: ${err.message}`);
    next(err);
  }
}

/**
 * Get the current status of a scraper
 */
async function getScraperStatus(req, res, next) {
  try {
    const { id } = req.params;
    
    const { data: scraper, error } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      logger.error(`Error fetching scraper status for ID ${id}: ${error.message}`);
      return res.status(404).json({ 
        error: `Scraper with ID ${id} not found`,
        details: error.message 
      });
    }

    // If there's a job_id, get the job status from the queue
    if (scraper.job_id) {
      const job = await scraperQueue.getJob(scraper.job_id);
      if (job) {
        const jobState = await job.getState();
        scraper.job_status = jobState;
        
        // Get job progress if available
        const progress = await job.progress();
        if (progress) {
          scraper.progress = progress;
        }
      }
    }
    
    return res.status(200).json(scraper);
  } catch (err) {
    logger.error(`Error in getScraperStatus: ${err.message}`);
    next(err);
  }
}

/**
 * Get all scrapers
 */
async function getAllScrapers(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('scrapers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`Error fetching scrapers: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    logger.error(`Error in getAllScrapers: ${err.message}`);
    next(err);
  }
}

/**
 * Get a scraper by ID
 */
// Update the getScraperById function
async function getScraperById(req, res, next) {
  const { id } = req.params; // Get the ID from the request parameters

  if (!id) {
    logger.error('Missing scraper ID in request');
    return res.status(400).json({ error: 'Scraper ID is required' });
  }

  logger.info(`Fetching scraper with ID: ${id}`);

  try {
    // First try to get the scraper directly
    const { data, error } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error(`Error fetching scraper with ID ${id}: ${error.message}`);
      
      // If not found, try a more flexible query to debug
      const { data: allScrapers, error: listError } = await supabase
        .from('scrapers')
        .select('id, name')
        .limit(10);
        
      if (!listError && allScrapers && allScrapers.length > 0) {
        logger.info(`Available scrapers: ${JSON.stringify(allScrapers.map(s => ({ id: s.id, name: s.name })))}`);
        
        // Check if there's a case-insensitive match
        const matchingScraper = allScrapers.find(s => 
          s.id.toLowerCase() === id.toLowerCase()
        );
        
        if (matchingScraper) {
          logger.info(`Found case-insensitive match: ${matchingScraper.id}`);
          
          // Fetch with the correct case
          const { data: correctCaseData, error: refetchError } = await supabase
            .from('scrapers')
            .select('*')
            .eq('id', matchingScraper.id)
            .single();
            
          if (!refetchError && correctCaseData) {
            return res.status(200).json(correctCaseData);
          }
        }
      }
      
      return res.status(404).json({ 
        error: `Scraper with ID ${id} not found`,
        details: error.message
      });
    }

    if (!data) {
      return res.status(404).json({ message: 'Scraper not found' });
    }

    return res.status(200).json(data); // Return the scraper data
  } catch (err) {
    logger.error(`Error in getScraperById: ${err.message}`);
    next(err);
  }
}

/**
 * Create a new scraper
 */
async function createScraper(req, res, next) {
  try {
    const { name, source, selectors, frequency, type, country } = req.body;

    if (!name || !source) {
      return res.status(400).json({ 
        error: 'Name and source URL are required' 
      });
    }

    const { data, error } = await supabase
      .from('scrapers')
      .insert([{ 
        name, 
        source,
        selectors,
        frequency: frequency || 'manual',
        status: 'idle',
        data_count: 0,
        type: type || 'playwright', // Default to Playwright
        country: country || 'Unknown' // Include the country field
      }])
      .select()
      .single();

    if (error) {
      logger.error(`Error creating scraper: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    logger.error(`Error in createScraper: ${err.message}`);
    next(err);
  }
}

/**
 * Get scraped data for a specific scraper
 */
async function getScraperData(req, res, next) {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('scraped_data')
      .select('*')
      .eq('scraper_id', id)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error(`Error fetching scraped data for scraper ${id}: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    // Return the data directly without transformation
    return res.status(200).json(data);
  } catch (err) {
    logger.error(`Error in getScraperData: ${err.message}`);
    next(err);
  }
}

// Helper function to extract information using regex
function extractInfo(text, pattern) {
  const match = text?.match(pattern);
  return match ? match[1].trim() : '';
}

async function getAllScrapedData(req, res) {
  try {
    const { data, error } = await supabase
      .from('scraped_data')
      .select(`
        *,
        scraper:scrapers(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform the data to keep both scraper name and company name
    const transformedData = data.map(item => ({
      ...item,
      scraper_name: item.scraper?.name || '-',  // Keep scraper name separately
      company_name: item.nom || '-'  // Keep the original company name
    }));

    // Group the data by scraper name
    const groupedData = transformedData.reduce((acc, item) => {
      const scraperName = item.scraper_name;
      if (!acc[scraperName]) {
        acc[scraperName] = [];
      }
      acc[scraperName].push(item);
      return acc;
    }, {});

    res.json(Object.entries(groupedData).map(([scraperName, entries]) => ({
      scraper_name: scraperName,
      entries: entries
    })));
  } catch (error) {
    console.error('Error fetching all scraped data:', error);
    res.status(500).json({ error: error.message });
  }
}

// Update scraped data
const updateScrapedData = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('scraped_data')
      .update({
        nom: updateData.nom,
        secteur: updateData.secteur,
        pays: updateData.pays,
        site_web: updateData.site_web,
        email: updateData.email,
        telephone: updateData.telephone,
        adresse: updateData.adresse,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating scraped data:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(data[0]);
  } catch (error) {
    console.error('Error updating scraped data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete scraped data
const deleteScrapedData = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('scraped_data')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error deleting scraped data:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully', data: data[0] });
  } catch (error) {
    console.error('Error deleting scraped data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const exportToPdf = async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=export-${new Date().toISOString()}.pdf`);

    doc.pipe(res);

    // Get all scraped data
    const { data: rows, error } = await supabase
      .from('scraped_data')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching data:', error);
      doc.text('Erreur lors de la récupération des données.');
      doc.end();
      return;
    }

    doc.fontSize(25).text('Données Extraites', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    const headers = ['Nom', 'Secteur', 'Pays', 'Email', 'Téléphone', 'Adresse'];
    let y = doc.y;
    headers.forEach((header, i) => {
      doc.text(header, 50 + (i * 90), y);
    });
    doc.moveDown();

    (rows || []).forEach(entry => {
      y = doc.y;
      doc.text(entry.nom || '-', 50, y);
      doc.text(entry.secteur || '-', 140, y);
      doc.text(entry.pays || '-', 230, y);
      doc.text(entry.email || '-', 320, y);
      doc.text(entry.telephone || '-', 410, y);
      doc.text(entry.adresse || '-', 500, y);
      doc.moveDown();
      if (doc.y > 700) doc.addPage();
    });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

/**
 * Update a scraper
 */
async function updateScraper(req, res, next) {
  try {
    const { id } = req.params;
    const { name, source, selectors, frequency, type, country } = req.body;

    // First check if the scraper exists
    const { data: existingScraper, error: fetchError } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingScraper) {
      logger.error(`Scraper with ID ${id} not found`);
      return res.status(404).json({ error: 'Scraper not found' });
    }

    // Update the scraper
    const { data, error } = await supabase
      .from('scrapers')
      .update({ 
        name, 
        source,
        selectors,
        frequency: frequency || existingScraper.frequency,
        type: type || existingScraper.type,
        country: country || existingScraper.country,
        // PATCH: ensure updated_at is set on update (restored from old code)
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating scraper: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    logger.error(`Error in updateScraper: ${err.message}`);
    next(err);
  }
}

/**
 * Delete a scraper
 */
async function deleteScraper(req, res, next) {
  try {
    const { id } = req.params;

    // First check if the scraper exists
    const { data: existingScraper, error: fetchError } = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingScraper) {
      logger.error(`Scraper with ID ${id} not found`);
      return res.status(404).json({ error: 'Scraper not found' });
    }

    // Delete associated scraped data first
    const { error: dataDeleteError } = await supabase
      .from('scraped_data')
      .delete()
      .eq('scraper_id', id);

    if (dataDeleteError) {
      logger.error(`Error deleting scraped data for scraper ${id}: ${dataDeleteError.message}`);
      return res.status(500).json({ error: 'Error deleting scraped data' });
    }

    // Delete the scraper
    const { error: scraperDeleteError } = await supabase
      .from('scrapers')
      .delete()
      .eq('id', id);

    if (scraperDeleteError) {
      logger.error(`Error deleting scraper ${id}: ${scraperDeleteError.message}`);
      return res.status(500).json({ error: 'Error deleting scraper' });
    }

    return res.status(200).json({ message: 'Scraper deleted successfully' });
  } catch (err) {
    logger.error(`Error in deleteScraper: ${err.message}`);
    next(err);
  }
}

// Add the debug queries function if it's not already there
async function debugScraperQueries(req, res, next) {
  try {
    const { id } = req.params;
    
    // Test connection
    const { testSupabaseConnection } = require('../db/supabase');
    const isConnected = await testSupabaseConnection();
    
    // Try different query approaches
    const directQuery = await supabase
      .from('scrapers')
      .select('*')
      .eq('id', id)
      .single();
      
    const listQuery = await supabase
      .from('scrapers')
      .select('id, name')
      .limit(10);
      
    res.json({
      connection_test: isConnected,
      supabase_config: {
        hasUrl: !!supabase.supabaseUrl,
        hasKey: !!supabase.supabaseKey,
      },
      queries: {
        direct: {
          data: directQuery.data,
          error: directQuery.error,
          status: directQuery.status
        },
        list: {
          data: listQuery.data,
          error: listQuery.error,
          count: listQuery.data?.length || 0
        }
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Update the exports to include debugScraperQueries
module.exports = {
  getAllScrapers,
  createScraper,
  runScraper,
  getScraperStatus,
  getScraperData,
  getAllScrapedData,
  updateScrapedData,
  deleteScrapedData,
  exportToPdf,
  updateScraper,
  deleteScraper,
  getScraperById,
  debugScraperQueries  // Add this line
};