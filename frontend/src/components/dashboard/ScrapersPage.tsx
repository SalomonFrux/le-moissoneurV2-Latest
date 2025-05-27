import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Code, Save, RefreshCw, Search, Filter, MoreVertical, Globe, Mail, LinkIcon } from 'lucide-react';
import { ScraperCard } from './ScraperCard';
import { toast } from 'sonner';
import { getAllScrapers, runScraper, getScraperStatus, createScraper, deleteScraper, updateScraper } from '@/services/scraperService';
import { dataService, type Scraper, type ScrapedEntry, type PaginatedResponse, type FetchDataParams, type SelectorObject, type SelectorType } from '@/services/dataService';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { scraperStatusService } from '@/services/scraperStatusService';
import { ScraperStatus } from '@/components/scraper/types';
import { ScraperProgress } from '@/components/scraper/ScraperProgress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo, Democratic Republic of the", "Congo, Republic of the", "Costa Rica", "Cote d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

interface ScraperConfig {
  name: string;
  source: string;
  mainSelectors: SelectorObject[];
  paginationSelectors: SelectorObject[];
  dropdownClickSelectors: SelectorObject[];
  childSelectors: Record<string, SelectorObject[]>;
  engine: 'playwright' | 'puppeteer';
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  country?: string;
  twoPhaseScraping: string;
  phase1Selectors: {
    name: string;
    dropdownTrigger?: string;
  };
  phase2Selectors: {
    name: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
}

interface ScraperCardProps {
  scraper: Scraper;
  onRunScraper: (id: string) => Promise<void>;
  onStopScraper: (id: string) => void;
  onViewData: (id: string) => Promise<void>;
  onEditScraper?: (scraper: Scraper) => void;
  onDeleteScraper?: (id: string) => void;
  showEditOptions?: boolean;
  showViewData?: boolean;
}

interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: unknown;
    headers?: unknown;
  };
}

