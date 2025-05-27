import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCw, Database, Square, Eye, MoreVertical, Pencil, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // Ensure this import is correct
import { type Scraper } from '@/services/dataService';

interface ScraperCardProps {
  scraper: Scraper;
  onRunScraper?: (id: string) => void;
  onStopScraper: (id: string) => void;
  onViewData?: (id: string) => void;
  onEditScraper?: (scraper: Scraper) => void;
  onDeleteScraper?: (id: string) => void;
  showViewData?: boolean;
  showEditOptions?: boolean;
  onShareScraper?: (scraper: Scraper) => void;
  onViewAlerts?: (scraper: Scraper) => void;
}

export function ScraperCard({ 
  scraper, 
  onRunScraper, 
  onStopScraper, 
  onViewData, 
  onEditScraper,
  onDeleteScraper,
  showViewData = true,
  showEditOptions = false,
  onShareScraper,
  onViewAlerts
}: ScraperCardProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const getStatusColor = (status: Scraper['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: Scraper['status']) => {
    switch (status) {
      case 'running':
        return 'En cours';
      case 'completed':
        return 'Terminé';
      case 'error':
        return 'Erreur';
      default:
        return 'Inactif';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Jamais';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Jamais';
      
      const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
      const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${months[date.getMonth()]}/${date.getFullYear()}`;
      
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const formattedTime = `${hours}:${minutes}`;
      
      return `${formattedDate} ${formattedTime}`;
    } catch (error) {
      return 'Jamais';
    }
  };

  const handleRunScraper = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmRun = () => {
    if (onRunScraper) {
      onRunScraper(scraper.id);
    }
    setDeleteConfirmOpen(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base font-medium">{scraper.name}</CardTitle>
        {showEditOptions && onEditScraper && onDeleteScraper && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditScraper(scraper)}>
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDeleteScraper(scraper.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-2">
          Source: <span className="font-medium">{scraper.source}</span>
        </div>
        
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Database className="h-4 w-4 text-africa-green-500" />
              <span>{scraper.data_count} entrées</span>
            </div>
            <div className="flex items-center gap-1">
              <RotateCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatDate(scraper.last_run)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(scraper.status)}`} />
          <span className="text-xs text-muted-foreground">
            {getStatusText(scraper.status)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {scraper.status === 'running' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStopScraper(scraper.id)}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            onRunScraper && (
              <>
                <Button
                  className="hover:bg-[#0c8387] hover:text-white"
                  variant="outline"
                  size="sm"
                  onClick={handleRunScraper}
                >
                  <Play className="h-4 w-4" />
                </Button>

                <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                  <DialogContent className="border-[#15616D]/20">
                    <DialogHeader>
                      <DialogTitle className="text-[#001524]">Êtes-vous sûr ?</DialogTitle>
                      <DialogDescription className="text-[#15616D]">
                        Cette action modifiera les données. Êtes-vous sûr de vouloir exécuter ce scraper ?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} className="border-[#15616D] text-[#15616D] hover:bg-[#15616D]/10">
                        Annuler
                      </Button>
                      <Button 
                        onClick={handleConfirmRun} 
                        className="bg-[#FF6F61] text-white hover:bg-[#FF6F61]/90"
                      >
                        Exécuter
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )
          )}
          {showViewData && onViewData && (
            <Button 
              className="hover:bg-[#0c8387] hover:text-white" 
              variant="outline" 
              size="sm" 
              onClick={() => onViewData(scraper.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {onShareScraper && (
            <Button variant="outline" size="sm" onClick={() => onShareScraper(scraper)}>
              Partager
            </Button>
          )}
          {onViewAlerts && (
            <Button variant="outline" size="sm" onClick={() => onViewAlerts(scraper)}>
              Alertes
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}