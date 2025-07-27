import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { NotionLikeEditor } from "@/components/NotionLikeEditor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Share, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { summarizeText, indexEntry, updateSession, getSessionById } from "@/lib/api";

interface SessionInsights {
  title: string;
  summary: string;
  tags: string[];
}

const SessionPage = () => {
  const { sessionId } = useParams();
  const { toast } = useToast();
  
  console.log("🎯 SessionPage rendered with sessionId:", sessionId);
  
  const [transcriptionText, setTranscriptionText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [insights, setInsights] = useState<SessionInsights | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [sessionDuration, setSessionDuration] = useState("00:00");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<Date | null>(null);
  const [sessionTitle, setSessionTitle] = useState(`Session ${sessionId?.slice(-4)}`);
  const [isExistingSession, setIsExistingSession] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [isEditable, setIsEditable] = useState(false);
  const [creationDate, setCreationDate] = useState<string>("");
  const [showPrompt, setShowPrompt] = useState(false);

  // Check if session was created today
  const isSessionFromToday = (sessionDate: string) => {
    if (!sessionDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return sessionDate === today;
  };

  // Format creation date for display
  const formatCreationDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Load existing session data if sessionId is provided
  useEffect(() => {
    const loadSessionData = async () => {
      if (!sessionId) {
        setIsLoading(false);
        return;
      }

      // Reset all state when sessionId changes
      const resetState = () => {
        console.log("🔄 Resetting state for new session:", sessionId);
        setTranscriptionText("");
        setInsights(null);
        setWordCount(0);
        setSessionDuration("00:00");
        setIsRecording(false);
        setRecordingStartTime(null);
        setSessionTitle(`Session ${sessionId?.slice(-4)}`);
        setIsExistingSession(false);
        setSessionData(null);
        setIsEditable(true);
        setCreationDate("");
        setShowPrompt(false);
        console.log("✅ State reset completed");
      };

      try {
        setIsLoading(true);
        resetState(); // Reset state before loading new session
        
        console.log("🔄 Loading session data for ID:", sessionId);
        const session = await getSessionById(sessionId);
        console.log("📦 Loaded session data:", session);
        
        if (session) {
          setSessionData(session);
          setCreationDate(session.date || session.created_at?.split('T')[0] || "");
          const isFromPrompt = session.is_from_prompt || false;
          setShowPrompt(isFromPrompt);
          console.log("🔍 Session data analysis:", {
            session_id: session.session_id,
            is_from_prompt: session.is_from_prompt,
            date: session.date,
            created_at: session.created_at,
            title: session.title,
            summary: session.summary,
            text: session.text ? `"${session.text.substring(0, 100)}..."` : "NO TEXT FOUND",
            text_length: session.text ? session.text.length : 0,
            tags: session.tags || []
          });
          
          // Check if session has content (title, summary, or text)
          if (session.title || session.summary || session.text) {
            setIsExistingSession(true);
            setSessionTitle(session.title || `Session ${sessionId.slice(-4)}`);
            
            // If session has text content, load it
            if (session.text) {
              console.log("✅ Setting transcription text:", `"${session.text.substring(0, 100)}..."`);
              setTranscriptionText(session.text);
            } else {
              console.log("❌ No text content found in session - this might be a data issue");
              console.log("🔍 Session data keys:", Object.keys(session));
              setTranscriptionText("");
            }
            
            // Load insights
            console.log("📊 Setting insights:", { title: session.title, summary: session.summary, tags: session.tags || [] });
            setInsights({
              title: session.title,
              summary: session.summary,
              tags: session.tags || []
            });

            // Check if session is from today and should be editable
            const isFromToday = isSessionFromToday(session.date || session.created_at?.split('T')[0] || "");
            setIsEditable(isFromToday);
            console.log("🎯 Session analysis:", {
              isFromToday,
              isFromPrompt,
              isExistingSession: true,
              isEditable: isFromToday,
              showPrompt: isFromPrompt,
              hasText: !!session.text,
              textLength: session.text ? session.text.length : 0
            });
          } else {
            // This is a new session or session without content
            console.log("🆕 New session or session without content");
            setIsExistingSession(false);
            setIsEditable(true);
            setSessionTitle(`Session ${sessionId.slice(-4)}`);
            console.log("🎯 Session analysis:", {
              isFromToday: true,
              isFromPrompt,
              isExistingSession: false,
              isEditable: true,
              showPrompt: isFromPrompt
            });
          }
        } else {
          console.log("❌ No session found");
          setIsExistingSession(false);
          setIsEditable(true);
          setSessionData(null);
          setSessionTitle(`Session ${sessionId.slice(-4)}`);
        }
      } catch (error) {
        console.error("💥 Error loading session:", error);
        // If there's an error, treat it as a new session
        setIsExistingSession(false);
        setIsEditable(true);
        setSessionData(null);
        setSessionTitle(`Session ${sessionId.slice(-4)}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId]);

  // Update word count when transcription changes
  useEffect(() => {
    const words = transcriptionText.split(' ').filter(word => word.length > 0);
    setWordCount(words.length);
  }, [transcriptionText]);

  // Update session duration when recording
  useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setSessionDuration("00:00");
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const diff = now.getTime() - recordingStartTime.getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setSessionDuration(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  const handleTranscription = (text: string) => {
    setTranscriptionText(text);
  };

  const handleRecordingStart = () => {
    setIsRecording(true);
    setRecordingStartTime(new Date());
  };

  const handleRecordingStop = () => {
    setIsRecording(false);
    setRecordingStartTime(null);
  };

  const handleSave = async () => {
    if (!transcriptionText.trim() || transcriptionText.split(' ').filter(word => word.length > 0).length < 10) {
      toast({
        title: "Cannot save",
        description: "Session must contain at least 10 words to save",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      console.log("Saving session with text:", transcriptionText);
      
      // Generate insights
      const insightsResult = await summarizeText(transcriptionText);
      console.log("Generated insights:", insightsResult);
      
      setInsights(insightsResult);
      
      // Index the entry
      await indexEntry({
        session_id: sessionId!,
        text: transcriptionText,
        tags: insightsResult.tags,
        title: insightsResult.title,
        summary: insightsResult.summary,
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
      
      // Update session with title and summary
      await updateSession(sessionId!, insightsResult.title, insightsResult.summary, transcriptionText);
      
      // Update session title
      setSessionTitle(insightsResult.title);
      setIsExistingSession(true);
      
      toast({
        title: "Session saved",
        description: "Your journal entry has been saved successfully",
      });
      
      // Trigger sidebar refresh
      window.dispatchEvent(new CustomEvent('sessionSaved'));
      
    } catch (error) {
      console.error("Error saving session:", error);
      toast({
        title: "Error",
        description: "Failed to save session",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = () => {
    // TODO: Implement sharing functionality
    toast({
      title: "Coming soon",
      description: "Sharing functionality will be available soon",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{sessionTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {isExistingSession ? "Viewing saved session" : "New journaling session"}
            </p>
            {creationDate && (
              <p className="text-xs text-muted-foreground">
                Created on {formatCreationDate(creationDate)}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
          {isEditable && (
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !transcriptionText.trim()}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Session Content */}
      <Card className="p-6">
        {isExistingSession && !isEditable ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Daily Reflection</h2>
              <div className="text-sm text-muted-foreground">Read-only view</div>
            </div>
            <div className="prose max-w-none">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {transcriptionText || "No content available for this session."}
              </p>
            </div>
            {insights && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-medium mb-2">Session Summary</h3>
                <p className="text-sm text-muted-foreground mb-3">{insights.summary}</p>
                {insights.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {insights.tags.map((tag, index) => (
                      <span key={index} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          !isLoading ? (
            <NotionLikeEditor 
              key={sessionId} // Force re-render when session changes
              onTranscription={handleTranscription}
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
              isReadOnly={!isEditable}
              creationDate={sessionData?.date}
              initialText={transcriptionText || ""}
              showPrompt={showPrompt}
            />
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Loading session...</span>
              </div>
            </div>
          )
        )}
        
        {/* Show message if session has title/summary but no text content */}
        {isExistingSession && !transcriptionText && !isLoading && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-sm text-yellow-800">
                Session metadata found but content is not available. This might be due to a data indexing issue.
              </span>
            </div>
            <div className="mt-2 text-xs text-yellow-700">
              <p>Session ID: {sessionId}</p>
              <p>Title: {sessionData?.title || 'N/A'}</p>
              <p>Summary: {sessionData?.summary || 'N/A'}</p>
              <p>Date: {sessionData?.date || 'N/A'}</p>
              <p>Has text in session data: {sessionData?.text ? 'Yes' : 'No'}</p>
            </div>
            <div className="mt-3 space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  console.log("🔍 Debug: Full session data:", sessionData);
                  console.log("🔍 Debug: Session ID:", sessionId);
                  console.log("🔍 Debug: Transcription text:", transcriptionText);
                  console.log("🔍 Debug: Session text field:", sessionData?.text);
                  console.log("🔍 Debug: Text length:", sessionData?.text?.length);
                }}
              >
                Debug Session Data
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  // Force reload session data
                  window.location.reload();
                }}
              >
                Reload Session
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Session Stats - Only show for new sessions or if we have data */}
      {(!isExistingSession || wordCount > 0 || sessionDuration !== "00:00") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="font-medium mb-2">Session Duration</h3>
            <p className="text-2xl font-bold text-primary">{sessionDuration}</p>
            <p className="text-xs text-muted-foreground">Active recording time</p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">Word Count</h3>
            <p className="text-2xl font-bold text-primary">{wordCount}</p>
            <p className="text-xs text-muted-foreground">Words captured</p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">Key Themes</h3>
            {insights && insights.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-2">
                {insights.tags.slice(0, 3).map((tag, index) => (
                  <span 
                    key={index}
                    className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">
                {isExistingSession ? "No themes available" : "Save to generate themes"}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Generated Insights - Only show if we have insights */}
      {insights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-medium mb-2">Generated Title</h3>
            <p className="text-lg font-semibold text-primary">{insights.title}</p>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-medium mb-2">Summary</h3>
            <p className="text-sm text-muted-foreground">{insights.summary}</p>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SessionPage;