export function ScrapersPage() {
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const formRef = React.useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<ScraperConfig>({
    name: '',
    source: '',
    mainSelectors: [{ type: 'css', value: '' }],
    paginationSelectors: [],
    dropdownClickSelectors: [],
    childSelectors: {
      name: [{ type: 'css', value: '' }],
      phone: [],
      email: [],
      website: [],
      address: [],
      sector: [],
    },
    engine: 'playwright',
    frequency: 'manual',
    country: '',
    twoPhaseScraping: 'false',
    phase1Selectors: {
      name: '',
      dropdownTrigger: ''
    },
    phase2Selectors: {
      name: '',
      phone: '',
      email: '',
      website: '',
      address: ''
    }
  });
  const [expandedScrapers, setExpandedScrapers] = useState<Set<string>>(new Set());
  const [scrapedData, setScrapedData] = useState<Record<string, ScrapedEntry[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [editingScraperId, setEditingScraperId] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedFrequency, setSelectedFrequency] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedScraperId, setSelectedScraperId] = useState<string | null>(null);
  const [scrapedDataResponse, setScrapedDataResponse] = useState<{ total: number; page: number; limit: number } | null>(null);
  const [scraperStatus, setScraperStatus] = useState<{ [key: string]: ScraperStatus }>({});
  const [activeScraperStatus, setActiveScraperStatus] = useState<{ status: ScraperStatus; name: string } | null>(null);
  // Selector testing modal state
  const [testModal, setTestModal] = useState<{
    open: boolean;
    selectorType: string;
    selectorValue: string;
    field: string;
    idx: number;
  }>({ open: false, selectorType: '', selectorValue: '', field: '', idx: -1 });
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const activeScrapers = Object.entries(scraperStatus).find(([_, status]) => status.status === 'running');
    
    if (activeScrapers) {
      const [scraperId, status] = activeScrapers;
      const scraper = scrapers.find(s => s.id === scraperId);
      
      if (scraper) {
        setActiveScraperStatus({ status, name: scraper.name });
      }
    } else {
      setActiveScraperStatus(null);
    }
  }, [scraperStatus, scrapers]);

  useEffect(() => {
    fetchScrapers();
  }, []);

  const fetchScrapers = async () => {
    try {
      setLoading(true);
      const data = await dataService.getAllScrapers();
      setScrapers(data);
    } catch (err) {
      console.error('Error fetching scrapers:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as AxiosErrorResponse;
        console.error('Axios error details:', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          headers: axiosError.response?.headers
        });
      }
      toast.error('Erreur lors du chargement des scrapers');
    } finally {
      setLoading(false);
    }
  };

  // Helper to add a selector to a field
  const addSelector = (field: keyof ScraperConfig, type: SelectorType = 'css') => {
    setFormData(prev => {
      if (field === 'mainSelectors' || field === 'paginationSelectors' || field === 'dropdownClickSelectors') {
        return {
          ...prev,
          [field]: [...(prev[field] as SelectorObject[]), { type, value: '' }]
        };
      }
      return prev;
    });
  };

  // Helper to remove a selector from a field
  const removeSelector = (field: keyof ScraperConfig, idx: number) => {
    setFormData(prev => {
      if (field === 'mainSelectors' || field === 'paginationSelectors' || field === 'dropdownClickSelectors') {
        return {
          ...prev,
          [field]: (prev[field] as SelectorObject[]).filter((_, i) => i !== idx)
        };
      }
      return prev;
    });
  };

  // Helper to update a selector value/type
  const updateSelector = (field: keyof ScraperConfig, idx: number, key: keyof SelectorObject, value: string) => {
    setFormData(prev => {
      if (field === 'mainSelectors' || field === 'paginationSelectors' || field === 'dropdownClickSelectors') {
        const updated = [...(prev[field] as SelectorObject[])];
        updated[idx] = { ...updated[idx], [key]: value };
        return {
          ...prev,
          [field]: updated
        };
      }
      return prev;
    });
  };

  // Child selectors helpers
  const addChildSelector = (childField: string, type: SelectorType = 'css') => {
    setFormData(prev => ({
      ...prev,
      childSelectors: {
        ...prev.childSelectors,
        [childField]: [...(prev.childSelectors[childField] || []), { type, value: '' }]
      }
    }));
  };
  const removeChildSelector = (childField: string, idx: number) => {
    setFormData(prev => ({
      ...prev,
      childSelectors: {
        ...prev.childSelectors,
        [childField]: (prev.childSelectors[childField] || []).filter((_, i) => i !== idx)
      }
    }));
  };
  const updateChildSelector = (childField: string, idx: number, key: keyof SelectorObject, value: string) => {
    setFormData(prev => ({
      ...prev,
      childSelectors: {
        ...prev.childSelectors,
        [childField]: (prev.childSelectors[childField] || []).map((sel, i) => i === idx ? { ...sel, [key]: value } : sel)
      }
    }));
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    if (field.startsWith('phase1.')) {
      const subField = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        phase1Selectors: {
          ...prev.phase1Selectors,
          [subField]: value
        }
      }));
    } else if (field.startsWith('phase2.')) {
      const subField = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        phase2Selectors: {
          ...prev.phase2Selectors,
          [subField]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.source) {
      toast.error('Le nom et l\'URL de la source sont requis');
      return;
    }

    try {
      setLoading(true);
      
      // If editing, first fetch the current scraper data
      let existingSelectors = {};
      if (editingScraperId) {
        const currentScraper = scrapers.find(s => s.id === editingScraperId);
        existingSelectors = currentScraper?.selectors || {};
      }

      // Prepare the selectors object for submission
      const newSelectors: Scraper['selectors'] = {
        main: formData.mainSelectors,
        pagination: formData.paginationSelectors,
        dropdownClick: formData.dropdownClickSelectors,
        child: formData.childSelectors,
      };

      const scraperData = {
        name: formData.name,
        source: formData.source,
        selectors: newSelectors,
        frequency: formData.frequency,
        status: 'idle' as const,
        type: formData.engine,
        country: formData.country || 'Unknown',
        dataCount: 0
      };

      if (editingScraperId) {
        await updateScraper(editingScraperId, scraperData);
        toast.success('Scraper mis à jour avec succès');
      } else {
        await createScraper(scraperData);
        toast.success('Scraper créé avec succès');
      }

      await fetchScrapers();
      setFormData({
        name: '',
        source: '',
        mainSelectors: [{ type: 'css', value: '' }],
        paginationSelectors: [],
        dropdownClickSelectors: [],
        childSelectors: {
          name: [{ type: 'css', value: '' }],
          phone: [],
          email: [],
          website: [],
          address: [],
          sector: [],
        },
        engine: 'playwright',
        frequency: 'manual',
        country: '',
        twoPhaseScraping: 'false',
        phase1Selectors: {
          name: '',
          dropdownTrigger: ''
        },
        phase2Selectors: {
          name: '',
          phone: '',
          email: '',
          website: '',
          address: ''
        }
      });
      setEditingScraperId(null);
      setShowForm(false);
    } catch (error) {
     // console.error('Error submitting scraper:', error);
      toast.error(editingScraperId ? 'Erreur lors de la mise à jour du scraper' : 'Erreur lors de la création du scraper');
    } finally {
      setLoading(false);
    }
  };

  const handleEditScraper = (scraper: Scraper) => {
    setEditingScraperId(scraper.id);
    setFormData({
      name: scraper.name,
      source: scraper.source,
      mainSelectors: Array.isArray(scraper.selectors?.main)
        ? scraper.selectors.main.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: s.type ?? 'css', value: String(s.value ?? '') })
        : typeof scraper.selectors?.main === 'string' && scraper.selectors.main
          ? [{ type: 'css', value: scraper.selectors.main }]
          : [{ type: 'css', value: '' }],
      paginationSelectors: Array.isArray(scraper.selectors?.pagination)
        ? scraper.selectors.pagination.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: s.type ?? 'css', value: String(s.value ?? '') })
        : typeof scraper.selectors?.pagination === 'string' && scraper.selectors.pagination
          ? [{ type: 'css', value: scraper.selectors.pagination }]
          : [],
      dropdownClickSelectors: Array.isArray(scraper.selectors?.dropdownClick)
        ? scraper.selectors.dropdownClick.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: s.type ?? 'css', value: String(s.value ?? '') })
        : typeof scraper.selectors?.dropdownClick === 'string' && scraper.selectors.dropdownClick
          ? [{ type: 'css', value: scraper.selectors.dropdownClick }]
          : [],
      childSelectors: scraper.selectors?.child ? JSON.parse(JSON.stringify(scraper.selectors.child)) : { name: [{ type: 'css', value: '' }], phone: [], email: [], website: [], address: [], sector: [] },
      engine: scraper.type,
      frequency: scraper.frequency,
      country: scraper.country || '',
      twoPhaseScraping: 'false',
      phase1Selectors: { name: '', dropdownTrigger: '' },
      phase2Selectors: { name: '', phone: '', email: '', website: '', address: '' }
    });
    setShowForm(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleNewScraper = () => {
    setEditingScraperId(null);
    setFormData({
      name: '',
      source: '',
      mainSelectors: [{ type: 'css', value: '' }],
      paginationSelectors: [],
      dropdownClickSelectors: [],
      childSelectors: {
        name: [{ type: 'css', value: '' }],
        phone: [],
        email: [],
        website: [],
        address: [],
        sector: [],
      },
      engine: 'playwright',
      frequency: 'manual',
      country: '',
      twoPhaseScraping: 'false',
      phase1Selectors: { name: '', dropdownTrigger: '' },
      phase2Selectors: { name: '', phone: '', email: '', website: '', address: '' }
    });
    setShowForm(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({
      name: '',
      source: '',
      mainSelectors: [{ type: 'css', value: '' }],
      paginationSelectors: [],
      dropdownClickSelectors: [],
      childSelectors: {
        name: [{ type: 'css', value: '' }],
        phone: [],
        email: [],
        website: [],
        address: [],
        sector: [],
      },
      engine: 'playwright',
      frequency: 'manual',
      country: '',
      twoPhaseScraping: 'false',
      phase1Selectors: { name: '', dropdownTrigger: '' },
      phase2Selectors: { name: '', phone: '', email: '', website: '', address: '' }
    });
  };

  const handleDeleteScraper = async (id: string) => {
    try {
      setLoading(true);
      await deleteScraper(id);
      setScrapers(prev => prev.filter(scraper => scraper.id !== id));
      toast.success('Scraper supprimé avec succès');
    } catch (error) {
      toast.error('Erreur lors de la suppression du scraper');
    } finally {
      setLoading(false);
    }
  };

  const handleRunScraper = async (scraperId: string) => {
    try {
      // Set initial status immediately to show that something is happening
      setScraperStatus(prev => ({
        ...prev,
        [scraperId]: {
          status: 'initializing',
          currentPage: 0,
          totalItems: 0,
          messages: [{
            id: 'initial',
            type: 'info',
            text: 'Démarrage du scraper...',
            timestamp: new Date()
          }]
        }
      }));
      
      const onStatusUpdateCallback = (status: ScraperStatus) => {
        console.log(`[[ScrapersPage.tsx]] INSIDE onStatusUpdateCallback for scraperId ${scraperId}`, 
                    { newStatus: status });

        setScraperStatus(prev => {
          console.log(`[[ScrapersPage.tsx]] INSIDE setScraperStatus for scraperId ${scraperId}`, 
                      { newStatus: status, previousScraperStatuses: prev });

          const newStatusMap = {
            ...prev,
            [scraperId]: status
          };
          
          // Update the scraper's status in the scrapers list when completed or error
          if (status.status === 'completed' || status.status === 'error') {
            setScrapers(currentScrapers => 
              currentScrapers.map(scraper => 
                scraper.id === scraperId 
                  ? { ...scraper, status: 'idle' as const } // Ensure 'idle' is const
                  : scraper
              )
            );
            
            // NOTE: We no longer auto-remove the status after completion
          }
          
          return newStatusMap;
        });
      };
      
      // Connect to status service
      scraperStatusService.connect(scraperId, onStatusUpdateCallback);
      
      // Add a slight delay to allow Socket.IO connection and room joining to establish
      // before telling the backend to run the scraper.
      // This is a pragmatic approach given connect() doesn't return a promise for room join.
      await new Promise(resolve => setTimeout(resolve, 750)); // Adjusted delay slightly

      console.log(`ScrapersPage.tsx: Attempting to run scraper ${scraperId} after delay.`);
      try {
        await dataService.runScraper(scraperId);
        // Update the scraper's status to running in the main list
        setScrapers(prevScrapers => prevScrapers.map(s => 
          s.id === scraperId ? { ...s, status: 'running' as const } : s
        ));
        toast.success('Scraper started successfully');
      } catch (error) {
        console.error(`Error running scraper ${scraperId} after attempting to connect and delay:`, error);
        toast.error('Failed to start scraper after attempting connection.');
        // Set error status via the callback
        onStatusUpdateCallback({
          status: 'error',
          currentPage: 0,
          totalItems: 0,
          messages: [{ id: 'run-error', type: 'error', text: 'Failed to start scraper execution.', timestamp: new Date() }],
          error: (error instanceof Error ? error.message : 'Unknown error')
        });
      }
      
    } catch (error) {
      console.error('Error running scraper:', error);
      // Set error status
      setScraperStatus(prev => ({
        ...prev,
        [scraperId]: {
          status: 'error',
          currentPage: 0,
          totalItems: 0,
          messages: [{
            id: 'error',
            type: 'error',
            text: error instanceof Error ? error.message : 'Impossible de démarrer le scraper',
            timestamp: new Date()
          }]
        }
      }));
      
      toast.error('Failed to start scraper');
    }
  };

  // Add a function to dismiss a scraper status
  const handleDismissScraperStatus = (scraperId: string) => {
    setScraperStatus(prev => {
      const updated = { ...prev };
      delete updated[scraperId]; // Remove this scraper's status
      
      // Also disconnect the socket for this scraper
      scraperStatusService.disconnect(scraperId);
      
      return updated;
    });
  };

  const handleStopScraper = (id: string) => {
    setScrapers((prev) =>
      prev.map((scraper) =>
        scraper.id === id ? { ...scraper, status: 'idle' as const } : scraper
      )
    );
    
    toast.info(`Scraper ${scrapers.find(s => s.id === id)?.name} arrêté`, {
      description: "L'opération a été interrompue."
    });
  };
  
  const handleViewData = async (scraperId: string) => {
    try {
      setLoading(true);
      const response = await dataService.fetchScrapedData({
        page: currentPage,
        limit: itemsPerPage,
        scraper_id: scraperId
      });
      
      setSelectedScraperId(scraperId);
      setScrapedDataResponse(response);
      
      if (response.data) {
        setScrapedData({ [scraperId]: response.data });
        
        setTimeout(() => {
          const tableElement = document.querySelector('[data-scraper-table]');
          if (tableElement) {
            tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);

        if (response.data.length === 0) {
          toast.info("Aucune donnée disponible pour ce scraper");
        } else {
          toast.info("Affichage des données", {
            description: `${response.total} entrées trouvées`
          });
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as AxiosErrorResponse;
        console.error('Axios error details:', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          headers: axiosError.response?.headers
        });
      }
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Filter and paginate scrapers
  const filteredScrapers = scrapers.filter(scraper => {
    const matchesSearch = scraper.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         scraper.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = selectedCountry === 'all' || scraper.country === selectedCountry;
    const matchesStatus = selectedStatus === 'all' || scraper.status === selectedStatus;
    const matchesFrequency = selectedFrequency === 'all' || scraper.frequency === selectedFrequency;
    
    return matchesSearch && matchesCountry && matchesStatus && matchesFrequency;
  });

  // Sort scrapers
  const sortedScrapers = [...filteredScrapers].sort((a, b) => {
    if (sortBy === 'date') {
      const dateA = a.last_run ? new Date(a.last_run).getTime() : 0;
      const dateB = b.last_run ? new Date(b.last_run).getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    }
    
    const aValue = sortBy === 'name' ? a.name : a.status;
    const bValue = sortBy === 'name' ? b.name : b.status;
    return sortOrder === 'asc' ? 
      aValue.localeCompare(bValue) : 
      bValue.localeCompare(aValue);
  });

  // Calculate pagination
  const totalItems = sortedScrapers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedScrapers = sortedScrapers.slice(startIndex, endIndex);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Jamais';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Jamais';
      
      const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
      const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${months[date.getMonth()]}/${date.getFullYear()}`;
      
      // Format time
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const formattedTime = `${hours}:${minutes}`;
      
      return `${formattedDate} ${formattedTime}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Jamais';
    }
  };

  // Cleanup SSE connections when component unmounts
  useEffect(() => {
    return () => {
      scraperStatusService.disconnect();
    };
  }, []);

  const openTestModal = (field: string, idx: number, selectorType: string, selectorValue: string) => {
    setTestModal({ open: true, selectorType, selectorValue, field, idx });
    setTestInput('');
    setTestResult(null);
  };
  const closeTestModal = () => {
    setTestModal({ open: false, selectorType: '', selectorValue: '', field: '', idx: -1 });
    setTestInput('');
    setTestResult(null);
  };
  const handleTestSelector = () => {
    // Placeholder: In a real implementation, call backend or run JS to test selector
    setTestResult('Test non implémenté pour le moment.');
  };

  return (
    <div className="space-y-8 p-6 relative">
      {/* Keep the top progress display with improvements - reduced height, no blue border, subtle design */}
      {Object.keys(scraperStatus).length > 0 && (
        <div className="sticky top-0 z-50 bg-white p-2 rounded-lg shadow-md mb-4">
          <h2 className="text-base font-medium mb-2 flex items-center">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Scrapers en cours
          </h2>
          <div className="space-y-2">
            {Object.entries(scraperStatus).map(([scraperId, status]) => {
              const scraper = scrapers.find(s => s.id === scraperId);
              return (
                <div key={scraperId} className="last:mb-0">
                  <ScraperProgress
                    status={status}
                    scraperName={scraper?.name || 'Scraper'}
                    onRetry={() => handleRunScraper(scraperId)}
                    onDismiss={() => handleDismissScraperStatus(scraperId)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-bold font-heading tracking-tight">Scrapers</h2>
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchScrapers}
            className={cn(
              "ml-2 transition-transform duration-200",
              isRefreshing && "animate-spin"
            )}
            disabled={isRefreshing}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={handleNewScraper}>
          <Plus className="mr-2 h-4 w-4" /> Nouveau Scraper
        </Button>
      </div>
      
      <Card className="p-4">
        <div className="space-y-4">
          {/* Filters section */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un scraper..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-[180px]">
                <Globe className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrer par pays" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pays</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="idle">Inactif</SelectItem>
                <SelectItem value="running">En cours</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
                <SelectItem value="error">Erreur</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par fréquence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les fréquences</SelectItem>
                <SelectItem value="manual">Manuel</SelectItem>
                <SelectItem value="daily">Quotidien</SelectItem>
                <SelectItem value="weekly">Hebdomadaire</SelectItem>
                <SelectItem value="monthly">Mensuel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scrapers grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedScrapers.map((scraper) => (
              <ScraperCard
                key={scraper.id}
                scraper={scraper}
                onRunScraper={handleRunScraper}
                onStopScraper={handleStopScraper}
                onViewData={handleViewData}
                onEditScraper={(scraper) => {
                  handleEditScraper(scraper);
                  setShowForm(true);
                }}
                onDeleteScraper={handleDeleteScraper}
                showEditOptions={true}
                showViewData={true}
              />
            ))}
          </div>

          {/* Display scraped data with animation */}
          {selectedScraperId && Object.entries(scrapedData).map(([scraperId, entries]) => {
            const scraper = scrapers.find(s => s.id === scraperId);
            if (!scraper) return null;

            return (
              <Card 
                key={scraperId} 
                className="mt-4 animate-fadeIn"
                data-scraper-table
              >
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Données de {scraper.name}</CardTitle>
                    <CardDescription>{entries.length} entrées affichées sur {scrapedDataResponse?.total || 0} au total</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                        handleViewData(scraperId);
                      }}
                    >
                      <SelectTrigger className="w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 10, 20, 50, 100].map((size) => (
                          <SelectItem key={size} value={size.toString()}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedScraperId(null);
                        setScrapedData({});
                        setScrapedDataResponse(null);
                      }}
                    >
                      Fermer
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                  <Table className="rounded-lg overflow-hidden border border-[#15616D]/20 shadow-sm">
  <TableHeader>
    <TableRow className="bg-gradient-to-r from-[#15616D] to-[#001524]">
      <TableHead className="text-white font-semibold py-3 px-4">Nom</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Email</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Téléphone</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Adresse</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Site Web</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Secteur</TableHead>
      <TableHead className="text-white font-semibold py-3 px-4">Date de Collecte</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {entries.map((entry, index) => (
      <TableRow 
        key={entry.id}
        className={`
          ${index % 2 === 0 ? 'bg-white' : 'bg-[#15616D]/5'}
          hover:bg-[#15616D]/10 transition-colors
        `}
      >
        <TableCell className="font-medium capitalize py-3 px-4 text-[#001524]">
          {entry.nom ? 
            entry.nom.charAt(0).toUpperCase() + entry.nom.slice(1).toLowerCase() : 
            <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>
          }
        </TableCell>
        <TableCell className="py-3 px-4">
          {entry.email ? (
            <a 
              href={`mailto:${entry.email}` } 
              className="text-[#] hover:text-[#] hover:underline flex items-center  transition-colors"
            >
              
              <Mail className="h-4 w-4" />
              {entry.email.toLowerCase() } 
            </a>
          ) :<span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>
          }
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.telephone || <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>}
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.adresse ? 
            entry.adresse.charAt(0).toUpperCase() + entry.adresse.slice(1).toLowerCase() : 
            <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>
          }
        </TableCell>
        <TableCell className="py-3 px-4">
          {entry.site_web ? (
            <a 
              href={entry.site_web} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[#15616D] hover:text-[#001524] hover:underline flex items-center gap-1 transition-colors"
            >
              <LinkIcon className="h-4 w-4" />
              {entry.site_web.toLowerCase()}
            </a>
          ) : <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>}
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.secteur ? 
            entry.secteur.charAt(0).toUpperCase() + entry.secteur.slice(1).toLowerCase() : 
            <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">-</span>
          }
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]/80">
          {formatDate(entry.created_at)}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>

                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Page {currentPage} sur {Math.ceil((scrapedDataResponse?.total || 0) / itemsPerPage)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                    className="flex items-center bg-text-dark  text-dark hover:bg-[#001524] transition-colors duration-300 rounded-md px-4 py-2 shadow-md"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = Math.max(1, currentPage - 1);
                        setCurrentPage(newPage);
                        handleViewData(scraperId);
                      }}
                      disabled={currentPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                    className="flex items-center text-dark hover:bg-[#001524] transition-colors duration-300 rounded-md px-4 py-2 shadow-md"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = currentPage + 1;
                        setCurrentPage(newPage);
                        handleViewData(scraperId);
                      }}
                      disabled={currentPage >= Math.ceil((scrapedDataResponse?.total || 0) / itemsPerPage)}
                    >
                      Suivant
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}

          {/* Pagination */}
          {totalItems > 0 && (
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  Affichage de {startIndex + 1} à {endIndex} sur {totalItems} scrapers
                </p>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      
      {showForm && (
        <Card ref={formRef}>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Créer un nouveau scraper</CardTitle>
              <CardDescription>
                Configurez un nouveau scraper pour collecter des données d'une source en ligne.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Nom du scraper</label>
                  <Input 
                    id="name" 
                    placeholder="Ex: FADEV Scraper" 
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="source" className="text-sm font-medium">URL de la source</label>
                  <Input 
                    id="source" 
                    placeholder="Ex: https://fadev.org" 
                    value={formData.source}
                    onChange={(e) => handleInputChange('source', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="twoPhaseScraping"
                    checked={formData.twoPhaseScraping === 'true'}
                    onChange={(e) => handleInputChange('twoPhaseScraping', e.target.checked ? 'true' : 'false')}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="twoPhaseScraping" className="text-sm font-medium">
                    Scraping en deux phases (pour les données dans des dropdowns)
                  </label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Activez cette option si les données sont cachées derrière des dropdowns
                </p>
              </div> */}

              {/* Phase 1 Selectors */}
              {formData.twoPhaseScraping === 'true' && (
                 <div className="space-y-4">
                  <h3 className="text-lg font-medium">Phase 1 - Liste des entreprises</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="phase1.name">Sélecteur du nom</label>
                      <Input
                        id="phase1.name"
                        value={formData.phase1Selectors.name}
                        onChange={(e) => handleInputChange('phase1.name', e.target.value)}
                        placeholder="Exemple: .company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phase1.dropdownTrigger">Sélecteur du déclencheur</label>
                      <Input
                        id="phase1.dropdownTrigger"
                        value={formData.phase1Selectors.dropdownTrigger}
                        onChange={(e) => handleInputChange('phase1.dropdownTrigger', e.target.value)}
                        placeholder="Exemple: .dropdown-trigger"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Phase 2 Selectors */}
              {formData.twoPhaseScraping === 'true' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Phase 2 - Détails de l'entreprise</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="phase2.name">Sélecteur du nom</label>
                      <Input
                        id="phase2.name"
                        value={formData.phase2Selectors.name}
                        onChange={(e) => handleInputChange('phase2.name', e.target.value)}
                        placeholder="Exemple: .company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phase2.phone">Sélecteur du téléphone</label>
                      <Input
                        id="phase2.phone"
                        value={formData.phase2Selectors.phone}
                        onChange={(e) => handleInputChange('phase2.phone', e.target.value)}
                        placeholder="Exemple: .phone-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phase2.email">Sélecteur de l'email</label>
                      <Input
                        id="phase2.email"
                        value={formData.phase2Selectors.email}
                        onChange={(e) => handleInputChange('phase2.email', e.target.value)}
                        placeholder="Exemple: .email-address"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phase2.website">Sélecteur du site web</label>
                      <Input
                        id="phase2.website"
                        value={formData.phase2Selectors.website}
                        onChange={(e) => handleInputChange('phase2.website', e.target.value)}
                        placeholder="Exemple: .website-url"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phase2.address">Sélecteur de l'adresse</label>
                      <Input
                        id="phase2.address"
                        value={formData.phase2Selectors.address}
                        onChange={(e) => handleInputChange('phase2.address', e.target.value)}
                        placeholder="Exemple: .address-text"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Main Selectors (dynamic array UI) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sélecteurs principaux</label>
                {formData.mainSelectors.map((selector, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-1">
                    <Select
                      value={selector.type}
                      onValueChange={value => updateSelector('mainSelectors', idx, 'type', value)}
                    >
                      <SelectTrigger className="w-[90px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="css">CSS</SelectItem>
                        <SelectItem value="xpath">XPath</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      placeholder="Valeur du sélecteur"
                      value={selector.value}
                      onChange={e => updateSelector('mainSelectors', idx, 'value', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSelector('mainSelectors', idx)}
                      disabled={formData.mainSelectors.length === 1}
                    >
                      -
                    </Button>
                    {idx === formData.mainSelectors.length - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => addSelector('mainSelectors')}
                      >
                        +
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openTestModal('mainSelectors', idx, selector.type, selector.value)}
                    >
                      Tester
                    </Button>
                  </div>
                ))}
              </div>

              {/* Pagination Selectors (dynamic array UI) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sélecteurs de pagination (optionnel)</label>
                {formData.paginationSelectors.length === 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => addSelector('paginationSelectors')}>+ Ajouter un sélecteur</Button>
                )}
                {formData.paginationSelectors.map((selector, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-1">
                    <Select
                      value={selector.type}
                      onValueChange={value => updateSelector('paginationSelectors', idx, 'type', value)}
                    >
                      <SelectTrigger className="w-[90px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="css">CSS</SelectItem>
                        <SelectItem value="xpath">XPath</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      placeholder="Valeur du sélecteur"
                      value={selector.value}
                      onChange={e => updateSelector('paginationSelectors', idx, 'value', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSelector('paginationSelectors', idx)}
                    >
                      -
                    </Button>
                    {idx === formData.paginationSelectors.length - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => addSelector('paginationSelectors')}
                      >
                        +
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openTestModal('paginationSelectors', idx, selector.type, selector.value)}
                    >
                      Tester
                    </Button>
                  </div>
                ))}
              </div>

              {/* Dropdown Click Selectors (dynamic array UI) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sélecteurs pour ouvrir les dropdowns (optionnel)</label>
                {formData.dropdownClickSelectors.length === 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => addSelector('dropdownClickSelectors')}>+ Ajouter un sélecteur</Button>
                )}
                {formData.dropdownClickSelectors.map((selector, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-1">
                    <Select
                      value={selector.type}
                      onValueChange={value => updateSelector('dropdownClickSelectors', idx, 'type', value)}
                    >
                      <SelectTrigger className="w-[90px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="css">CSS</SelectItem>
                        <SelectItem value="xpath">XPath</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      placeholder="Valeur du sélecteur"
                      value={selector.value}
                      onChange={e => updateSelector('dropdownClickSelectors', idx, 'value', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSelector('dropdownClickSelectors', idx)}
                    >
                      -
                    </Button>
                    {idx === formData.dropdownClickSelectors.length - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => addSelector('dropdownClickSelectors')}
                      >
                        +
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openTestModal('dropdownClickSelectors', idx, selector.type, selector.value)}
                    >
                      Tester
                    </Button>
                  </div>
                ))}
              </div>

              {/* Child Selectors (dynamic array UI) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sélecteurs enfants</label>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(formData.childSelectors).map(([childField, selectors]) => (
                    <div key={childField} className="space-y-1">
                      <div className="font-semibold text-xs mb-1 capitalize">{childField}</div>
                      {selectors.length === 0 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => addChildSelector(childField)}>
                          + Ajouter un sélecteur
                        </Button>
                      )}
                      {selectors.map((selector, idx) => (
                        <div key={idx} className="flex gap-2 items-center mb-1">
                          <Select
                            value={selector.type}
                            onValueChange={value => updateChildSelector(childField, idx, 'type', value)}
                          >
                            <SelectTrigger className="w-[90px]">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="css">CSS</SelectItem>
                              <SelectItem value="xpath">XPath</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            className="flex-1"
                            placeholder="Valeur du sélecteur"
                            value={selector.value}
                            onChange={e => updateChildSelector(childField, idx, 'value', e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeChildSelector(childField, idx)}
                          >
                            -
                          </Button>
                          {idx === selectors.length - 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => addChildSelector(childField)}
                            >
                              +
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openTestModal(`childSelectors.${childField}`, idx, selector.type, selector.value)}
                          >
                            Tester
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="engine" className="text-sm font-medium">Moteur de scraping</label>
                <Select
                  value={formData.engine}
                  onValueChange={(value: 'playwright' | 'puppeteer') => handleInputChange('engine', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un moteur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="playwright">Playwright (recommandé)</SelectItem>
                    {/* <SelectItem value="puppeteer">Puppeteer</SelectItem> */}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="frequency" className="text-sm font-medium">Fréquence</label>
                <Select 
                  value={formData.frequency} 
                  onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'manual') => handleInputChange('frequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une fréquence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Quotidien</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuel</SelectItem>
                    <SelectItem value="manual">Manuel uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="country" className="text-sm font-medium">Pays</label>
                <Select
                  value={formData.country || ''}
                  onValueChange={(value) => handleInputChange('country', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un pays" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {countries.map((country) => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
              >
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="bg-africa-green-500 hover:bg-africa-green-600"
                disabled={loading}
              >
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </CardFooter>
          </form>
          {/* Selector Test Modal */}
          <Dialog open={testModal.open} onOpenChange={open => !open && closeTestModal()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tester le sélecteur</DialogTitle>
                <DialogDescription>
                  Type: <b>{testModal.selectorType}</b> <br />
                  Valeur: <b>{testModal.selectorValue}</b>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  placeholder="URL de la page ou HTML à tester (non fonctionnel pour l'instant)"
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                />
                <Button type="button" onClick={handleTestSelector}>
                  Lancer le test
                </Button>
                {testResult && (
                  <div className="mt-2 text-sm text-muted-foreground">Résultat: {testResult}</div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeTestModal}>Fermer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      )}
    </div>
  );
}


