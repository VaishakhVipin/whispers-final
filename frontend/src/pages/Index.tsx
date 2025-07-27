import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotionLikeEditor } from "@/components/NotionLikeEditor";
import { SearchInterface } from "@/components/SearchInterface";
import { JournalEntries } from "@/components/JournalEntries";
import { Mic, Search, BookOpen, Settings, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { startSession, summarizeText, indexEntry, searchEntries } from "@/lib/api";

const Index = () => {
  const [activeTab, setActiveTab] = useState("record");
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();

  const handleStartSession = async () => {
    try {
      const session = await startSession(false);
      setCurrentSession(session.session_id);
      toast({
        title: "New session started",
        description: "Ready to capture your thoughts for today.",
      });
    } catch (err) {
      toast({ title: "Error", description: String(err) });
    }
  };

  const handleTranscription = async (text: string) => {
    try {
      // 1. Summarize text
      const summary = await summarizeText(text);
      console.log("Summary generated:", summary);
      
      // 2. Index entry (user_id now comes from token)
      const result = await indexEntry({
        session_id: currentSession,
        date: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        title: summary.title,
        summary: summary.summary,
        tags: summary.tags,
        text,
      });
      
      console.log("Entry indexed:", result);
      toast({ 
        title: "Entry saved", 
        description: `"${summary.title}" was processed and stored.` 
      });
      
      // Trigger refresh of journal entries
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error("Error saving entry:", err);
      toast({ 
        title: "Error saving entry", 
        description: String(err),
        variant: "destructive"
      });
    }
  };

  const handleSearch = async (query: string) => {
    try {
      const results = await searchEntries(query);
      console.log("Search results:", results);
      toast({ title: "Search complete", description: `Found ${results.results?.length ?? 0} entries.` });
    } catch (err) {
      toast({ title: "Error", description: String(err) });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-whisper">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-bold text-primary">Whispers</h1>
              <p className="text-sm text-muted-foreground">Voice-first journaling</p>
            </div>
            
            <div className="flex items-center space-x-2">
              {currentSession && (
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-muted-foreground">Session active</span>
                </div>
              )}
              <Button variant="ghost" size="sm">
                <User className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          {/* Tab Navigation */}
          <Card className="p-2 shadow-whisper">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="record" className="flex items-center space-x-2">
                <Mic className="w-4 h-4" />
                <span>Record</span>
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center space-x-2">
                <Search className="w-4 h-4" />
                <span>Search</span>
              </TabsTrigger>
              <TabsTrigger value="entries" className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4" />
                <span>Entries</span>
              </TabsTrigger>
            </TabsList>
          </Card>

          {/* Recording Tab */}
          <TabsContent value="record" className="space-y-8">
            <div className="text-center">
              <h2 className="font-serif text-3xl font-bold mb-4">Share Your Thoughts</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Speak naturally and let AI capture, transcribe, and organize your ideas in real-time.
              </p>
            </div>

            {/* Session Management */}
            {!currentSession && (
              <Card className="p-8 text-center shadow-elegant">
                <h3 className="font-serif text-xl font-semibold mb-4">Start Your Daily Session</h3>
                <p className="text-muted-foreground mb-6">
                  Begin a new journaling session to organize today's thoughts and reflections.
                </p>
                <Button onClick={handleStartSession} size="lg" className="px-8">
                  Start New Session
                </Button>
              </Card>
            )}

            {/* Notion-like Editor */}
            {currentSession && (
              <div className="max-w-6xl mx-auto">
                <NotionLikeEditor 
                  onTranscription={handleTranscription}
                  onRecordingStart={() => console.log("Recording started")}
                  onRecordingStop={() => console.log("Recording stopped")}
                />
              </div>
            )}
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-8">
            <div className="text-center">
              <h2 className="font-serif text-3xl font-bold mb-4">Find Your Insights</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Ask questions about your journal entries using natural language. AI will search and provide contextual answers.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <SearchInterface onSearch={handleSearch} />
            </div>
          </TabsContent>

          {/* Entries Tab */}
          <TabsContent value="entries" className="space-y-8">
            <div className="text-center">
              <h2 className="font-serif text-3xl font-bold mb-4">Your Journey</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Browse through your journal entries organized by date and session.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <JournalEntries refreshTrigger={refreshTrigger} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>Built with ❤️ for mindful journaling</p>
            <p className="mt-2">
              Powered by AssemblyAI, Google Gemini, and Algolia
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;