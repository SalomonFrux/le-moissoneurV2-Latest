import axios from 'axios';
import { Scraper } from './dataService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface ScraperData {
  id: string;
  name: string;
  source: string;
  status: 'idle' | 'running' | 'error' | 'completed';
  lastRun?: string;
  dataCount: number;
  selectors?: { main: string };
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  country: string;
  type: 'playwright' | 'puppeteer';
}

export async function getAllScrapers(): Promise<Scraper[]> {
  const response = await axios.get<Scraper[]>(`${API_URL}/api/scrapers`);
  return response.data;
}

export async function runScraper(id: string): Promise<void> {
  await axios.post(`${API_URL}/api/scrapers/run/${id}`);
}

export async function getScraperStatus(id: string): Promise<Scraper> {
  const response = await axios.get<Scraper>(`${API_URL}/api/scrapers/status/${id}`);
  return response.data;
}

export async function createScraper(data: Partial<Scraper>): Promise<Scraper> {
  const response = await axios.post<Scraper>(`${API_URL}/api/scrapers`, data);
  return response.data;
}

export async function deleteScraper(id: string): Promise<void> {
  await axios.delete(`${API_URL}/api/scrapers/${id}`);
}

export async function updateScraper(id: string, data: Partial<Scraper>): Promise<Scraper> {
  const response = await axios.put<Scraper>(`${API_URL}/api/scrapers/${id}`, data);
  return response.data;
}

export async function getTransformations(scraperId: string) {
  const response = await axios.get(`${API_URL}/api/scrapers/${scraperId}/transformations`);
  return response.data.transformations;
}

export async function setTransformations(scraperId: string, transformations: any[]) {
  const response = await axios.post(`${API_URL}/api/scrapers/${scraperId}/transformations`, { transformations });
  return response.data;
}

export async function shareScraper(scraperId: string, userId: string) {
  const response = await axios.post(`${API_URL}/api/scrapers/${scraperId}/share`, { userId });
  return response.data;
}

export async function getSharedScrapers() {
  const response = await axios.get(`${API_URL}/api/scrapers/shared`);
  return response.data;
}

export async function listAlerts(scraperId?: string) {
  const url = scraperId ? `${API_URL}/api/scrapers/alerts?scraperId=${scraperId}` : `${API_URL}/api/scrapers/alerts`;
  const response = await axios.get(url);
  return response.data;
}

export async function listConfigs() {
  const response = await axios.get(`${API_URL}/api/scrapers/configs`);
  return response.data;
}

export async function getConfig(configId: string) {
  const response = await axios.get(`${API_URL}/api/scrapers/configs/${configId}`);
  return response.data;
}

export async function deleteConfig(configId: string) {
  const response = await axios.delete(`${API_URL}/api/scrapers/configs/${configId}`);
  return response.data;
}

export async function testSelector(url: string, selector: { type: string; value: string }) {
  const response = await axios.post(`${API_URL}/api/scrapers/test-selector`, { url, selector });
  return response.data;
}

export async function getJobHistory(scraperId: string) {
  const response = await axios.get(`${API_URL}/api/scrapers/${scraperId}/job-history`);
  return response.data;
}

export async function exportScraperDataAsCsv(scraperId: string, fields: Record<string, boolean>, fileName: string = 'export') {
  const API_EXPORT_URL = `${API_URL}/api/export/download`;
  const body = {
    format: 'csv',
    fields,
    fileName,
    scraperId
  };
  const response = await axios.post(API_EXPORT_URL, body, { responseType: 'blob' });
  // Create a blob and trigger download
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function autoLabelField(value: string, context?: string, headerText?: string) {
  const response = await axios.post(`${API_URL}/api/scrapers/auto-label`, { value, context, headerText });
  return response.data;
}