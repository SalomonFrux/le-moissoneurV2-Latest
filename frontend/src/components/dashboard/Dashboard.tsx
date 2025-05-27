import React, { useState, useEffect } from 'react';
import { StatsCard } from './StatsCard';
import { ScraperCard } from './ScraperCard';
import { ArrowRightOnRectangleIcon  } from '@heroicons/react/24/outline'; 
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, Globe, TrendingUp, Users, ChevronDown, ChevronRight as ChevronRightIcon, ChevronLeft, ChevronUp, Download, Mail, Link as LinkIcon, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { dataService, type Scraper, type ScrapedEntry } from '@/services/dataService';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import axios from 'axios';
import { authService } from '@/services/authService';
import { useNavigate } from 'react-router-dom';
import { scraperStatusService } from '@/services/scraperStatusService';
import { ScraperStatus } from '@/components/scraper/ScraperStatus';
import { ScraperStatus as ScraperStatusType } from '@/components/scraper/types';
import { ScraperProgress } from '@/components/scraper/ScraperProgress';

interface SelectorObject {
  type: 'css' | 'xpath';
  value: string;
}

interface ScraperData {
  id: string;
  name: string;
  source: string;
  status: 'idle' | 'running' | 'error' | 'completed';
  last_run?: string;
  dataCount: number;
  selectors: {
    main: SelectorObject[];
    pagination?: SelectorObject[];
    dropdownClick?: SelectorObject[];
    child?: Record<string, SelectorObject[]>;
  };
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  country: string;
  type: 'playwright' | 'puppeteer';
}

interface ScraperCardProps {
  scraper: ScraperData;
  onRunScraper: (id: string) => Promise<void>;
  onStopScraper: (id: string) => void;
  onViewData: (id: string) => Promise<void>;
  onEditScraper?: (id: string) => void;
  onDeleteScraper?: (id: string) => void;
}

interface DashboardStats {
  totalEntries: number;
  uniqueCountries: number;
  sourcesCount: number;
  enrichmentRate: number;
}

interface ScrapedDataGroup {
  scraper_name: string;
  entries: ScrapedEntry[];
}

