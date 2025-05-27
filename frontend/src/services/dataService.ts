import { supabase } from '@/lib/supabase';
import axios from 'axios';
import { API_URL } from '../config';
import { authService } from './authService';

// Add auth token to all requests
axios.interceptors.request.use((config) => {
  const token = authService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ScrapedEntry {
  id: string;
  scraper_id: string;
  nom: string;
  company_name?: string;
  secteur: string;
  pays: string;
  source: string;
  site_web: string;
  email: string;
  telephone: string;
  adresse: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
  scraper_name?: string;
  lien?: string;
}

export interface ScrapedDataGroup {
  scraper_name: string;
  entries: ScrapedEntry[];
}

export interface Company {
  id: string;
  name: string;
  sector: string;
  country: string;
  source: string;
  scraped_entries?: ScrapedEntry[];
  created_at: string;
  updated_at: string;
}

export type SelectorType = 'css' | 'xpath';
export interface SelectorObject {
  type: SelectorType;
  value: string;
}

export interface Scraper {
  id: string;
  name: string;
  source: string;
  country: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  status: 'idle' | 'running' | 'completed' | 'error';
  data_count: number;
  last_run?: string;
  selectors: {
    main: SelectorObject[];
    pagination?: SelectorObject[];
    dropdownClick?: SelectorObject[];
    child?: Record<string, SelectorObject[]>;
  };
  type?: 'playwright' | 'puppeteer';
}

export interface CreateScraperData {
  name: string;
  source: string;
  country: string;
  frequency: string;
  selectors: {
    main: SelectorObject[];
    pagination?: SelectorObject[];
    dropdownClick?: SelectorObject[];
    child?: Record<string, SelectorObject[]>;
  };
}

interface ExportOptions {
  data: ScrapedEntry[];
  sheets?: {
    name: string;
    type?: 'table' | 'text';
    headers?: string[];
    data: (string | number)[][];
  }[];
  sections?: {
    title: string;
    type?: 'text' | 'table';
    content?: { type: string; text: string }[];
    headers?: string[];
    data?: string[][];
  }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface FetchDataParams {
  page: number;
  limit: number;
  search?: string;
  country?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  scraper_id?: string;
}

export const dataService = {
  async getAllScrapers(): Promise<Scraper[]> {
    try {
      const response = await axios.get<Scraper[]>(`${API_URL}/api/scrapers`);
      return response.data;
    } catch (error) {
      console.error('Error fetching scrapers:', error);
      throw error;
    }
  },

  async runScraper(id: string): Promise<void> {
    try {
      await axios.post(`${API_URL}/api/scrapers/run/${id}`);
    } catch (error) {
      console.error('Error running scraper:', error);
      throw error;
    }
  },

  async fetchCompanies(): Promise<Company[]> {
    try {
      const response = await axios.get<Company[]>(`${API_URL}/api/scrapers/companies`);
      return response.data;
    } catch (error) {
      console.error('Error fetching companies:', error);
      throw error;
    }
  },

  async updateCompany(id: string, data: Partial<Company>): Promise<Company> {
    try {
      const response = await axios.put<Company>(`${API_URL}/api/companies/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating company:', error);
      throw error;
    }
  },

  async fetchScrapedData(params: FetchDataParams): Promise<PaginatedResponse<ScrapedEntry>> {
    try {
      // Ensure required parameters have default values
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 5000; // Use a larger default limit
      
      const queryParams = new URLSearchParams();
      
      // Add required parameters with defaults
      queryParams.append('page', page.toString());
      queryParams.append('limit', limit.toString());
      
      // Add optional parameters if they exist and are not empty/null
      if (params?.search?.trim()) queryParams.append('search', params.search.trim());
      if (params?.country && params.country !== 'all') queryParams.append('country', params.country);
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      if (params?.scraper_id) queryParams.append('scraper_id', params.scraper_id);

      //console.log('Fetching data with params:', {
        //url: `${API_URL}/api/scraped-data`,
        //queryParams: queryParams.toString(),
        //headers: {
        //  Authorization: `Bearer ${authService.getToken()}`
        //}
      //});

      const response = await axios.get<PaginatedResponse<ScrapedEntry>>(
        `${API_URL}/api/scraped-data?${queryParams.toString()}`
      );

   //   console.log('Response data:', response.data);

      if (!response.data) {
        throw new Error('No data received from server');
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching scraped data:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
          config: {
            url: error.config?.url,
            params: error.config?.params,
            headers: error.config?.headers
          }
        });
      }
      throw error;
    }
  },

  async fetchAllScrapedData(): Promise<ScrapedDataGroup[]> {
    try {
      const response = await axios.get<ScrapedDataGroup[]>(`${API_URL}/api/scraped-data/all`);
      return response.data;
    } catch (error) {
      console.error('Error fetching all scraped data:', error);
      throw error;
    }
  },

  async updateScrapedEntry(id: string, data: Partial<ScrapedEntry>): Promise<ScrapedEntry> {
    try {
      const response = await axios.put<ScrapedEntry>(`${API_URL}/api/scraped-data/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating scraped entry:', error);
      throw error;
    }
  },

  async deleteScrapedEntry(id: string): Promise<void> {
    try {
      await axios.delete(`${API_URL}/api/scraped-data/${id}`);
    } catch (error) {
      console.error('Error deleting scraped entry:', error);
      throw error;
    }
  },

  async exportToExcel(options: ExportOptions): Promise<void> {
    try {
      const response = await axios.post<Blob>('/api/export/excel', options, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'export.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw error;
    }
  },

  async exportToPdf(): Promise<Blob> {
    try {
      const response = await axios.get(`${API_URL}/api/scrapers/export/pdf`, {
        responseType: 'arraybuffer'
      });
      return new Blob([response.data], { type: 'application/pdf' });
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      throw new Error('Failed to export to PDF');
    }
  },

  async createScraper(data: CreateScraperData): Promise<Scraper> {
    const response = await axios.post<Scraper>('/api/scrapers', data);
    return response.data;
  },

  async updateScraper(id: string, data: Partial<Scraper>): Promise<Scraper> {
    try {
      const response = await axios.put<Scraper>(`${API_URL}/api/scrapers/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating scraper:', error);
      throw error;
    }
  },

  async fetchScraperById(id: string): Promise<any> {
    try {
      const response = await axios.get(`${API_URL}/api/scrapers/${id}`);
      return response.data; // Assuming the API returns the scraper data in the response body
    } catch (error) {
      console.error('Error fetching scraper by ID:', error);
      throw error; // Rethrow the error for handling in the calling function
    }
  },

  async deleteScraper(id: string): Promise<void> {
    try {
      await axios.delete(`${API_URL}/api/scrapers/${id}`);
    } catch (error) {
      console.error('Error deleting scraper:', error);
      throw error;
    }
  },

  async fetchDashboardStats() {
    try {
      const response = await axios.get(`${API_URL}/api/dashboard`);
      if (!response.data || !response.data.stats) {
        throw new Error('Invalid response format from dashboard API');
      }
      return {
        totalEntries: response.data.stats.totalEntries,
        uniqueScrapers: response.data.stats.uniqueScrapers,
        uniqueSectors: response.data.stats.uniqueSectors,
        completeness: response.data.stats.completeness
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  },
};