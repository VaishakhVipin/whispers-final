import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { searchEntries } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  objectID: string;
  title: string;
  summary: string;
  tags: string[];
  timestamp: string;
  text?: string;
}

interface SearchInterfaceProps {
  onSearch?: (query: string) => void;
}

export function SearchInterface({ onSearch }: SearchInterfaceProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [geminiResponse, setGeminiResponse] = useState("");
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    onSearch?.(query);

    try {
      const searchResult = await searchEntries(query);
      console.log("Search result:", searchResult);
      
      // Extract results from the API response
      const apiResults = searchResult.algolia_hits || [];
      const geminiResponseText = searchResult.final_summary || searchResult.stage1_response || "";
      
      setResults(apiResults);
      setGeminiResponse(geminiResponseText);
      
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search Error",
        description: "Failed to search journal entries. Please try again.",
        variant: "destructive"
      });
      
      // Fallback to empty results
      setResults([]);
      setGeminiResponse("I couldn't search your journal entries at the moment. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleEntry = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <Card className="p-4 shadow-whisper">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Ask anything about your journal entries..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-10"
            />
          </div>
          <Button 
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="px-6"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        <div className="mt-3 flex flex-wrap gap-2">
          {["When did I feel productive?", "What were my creative ideas?", "How was my mood last week?"].map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              onClick={() => setQuery(suggestion)}
              className="text-xs"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </Card>

      {/* AI Response */}
      {geminiResponse && (
        <Card className="p-6 bg-accent/20 border-accent shadow-whisper">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-serif font-semibold mb-2">AI Insights</h3>
              <p className="text-sm leading-relaxed">{geminiResponse}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-serif text-lg font-semibold">Journal Entries</h3>
          {results.map((result) => (
            <Card 
              key={result.objectID} 
              className="p-6 shadow-whisper hover:shadow-elegant transition-shadow duration-200 cursor-pointer"
              onClick={() => toggleEntry(result.objectID)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-serif font-semibold text-lg">{result.title}</h4>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatDate(result.timestamp)}
                  </span>
                </div>
                
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {result.summary}
                </p>
                
                                            <div className="flex flex-wrap gap-1">
                              {result.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                
                {/* Full Entry Content */}
                {expandedEntries.has(result.objectID) && result.text && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
                    <h5 className="font-medium text-sm mb-2">Full Entry:</h5>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {result.text}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {query && !isSearching && results.length === 0 && geminiResponse && (
        <Card className="p-8 text-center shadow-whisper">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-serif text-lg font-semibold mb-2">No Entries Found</h3>
          <p className="text-sm text-muted-foreground">
            Try searching with different keywords or check your journal entries.
          </p>
        </Card>
      )}
    </div>
  );
}