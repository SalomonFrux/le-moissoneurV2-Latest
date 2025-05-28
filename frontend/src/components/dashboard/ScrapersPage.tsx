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
import { Plus, Code, Save, RefreshCw, Search, Filter, MoreVertical, Globe, Mail, LinkIcon, AlertTriangle, Bell } from 'lucide-react';
import { ScraperCard } from './ScraperCard';
import { toast } from 'sonner';
import { getAllScrapers, runScraper, getScraperStatus, createScraper, deleteScraper, updateScraper, getTransformations, setTransformations, shareScraper, getSharedScrapers, listAlerts, listConfigs, getConfig, deleteConfig, testSelector, getJobHistory, exportScraperDataAsCsv, autoLabelField } from '@/services/scraperService';
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const continents = [
  'Africa', 'Europe', 'USA', 'Asia', 'Australia'
];
const countries = [
  ...continents,
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo, Democratic Republic of the", "Congo, Republic of the", "Costa Rica", "Cote d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

interface ScraperConfig {
  name: string;
  source: string;
  mainSelectors: SelectorObject[];
  paginationConfig: {
    type: 'nextButton' | 'numberLinks' | 'loadMore';
    selectors: SelectorObject[];
    maxPages: number;
    waitAfterClick?: number;
  };
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
  onShareScraper: (scraper: Scraper) => void;
  onViewAlerts: (scraper: Scraper) => void;
}

interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: unknown;
    headers?: unknown;
  };
}

// Add type for selector test result
interface SelectorTestResult {
  matches: number;
  samples: string[];
}