interface ScraperConfig {
  name: string;
  source: string;
  mainSelectors: SelectorObject[];
  paginationSelectors: SelectorObject[];
  dropdownClickSelectors: SelectorObject[];
  childSelectors: Record<string, SelectorObject[]>;
  engine: 'playwright' | 'puppeteer';
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  country: string;
  twoPhaseScraping: string;
  phase1Selectors: {
    name: string;
    dropdownTrigger: string;
  };
  phase2Selectors: {
    name: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
}

export function Dashboard() {
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrapedData, setScrapedData] = useState<Record<string, ScrapedEntry[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupedData, setGroupedData] = useState<Record<string, ScrapedEntry[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllScrapers, setShowAllScrapers] = useState(false);
  const [selectedScraperData, setSelectedScraperData] = useState<ScrapedEntry[]>([]);
  const [selectedScraperId, setSelectedScraperId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const pageSizeOptions = [4, 6, 8, 12, 20, 50, 100, 200, 500, 1000];
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'dataCount' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [stats, setStats] = useState<DashboardStats>({
    totalEntries: 0,
    uniqueCountries: 0,
    sourcesCount: 0,
    enrichmentRate: 0
  });
  const [showForm, setShowForm] = useState(false);
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

  const navigate = useNavigate();

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/dashboard`, {
        headers: {
          Authorization: `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.data.stats) {
        setStats({
          totalEntries: response.data.stats.totalEntries || 0,
          uniqueCountries: response.data.stats.uniqueCountries || 0,
          sourcesCount: response.data.stats.uniqueScrapers || 0,
          enrichmentRate: response.data.stats.completeness || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('Erreur lors du chargement des statistiques');
    }
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // First fetch the dashboard stats
        await fetchDashboardStats();
       // console.log('Dashboard stats fetched');

        // Then fetch scrapers and data
        const [scrapers, scrapedDataGroups] = await Promise.all([
          dataService.getAllScrapers(),
          dataService.fetchAllScrapedData()
        ]);

        //console.log('Fetched data:', {
        //  scrapers: scrapers.length,
        //  scrapedDataGroups: scrapedDataGroups.length
        //});

        // Format the scrapers data
        const scrapersWithFormattedDate = scrapers.map(scraper => ({
          ...scraper,
          last_run: scraper.last_run ? new Date(scraper.last_run).toISOString() : undefined
        }));
        
        setScrapers(scrapersWithFormattedDate);
        
        // Convert grouped data to flat structure
        const grouped = scrapedDataGroups.reduce((acc: Record<string, ScrapedEntry[]>, group) => {
          acc[group.scraper_name] = group.entries;
          return acc;
        }, {});
        
        setGroupedData(grouped);

        // Update stats with active sources
        const activeSourcesCount = scrapers.filter(s => s.data_count > 0).length;
        setStats(prev => ({
          ...prev,
          sourcesCount: activeSourcesCount
        }));
      } catch (error) {
        console.error('Error loading dashboard:', error);
        if (axios.isAxiosError(error)) {
          console.error('Axios error details:', {
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers
          });
        }
        toast.error('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleStopScraper = (id: string) => {
    setScrapers((prev) =>
      prev.map((scraper) =>
        scraper.id === id ? { ...scraper, status: 'idle' } : scraper
      )
    );
    toast.info(`Scraper arrêté`, {
      description: "L'opération a été interrompue."
    });
  };

  const handleViewData = async (id: string) => {
    try {
      const response = await dataService.fetchScrapedData({
        page: currentPage,
        limit: itemsPerPage,
        scraper_id: id
      });
      
      console.log('View data response:', response);
      
      if (response.data) {
        setSelectedScraperData(response.data);
        setSelectedScraperId(id);
        
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
            description: `${response.data.length} entrées trouvées`
          });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers
        });
      }
      toast.error('Erreur lors du chargement des données');
    }
  };

  // Filter scrapers based on search query
  const filteredScrapers = scrapers.filter(scraper =>
    scraper.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    scraper.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
    scraper.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort scrapers
  const sortedScrapers = [...filteredScrapers].sort((a, b) => {
    if (sortBy === 'date') {
      const dateA = a.last_run ? new Date(a.last_run).getTime() : 0;
      const dateB = b.last_run ? new Date(b.last_run).getTime() : 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    }
    
    const aValue = sortBy === 'name' ? a.name.toLowerCase() :
                  sortBy === 'status' ? a.status :
                  a.data_count;
    const bValue = sortBy === 'name' ? b.name.toLowerCase() :
                  sortBy === 'status' ? b.status :
                  b.data_count;
    
    return sortOrder === 'asc' ? 
      (aValue > bValue ? 1 : -1) :
      (aValue < bValue ? 1 : -1);
  });

  // Calculate pagination
  const totalItems = sortedScrapers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedScrapers = sortedScrapers
    .slice(startIndex, endIndex)
    .map(scraper => ({
      ...scraper,
      dataCount: scraper.data_count || 0,
      selectors: {
        main: scraper.selectors?.main || [],
        pagination: scraper.selectors?.pagination || [],
        dropdownClick: scraper.selectors?.dropdownClick || [],
        child: scraper.selectors?.child || {},
        name: scraper.selectors?.name || [],
        email: scraper.selectors?.email || [],
        phone: scraper.selectors?.phone || [],
        address: scraper.selectors?.address || [],
        website: scraper.selectors?.website || [],
        sector: scraper.selectors?.sector || []
      },
      type: scraper.type || 'playwright'
    }));

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Jamais';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Jamais';
      
      const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${String(date.getDate()).padStart(2, '0')}/${months[date.getMonth()]}/${date.getFullYear()} ${hours}:${minutes}`;
    } catch (error) {
      //console.error('Error formatting date:', dateString, error);
      return 'Jamais';
    }
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold font-heading tracking-tight">Tableau de bord</h2>
        <Button 
  variant="outline"
  onClick={handleLogout}
  className="flex items-center bg-[#15616D] text-white hover:bg-[#8c4c0b] transition-colors duration-300 rounded-md px-4 py-2 shadow-md"
>
  <ArrowRightOnRectangleIcon  className="h-5 w-5 mr-2" /> {/* Icon for logout */}
  Se déconnecter
</Button>
      </div>
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-t-africa-green-500 border-r-africa-green-500 border-b-gray-200 border-l-gray-200 animate-spin"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <Database className="h-6 w-6 text-africa-green-500 animate-ping" />
            </div>
          </div>
          <p className="text-lg text-muted-foreground">Chargement des données...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
            <StatsCard
              title="Total Entrées"
              value={stats.totalEntries.toString()}
              icon={<Database className="h-4 w-4 text-muted-foreground" />}
              description="Nombre total d'entrées collectées"
            />
            <StatsCard
              title="Pays Uniques"
              value={stats.uniqueCountries.toString()}
              icon={<Globe className="h-4 w-4 text-muted-foreground" />}
              description="Nombre de pays couverts"
            />
            <StatsCard
              title="Sources Actives"
              value={stats.sourcesCount.toString()}
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              description="Sources de données actives"
            />
     
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold font-heading">Scrapers</h3>
              <div className="flex gap-4 items-center">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un scraper..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-[300px]"
                  />
                </div>
                <Select
                  value={sortBy}
                  onValueChange={(value: 'name' | 'status' | 'dataCount' | 'date') => setSortBy(value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Trier par" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Nom</SelectItem>
                    <SelectItem value="status">Statut</SelectItem>
                    <SelectItem value="dataCount">Nombre de données</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {scrapers.length === 0 ? (
              <p>No scrapers available.</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedScrapers.map((scraper) => (
                    <ScraperCard
                      key={scraper.id}
                      scraper={scraper}
                      onStopScraper={handleStopScraper}
                      onViewData={handleViewData}
                      showViewData={true}
                    />
                  ))}
                </div>
                
                {/* Scraped Data Table */}
                {selectedScraperId && (
                  <div data-scraper-table>
                    <Card className="mt-4">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Données du scraper</CardTitle>
                          <CardDescription>{selectedScraperData.length} entrées affichées</CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedScraperId(null);
                            setSelectedScraperData([]);
                          }}
                        >
                          Fermer
                        </Button>
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
    {selectedScraperData.map((entry, index) => (
      <TableRow 
        key={entry.id}
        className={`
          ${index % 2 === 0 ? 'bg-white' : 'bg-[#15616D]/5'}
          hover:bg-[#15616D]/10 transition-colors
        `}
      >
        <TableCell className="font-medium capitalize py-3 px-4 text-[#001524]">
          {entry.nom?.toLowerCase() || '-'}
        </TableCell>
        <TableCell className="py-3 px-4">
          {entry.email ? (
            <a 
              href={`mailto:${entry.email}`} 
              className="text-[#15616D] hover:text-[#001524] hover:underline flex items-center gap-1 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {entry.email}
            </a>
          ) : '-'}
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.telephone?.toLowerCase() || '-'}
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.adresse?.toLowerCase() || '-'}
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
              {entry.site_web}
            </a>
          ) : '-'}
        </TableCell>
        <TableCell className="capitalize py-3 px-4 text-[#15616D]">
          {entry.secteur?.toLowerCase() || '-'}
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
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pagination */}
          {totalItems > 0 && (
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
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
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <Button
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Suivant
                      <ChevronRightIcon className="h-4 w-4 ml-1" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
