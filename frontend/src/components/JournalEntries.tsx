import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown, ChevronRight, MoreHorizontal, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserEntries } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface JournalEntry {
  objectID: string;
  title: string;
  summary: string;
  tags: string[];
  timestamp: string;
  text: string;
  session_id: string;
  date: string;
}

interface JournalEntriesProps {
  className?: string;
  refreshTrigger?: number; // Add refresh trigger prop
}

export function JournalEntries({ className, refreshTrigger = 0 }: JournalEntriesProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        setLoading(true);
        setError("");
        const entriesData = await getUserEntries();
        console.log("Fetched entries:", entriesData);
        setEntries(entriesData);
      } catch (err) {
        console.error("Error fetching entries:", err);
        setError(err instanceof Error ? err.message : "Failed to load entries");
        toast({
          title: "Error",
          description: "Failed to load journal entries",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [toast, refreshTrigger]); // Add refreshTrigger to dependencies

  const toggleDay = (date: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDays(newExpanded);
  };

  const handleSessionClick = (sessionId: string) => {
    navigate(`/session/${sessionId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Group entries by date
  const groupedEntries = entries.reduce((groups, entry) => {
    const date = entry.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, JournalEntry[]>);

  // Sort dates in descending order (most recent first)
  const sortedDates = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (loading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-xl font-semibold">Journal Entries</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-xl font-semibold">Journal Entries</h2>
        </div>
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            className="mt-4"
          >
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-xl font-semibold">Journal Entries</h2>
        </div>
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">No journal entries yet. Start your first session to begin journaling.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-serif text-xl font-semibold">Journal Entries</h2>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
          className="flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      <div className="space-y-4">
        {sortedDates.map((date) => {
          const dayEntries = groupedEntries[date];
          const isExpanded = expandedDays.has(date);
          
          return (
            <Card key={date} className="shadow-whisper">
              <div 
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleDay(date)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <h3 className="font-serif font-semibold text-lg">{formatDate(date)}</h3>
                      <p className="text-sm text-muted-foreground">
                        {dayEntries.length} session{dayEntries.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="border-t bg-muted/20">
                  <div className="p-4 space-y-4">
                    {dayEntries.map((entry) => (
                      <Card key={entry.objectID} className="shadow-sm">
                        <div className="p-4">
                          <div className="mb-3">
                            <div>
                              <h4 
                                className="font-serif font-semibold text-base cursor-pointer hover:text-primary transition-colors"
                                onClick={() => handleSessionClick(entry.session_id)}
                              >
                                {entry.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {formatTime(entry.timestamp)}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-sm leading-relaxed text-muted-foreground mb-3">
                            {entry.summary}
                          </p>
                          
                          <div className="flex flex-wrap gap-1 mb-3">
                            {entry.tags.map((tag) => (
                              <span 
                                key={tag} 
                                className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          

                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}