// Add type for job history entries
interface JobHistoryEntry {
  id: string;
  job_id: string;
  status: string;
  total_pages: number;
  total_items: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// Add at the top, after imports
interface ConfigSummary {
  id: string;
  name: string;
  version: number;
  updated_at?: string;
  _details?: unknown;
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
    paginationConfig: {
      type: 'nextButton',
      selectors: [{ type: 'css', value: '' }],
      maxPages: 20,
      waitAfterClick: 1000
    },
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
  const [testResult, setTestResult] = useState<SelectorTestResult | null>(null);
  const [transformations, setTransformationsState] = useState<Array<{ field: string; type: string; [key: string]: unknown }>>([]);
  const [showTransformDialog, setShowTransformDialog] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingTransform, setEditingTransform] = useState<Record<string, unknown>>({});
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareTargetScraper, setShareTargetScraper] = useState<Scraper | null>(null);
  const [shareUserId, setShareUserId] = useState('');
  const [sharedScrapers, setSharedScrapers] = useState<Scraper[]>([]);
  const [showSharedDialog, setShowSharedDialog] = useState(false);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [showAlertsDialog, setShowAlertsDialog] = useState(false);
  const [selectedAlertScraper, setSelectedAlertScraper] = useState<Scraper | null>(null);
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [showConfigsDialog, setShowConfigsDialog] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<JobHistoryEntry[]>([]);
  const [jobHistoryLoading, setJobHistoryLoading] = useState(false);

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

  const handleInputChange = (field: string, value: string | boolean | number) => {
    if (field.startsWith('paginationConfig.')) {
      const subField = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        paginationConfig: {
          ...prev.paginationConfig,
          [subField]: value
        }
      }));
      return;
    }
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
    if (!formData.country || formData.country === '') {
      toast.error('Le pays ou le continent est requis');
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
        paginationConfig: {
          type: 'nextButton',
          selectors: [{ type: 'css', value: '' }],
          maxPages: 20,
          waitAfterClick: 1000
        },
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
        ? scraper.selectors.main.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: (s.type ?? 'css') as SelectorType, value: String(s.value ?? '') })
        : typeof scraper.selectors?.main === 'string' && scraper.selectors.main
          ? [{ type: 'css', value: scraper.selectors.main }]
          : [{ type: 'css', value: '' }],
      paginationConfig: {
        type: 'nextButton',
        selectors: Array.isArray(scraper.selectors?.pagination)
          ? scraper.selectors.pagination.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: (s.type ?? 'css') as SelectorType, value: String(s.value ?? '') })
          : typeof scraper.selectors?.pagination === 'string' && scraper.selectors.pagination
            ? [{ type: 'css', value: scraper.selectors.pagination }]
            : [],
        maxPages: 20,
        waitAfterClick: 1000
      },
      paginationSelectors: [],
      dropdownClickSelectors: Array.isArray(scraper.selectors?.dropdownClick)
        ? scraper.selectors.dropdownClick.map(s => typeof s === 'string' ? { type: 'css', value: s } : { type: (s.type ?? 'css') as SelectorType, value: String(s.value ?? '') })
        : typeof scraper.selectors?.dropdownClick === 'string' && scraper.selectors?.dropdownClick
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

    (async () => {
      if (scraper.id) {
        const t = await getTransformations(scraper.id);
        setTransformationsState(t);
        setJobHistoryLoading(true);
        try {
          const jobs = await getJobHistory(scraper.id);
          setJobHistory(jobs as JobHistoryEntry[]);
        } catch {
          setJobHistory([]);
        } finally {
          setJobHistoryLoading(false);
        }
      }
    })();
  };

  const handleNewScraper = () => {
    setEditingScraperId(null);
    setFormData({
      name: '',
      source: '',
      mainSelectors: [{ type: 'css', value: '' }],
      paginationConfig: {
        type: 'nextButton',
        selectors: [{ type: 'css', value: '' }],
        maxPages: 20,
        waitAfterClick: 1000
      },
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
      paginationConfig: {
        type: 'nextButton',
        selectors: [{ type: 'css', value: '' }],
        maxPages: 20,
        waitAfterClick: 1000
      },
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
  const handleTestSelector = async () => {
    setTestLoading(true);
    setTestError(null);
    setTestResult(null);
    try {
      const result = await testSelector(testInput, { type: testModal.selectorType, value: testModal.selectorValue });
      setTestResult(result as SelectorTestResult);
    } catch (err: unknown) {
      let msg = 'Erreur lors du test du sélecteur';
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const e = err as { response?: { data?: { error?: string } } };
        msg = e.response?.data?.error || msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setTestError(String(msg));
    } finally {
      setTestLoading(false);
    }
  };

  const handleOpenShare = (scraper: Scraper) => {
    setShareTargetScraper(scraper);
    setShareUserId('');
    setShowShareDialog(true);
  };
  const handleShare = async () => {
    if (shareTargetScraper && shareUserId) {
      await shareScraper(shareTargetScraper.id, shareUserId);
      toast.success('Scraper partagé !');
      setShowShareDialog(false);
    }
  };
  const handleOpenShared = async () => {
    setShowSharedDialog(true);
    const shared = await getSharedScrapers();
    setSharedScrapers(shared as Scraper[]);
  };
  const handleOpenAlerts = async (scraper: Scraper) => {
    setSelectedAlertScraper(scraper);
    const alertList = await listAlerts(scraper.id);
    setAlerts(alertList as Record<string, unknown>[]);
    setShowAlertsDialog(true);
  };
  const handleOpenConfigs = async () => {
    setShowConfigsDialog(true);
    const configList = await listConfigs();
    setConfigs(configList as unknown as ConfigSummary[]);
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
      
      <Tabs defaultValue="scrapers" className="mb-6">
        <TabsList>
          <TabsTrigger value="scrapers">Scrapers</TabsTrigger>
          <TabsTrigger value="shared" onClick={handleOpenShared}>Partagés avec moi</TabsTrigger>
          <TabsTrigger value="configs" onClick={handleOpenConfigs}>Versions/Configs</TabsTrigger>
        </TabsList>
        <TabsContent value="scrapers">
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
                    onShareScraper={handleOpenShare}
                    onViewAlerts={handleOpenAlerts}
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
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              // Export all visible fields as true
                              await exportScraperDataAsCsv(scraperId, {
                                nom: true,
                                email: true,
                                telephone: true,
                                adresse: true,
                                site_web: true,
                                secteur: true,
                                created_at: true
                              }, `donnees-${scraper.name || 'scraper'}`);
                              toast.success('Export CSV lancé !');
                            } catch (err) {
                              toast.error('Erreur lors de l\'export CSV');
                            }
                          }}
                        >
                          Exporter CSV
                        </Button>
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
        </TabsContent>
        <TabsContent value="shared">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Scrapers partagés avec moi</h3>
            {sharedScrapers.length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucun scraper partagé trouvé.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 border">Nom</th>
                      <th className="p-2 border">Source</th>
                      <th className="p-2 border">Pays</th>
                      <th className="p-2 border">Type</th>
                      <th className="p-2 border">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sharedScrapers.map((scraper) => (
                      <tr key={scraper.id}>
                        <td className="p-2 border font-semibold">{scraper.name}</td>
                        <td className="p-2 border">{scraper.source}</td>
                        <td className="p-2 border">{scraper.country}</td>
                        <td className="p-2 border">{scraper.type}</td>
                        <td className="p-2 border">
                          <Button size="sm" variant="outline" onClick={() => handleViewData(scraper.id)}>Voir données</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
        {/* Alerts Dialog */}
        <Dialog open={showAlertsDialog} onOpenChange={setShowAlertsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alertes pour {selectedAlertScraper?.name || ''}</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="text-muted-foreground text-xs">Aucune alerte trouvée.</div>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((alert, i) => {
                    const isCritical = alert.severity === 'critical';
                    if (isCritical) {
                      toast.warning(`ALERTE CRITIQUE: ${alert.title || 'Alerte'} - ${alert.message}`);
                    }
                    return (
                      <li key={i} className={`p-2 rounded border-l-4 ${isCritical ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-400'}`}>
                        <div className="flex items-center gap-2 font-semibold text-yellow-800">
                          {isCritical ? <AlertTriangle className="text-red-500 h-4 w-4" /> : <Bell className="text-yellow-500 h-4 w-4" />}
                          {String(alert.title) || 'Alerte'}
                          {isCritical && <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded">CRITIQUE</span>}
                        </div>
                        <div className="text-xs text-yellow-700">{String(alert.message) || JSON.stringify(alert)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{alert.created_at ? new Date(String(alert.created_at)).toLocaleString() : ''}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAlertsDialog(false)}>Fermer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <TabsContent value="configs">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Versions / Configs</h3>
              <Button variant="outline" size="sm" onClick={handleOpenConfigs}>Rafraîchir</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 border">Nom</th>
                    <th className="p-2 border">Version</th>
                    <th className="p-2 border">Dernière mise à jour</th>
                    <th className="p-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.length === 0 ? (
                    <tr><td colSpan={4} className="p-2 text-center text-muted-foreground">Aucune config trouvée.</td></tr>
                  ) : (configs as ConfigSummary[]).map((config) => (
                    <tr key={config.id}>
                      <td className="p-2 border font-semibold">{config.name}</td>
                      <td className="p-2 border">{config.version}</td>
                      <td className="p-2 border">{config.updated_at ? new Date(config.updated_at).toLocaleString() : '-'}</td>
                      <td className="p-2 border flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const details = await getConfig(config.id);
                            setConfigs((prev: ConfigSummary[]) => prev.map(c => c.id === config.id ? { ...c, _details: details } : c));
                            setShowConfigsDialog(true);
                          } catch {
                            toast.error('Erreur lors du chargement de la config');
                          }
                        }}>Voir</Button>
                        <Button size="sm" variant="destructive" onClick={async () => {
                          if (window.confirm('Supprimer cette config ?')) {
                            try {
                              await deleteConfig(config.id);
                              toast.success('Config supprimée');
                              handleOpenConfigs();
                            } catch {
                              toast.error('Erreur lors de la suppression');
                            }
                          }
                        }}>Supprimer</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Config details dialog */}
            <Dialog open={showConfigsDialog} onOpenChange={setShowConfigsDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Détails de la config</DialogTitle>
                </DialogHeader>
                <div className="overflow-x-auto max-h-96">
                  {(configs as ConfigSummary[]).find((c) => c._details) ? (
                    <pre className="text-xs bg-gray-100 p-2 rounded border overflow-x-auto">
                      {JSON.stringify((configs as ConfigSummary[]).find((c) => c._details)?._details, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-muted-foreground text-xs">Aucune donnée à afficher.</div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowConfigsDialog(false)}>Fermer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Card>
        </TabsContent>
      </Tabs>

      {showForm && (
        <Card ref={formRef} className="max-w-3xl mx-auto shadow-xl border border-gray-200 rounded-lg mt-8 animate-slideDown">
          <form onSubmit={handleSubmit}>
            <CardHeader className="bg-gradient-to-r from-[#f8fafc] to-[#e0e7ef] rounded-t-lg border-b border-gray-100">
              <CardTitle className="text-2xl  mb-1">Créer un nouveau scraper</CardTitle>
              <CardDescription className="text-muted-foreground">Configurez un nouveau scraper pour collecter des données d'une source en ligne.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Nom du scraper</label>
                  <Input id="name" placeholder="Ex: FADEV Scraper" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="source" className="text-sm font-medium">URL de la source</label>
                  <Input id="source" placeholder="Ex: https://fadev.org" value={formData.source} onChange={(e) => handleInputChange('source', e.target.value)} required />
                </div>
              </div>
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
              <Accordion type="single" collapsible className="mt-4 border rounded-lg bg-white">
                <AccordionItem value="pagination">
                  <AccordionTrigger className="text-base font-semibold px-4 py-2">Pagination</AccordionTrigger>
                  <AccordionContent className="p-4 border-t bg-gray-50">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Pagination</label>
                      <div className="flex gap-2 items-center">
                        <Select
                          value={formData.paginationConfig.type}
                          onValueChange={v => handleInputChange('paginationConfig.type', v)}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Type de pagination" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nextButton">Bouton Suivant</SelectItem>
                            <SelectItem value="numberLinks">Liens Numérotés</SelectItem>
                            <SelectItem value="loadMore">Bouton \"Charger plus\"</SelectItem>
                          </SelectContent>
                        </Select>
                        {formData.paginationConfig.type === 'loadMore' && (
                          <Input
                            type="number"
                            className="w-32"
                            min={0}
                            value={formData.paginationConfig.waitAfterClick || 1000}
                            onChange={e => handleInputChange('paginationConfig.waitAfterClick', Number(e.target.value))}
                            placeholder="Attente après clic (ms)"
                          />
                        )}
                      </div>
                      <div className="space-y-1 mt-2">
                        <label className="text-xs font-medium">Sélecteurs de pagination</label>
                        {formData.paginationConfig.selectors.map((selector, idx) => (
                          <div key={idx} className="flex gap-2 items-center mb-1">
                            <Select
                              value={selector.type as SelectorType}
                              onValueChange={v => {
                                const updated = [...formData.paginationConfig.selectors];
                                updated[idx] = { ...updated[idx], type: v as SelectorType };
                                setFormData(prev => ({
                                  ...prev,
                                  paginationConfig: { ...prev.paginationConfig, selectors: updated }
                                }));
                              }}
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
                              onChange={e => {
                                const updated = [...formData.paginationConfig.selectors];
                                updated[idx] = { ...updated[idx], value: e.target.value };
                                setFormData(prev => ({
                                  ...prev,
                                  paginationConfig: { ...prev.paginationConfig, selectors: updated }
                                }));
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  paginationConfig: {
                                    ...prev.paginationConfig,
                                    selectors: prev.paginationConfig.selectors.filter((_, i) => i !== idx)
                                  }
                                }));
                              }}
                              disabled={formData.paginationConfig.selectors.length === 1}
                            >
                              -
                            </Button>
                            {idx === formData.paginationConfig.selectors.length - 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    paginationConfig: {
                                      ...prev.paginationConfig,
                                      selectors: [...prev.paginationConfig.selectors, { type: 'css', value: '' }]
                                    }
                                  }));
                                }}
                              >
                                +
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="child-selectors">
                  <AccordionTrigger className="text-base font-semibold px-4 py-2">Sélecteurs enfants</AccordionTrigger>
                  <AccordionContent className="p-4 border-t bg-gray-50">
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
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="transform-rules">
                  <AccordionTrigger className="text-base font-semibold px-4 py-2">Règles de transformation des champs</AccordionTrigger>
                  <AccordionContent className="p-4 border-t bg-gray-50">
                    {Object.keys(formData.childSelectors).map(field => (
                      <tr key={field}>
                        <td className="p-2 border font-semibold flex items-center gap-2">
                          {field}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const sample = prompt(`Entrez une valeur d'exemple pour le champ "${field}" à auto-labeller:`);
                              if (!sample) return;
                              try {
                                const result = await autoLabelField(sample) as { suggestedField?: string; type?: string };
                                toast.info(`Suggestion: ${result.suggestedField || result.type || JSON.stringify(result)}`);
                              } catch (err) {
                                toast.error('Erreur lors de la suggestion auto-label');
                              }
                            }}
                          >
                            Suggérer
                          </Button>
                        </td>
                        <td className="p-2 border">
                          {(transformations.filter(t => t.field === field) || []).map((t, i) => (
                            <span key={i} className="inline-block bg-blue-100 text-blue-800 rounded px-2 py-1 mr-1 mb-1">
                              {t.type}
                            </span>
                          ))}
                        </td>
                        <td className="p-2 border">
                          <Button type="button" size="sm" variant="outline" onClick={() => { setEditingField(field); setEditingTransform({}); setShowTransformDialog(true); }}>Éditer</Button>
                        </td>
                      </tr>
                    ))}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="frequency">
                  <AccordionTrigger className="text-base font-semibold px-4 py-2">Fréquence</AccordionTrigger>
                  <AccordionContent className="p-4 border-t bg-gray-50">
                    <Select
                      value={formData.frequency || 'manual'}
                      onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'manual') => handleInputChange('frequency', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une fréquence" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manuel uniquement</SelectItem>
                        <SelectItem value="daily">Quotidien</SelectItem>
                        <SelectItem value="weekly">Hebdomadaire</SelectItem>
                        <SelectItem value="monthly">Mensuel</SelectItem>
                      </SelectContent>
                    </Select>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
            <CardFooter className="flex justify-between p-6 border-t bg-gradient-to-r from-[#f8fafc] to-[#e0e7ef] rounded-b-lg">
              <Button type="button" variant="outline" onClick={handleCancel}>Annuler</Button>
              <Button type="submit" className="bg-africa-green-500 hover:bg-africa-green-600" disabled={loading}>
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}


