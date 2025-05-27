const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const { supabase } = require('../db/supabase');

const fieldMappings = {
  companyName: 'nom',
  website: 'site_web',
  country: 'pays',
  sector: 'secteur',
  description: 'contenu',
  email: 'email',
  phone: 'telephone',
  address: 'adresse',
  link: 'lien'
};

// French labels for the export headers
const frenchLabels = {
  nom: "Nom de l'entreprise",
  site_web: "Site web",
  pays: "Pays",
  secteur: "Secteur d'activité",
  contenu: "Description",
  email: "Email",
  telephone: "Téléphone",
  adresse: "Adresse",
  lien: "Lien source"
};

const getSelectedFields = (fields) => {
  // Always include id for internal reference but don't export it
  const selectedFields = Object.entries(fields)
    .filter(([_, selected]) => selected)
    .map(([field]) => fieldMappings[field])
    .filter(Boolean);
    
  return selectedFields.join(', ');
};

const fetchData = async (fields, limit = null, jobId = null, scraperId = null) => {
  const selectedFields = getSelectedFields(fields);
  
  if (!selectedFields) {
    throw new Error('No valid fields selected');
  }

  // Add created_at for sorting but don't export it
  let query = supabase
    .from('scraped_data')
    .select(selectedFields)
    .order('created_at', { ascending: false })
    .not('nom', 'is', null); // Exclude entries without company names

  if (jobId) {
    query = query.eq('job_id', jobId);
  }
  if (scraperId) {
    query = query.eq('scraper_id', scraperId);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Format data with French headers
  return data.map(row => {
    const formattedRow = {};
    for (const [dbField, value] of Object.entries(row)) {
      if (frenchLabels[dbField]) {
        formattedRow[frenchLabels[dbField]] = value || '';
      }
    }
    return formattedRow;
  });
};

const generateCsv = async (data) => {
  const parser = new Parser({
    fields: Object.keys(data[0]),
    delimiter: ';', // Use semicolon for better Excel compatibility
    quote: '"',     // Always quote fields
    escapedQuote: '""', // Use double quotes for escaping
    header: true
  });
  return parser.parse(data);
};

const generateExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Données');

  // Add headers and configure columns
  if (data.length > 0) {
    // Configure column widths based on content type
    const columnWidths = {
      "Nom de l'entreprise": 40,
      "Site web": 35,
      "Pays": 20,
      "Secteur d'activité": 30,
      "Description": 60,
      "Email": 35,
      "Téléphone": 20,
      "Adresse": 40,
      "Lien source": 35
    };

    worksheet.columns = Object.keys(data[0]).map(header => ({
      header,
      key: header,
      width: columnWidths[header] || 30,
      style: { 
        font: { bold: true },
        alignment: { vertical: 'middle', horizontal: 'left' },
        fill: {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6E6E6' }
        }
      }
    }));
  }

  // Add rows with styling
  data.forEach((row, index) => {
    const wsRow = worksheet.addRow(row);
    wsRow.height = 25;
    
    // Apply cell styles
    wsRow.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Alternate row colors for better readability
    if (index % 2 === 1) {
      wsRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFAFAFA' }
        };
      });
    }
  });

  return workbook;
};

// Preview function for the export data
const getPreview = async (req, res) => {
  try {
    const { fields, format } = req.body;
    
    // Fetch a sample of the data (first 5 rows)
    const data = await fetchData(fields, 5);
    if (!data || data.length === 0) {
      return res.json([[]]);
    }
    
    // Get the French headers
    const headers = Object.keys(data[0]);
    
    // Transform the data into an array of arrays format
    // First row is headers, followed by the data rows
    const rows = data.map(row => Object.values(row));
    
    // Combine headers and rows
    const result = [headers, ...rows];
    
    res.json(result);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: error.message });
  }
};

const downloadExport = async (req, res) => {
  try {
    const { format, fields, fileName, jobId, scraperId } = req.body;
    const data = await fetchData(fields, null, jobId, scraperId);

    if (format === 'csv') {
      const csv = await generateCsv(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      res.send(csv);
    } else if (format === 'xlsx') {
      const workbook = await generateExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
      await workbook.xlsx.write(res);
    } else {
      throw new Error('Unsupported format');
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
};

module.exports = {
  getPreview,
  downloadExport
};
