import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Square, Pause, Play, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getAssemblyToken, rewriteTone, getDailyPrompt } from "@/lib/api";

interface NotionLikeEditorProps {
  onTranscription?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  isReadOnly?: boolean;
  creationDate?: string; // ISO date string
  initialText?: string; // Initial text to load
  showPrompt?: boolean; // Whether to show the daily prompt
}

export function NotionLikeEditor({ 
  onTranscription, 
  onRecordingStart, 
  onRecordingStop, 
  isReadOnly = false,
  creationDate,
  initialText = "",
  showPrompt = false
}: NotionLikeEditorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState(initialText);
  const [currentStreamText, setCurrentStreamText] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [tonePreset, setTonePreset] = useState("conversational");
  const [intensity, setIntensity] = useState("moderate");
  const [emotionalOverlay, setEmotionalOverlay] = useState<string>("none");
  const [dailyPrompt, setDailyPrompt] = useState<string>("");
  const [promptDate, setPromptDate] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isCleaningUpRef = useRef(false);
  const { toast } = useToast();

  // Add state to track the last processed transcript to prevent duplicates
  const [lastProcessedTranscript, setLastProcessedTranscript] = useState("");

  // Check if the session is from today (editable) or older (read-only)
  const isFromToday = () => {
    if (!creationDate) return true; // If no creation date, assume it's new and editable
    const today = new Date().toISOString().split('T')[0];
    return creationDate === today;
  };

  const canEdit = !isReadOnly && isFromToday();

  // Initialize transcriptionText with initialText prop
  useEffect(() => {
    console.log("🎯 NotionLikeEditor: initialText prop received:", initialText ? `"${initialText.substring(0, 100)}..."` : "empty");
    console.log("🎯 NotionLikeEditor: current transcriptionText:", transcriptionText ? `"${transcriptionText.substring(0, 100)}..."` : "empty");
    
    // Always set the transcriptionText to match initialText, even if it's empty
    // This ensures proper reset when navigating to new sessions
    setTranscriptionText(initialText || "");
    
    if (initialText && initialText.trim()) {
      console.log("✅ NotionLikeEditor: Setting initial text:", `"${initialText.substring(0, 100)}..."`);
    } else {
      console.log("❌ NotionLikeEditor: No initial text to set (empty session)");
    }
  }, [initialText]);

  // Fetch daily prompt
  useEffect(() => {
    const fetchDailyPrompt = async () => {
      try {
        const response = await getDailyPrompt();
        setDailyPrompt(response.prompt);
        setPromptDate(response.date);
      } catch (error) {
        console.error("Error fetching daily prompt:", error);
        // Set a fallback prompt
        setDailyPrompt("What's on your mind today?");
      }
    };

    fetchDailyPrompt();
  }, []);

  // Function to determine if new text should start a new paragraph
  const shouldStartNewParagraphLogic = (newText: string, previousText: string): boolean => {
    // If previous text ends with a sentence-ending punctuation, start new paragraph
    const endsWithSentenceEnd = /[.!?]\s*$/.test(previousText.trim());
    
    // If new text starts with common paragraph starters, start new paragraph
    const startsWithParagraphStarter = /^(So|But|However|Therefore|In addition|Also|Moreover|Furthermore|Additionally|Meanwhile|Later|Then|Now|Well|Okay|Right|So then|And then|But then|Then again|On the other hand|For example|For instance|In fact|Actually|Basically|Essentially|In summary|To summarize|In conclusion|To conclude)/i.test(newText.trim());
    
    // If there's a significant pause (indicated by longer text or specific patterns)
    const hasSignificantPause = newText.length > 50 && endsWithSentenceEnd;
    
    // If new text is a question and previous wasn't, might be new paragraph
    const isQuestion = /\?$/.test(newText.trim());
    const previousWasQuestion = /\?$/.test(previousText.trim());
    const questionTransition = isQuestion && !previousWasQuestion && endsWithSentenceEnd;
    
    return endsWithSentenceEnd && (startsWithParagraphStarter || hasSignificantPause || questionTransition);
  };

  // Handle tone rewriting
  const handleToneRewrite = async () => {
    if (!transcriptionText.trim()) {
      toast({
        title: "No content to rewrite",
        description: "Please add some text before rewriting the tone",
        variant: "destructive",
      });
      return;
    }

    setIsRewriting(true);
    try {
      const result = await rewriteTone(
        transcriptionText, 
        tonePreset, 
        intensity, 
        emotionalOverlay === "none" ? undefined : emotionalOverlay
      );
      
      // Update state smoothly to prevent flicker
      setTranscriptionText(result.rewritten_text);
      
      toast({
        title: "Tone rewritten",
        description: `Text rewritten with ${tonePreset} tone`,
      });
    } catch (error) {
      console.error("Error rewriting tone:", error);
      toast({
        title: "Error",
        description: "Failed to rewrite tone",
        variant: "destructive",
      });
    } finally {
      setIsRewriting(false);
    }
  };

  // Auto-resize textarea as content grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [transcriptionText]); // Remove currentStreamText dependency to prevent flicker

  // Debounced resize to prevent flicker during tone rewriting
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, 100); // 100ms debounce

    return () => clearTimeout(timeoutId);
  }, [transcriptionText]);

  // Cleanup on unmount and page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        stopRecording();
        // Force stop all tracks immediately
        if (streamRef.current) {
          const tracks = streamRef.current.getTracks();
          tracks.forEach(track => {
            track.stop();
            console.log("🔇 Stopped track (visibility):", track.kind);
          });
          streamRef.current = null;
        }
        // Also force close audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
            audioContextRef.current = null;
          } catch (error) {
            console.error("Error closing audio context (visibility):", error);
          }
        }
      }
    };

    const handleBeforeUnload = () => {
      if (isRecording) {
        stopRecording();
        // Force stop all tracks immediately
        if (streamRef.current) {
          const tracks = streamRef.current.getTracks();
          tracks.forEach(track => {
            track.stop();
            console.log("🔇 Stopped track (unload):", track.kind);
          });
          streamRef.current = null;
        }
        // Also force close audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
            audioContextRef.current = null;
          } catch (error) {
            console.error("Error closing audio context (unload):", error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Always cleanup microphone permissions on unmount, regardless of recording state
      isCleaningUpRef.current = true;
      
      // Close WebSocket
      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        try {
          websocketRef.current.send(JSON.stringify({ type: "EndOfStream" }));
          websocketRef.current.close();
        } catch (error) {
          console.error("Error closing WebSocket on unmount:", error);
        }
        websocketRef.current = null;
      }
      
      // Disconnect processor
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (error) {
          console.error("Error disconnecting processor on unmount:", error);
        }
        processorRef.current = null;
      }
      
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (error) {
          console.error("Error closing audio context on unmount:", error);
        }
        audioContextRef.current = null;
      }
      
      // Stop all tracks and release microphone permissions
      if (streamRef.current) {
        try {
          const tracks = streamRef.current.getTracks();
          tracks.forEach(track => {
            track.stop();
            console.log("🔇 Stopped track (unmount):", track.kind);
          });
          streamRef.current = null;
        } catch (error) {
          console.error("Error stopping tracks on unmount:", error);
        }
      }
    };
  }, []); // Remove isRecording dependency to prevent unnecessary re-renders

  const startRecording = async () => {
    if (!canEdit) {
      toast({
        title: "Cannot edit",
        description: "This session can only be edited on the day it was created",
        variant: "destructive",
      });
      return;
    }

    // Reset cleanup flag to allow new recording
    isCleaningUpRef.current = false;
    
    setIsConnecting(true);
    setDebugInfo("Starting recording process...");

    try {
      // Reset transcription state for new session
      setLastProcessedTranscript("");
      setCurrentStreamText("");
      
      // Get AssemblyAI token
      const tokenResponse = await getAssemblyToken();
      const token = tokenResponse.token;

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // Connect to AssemblyAI WebSocket
      const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${token}`);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log("🎤 Connected to AssemblyAI - ready to record");
        setDebugInfo("Connected to AssemblyAI");
        setIsConnecting(false);
        setIsRecording(true);
        onRecordingStart?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "Turn") {
            const transcript = data.transcript || "";
            const turnIsFormatted = data.turn_is_formatted || false;
            const endOfTurn = data.end_of_turn || false;

            if (turnIsFormatted && transcript.trim()) {
              // This is the final, formatted version - replace current stream text
              console.log("📝 Clean transcription:", transcript);
              
              // Clear the current stream text since we now have the final version
              setCurrentStreamText("");
              
              // Check if this transcript is different from the last processed one
              if (transcript.trim() !== lastProcessedTranscript.trim()) {
                // Check if we should start a new paragraph
                const shouldStartNewParagraph = shouldStartNewParagraphLogic(transcript, transcriptionText);
                const separator = shouldStartNewParagraph ? "\n\n" : " ";
                
                setTranscriptionText(prev => {
                  // Prevent duplicate additions by checking if the transcript is already at the end
                  const trimmedTranscript = transcript.trim();
                  const trimmedPrev = prev.trim();
                  
                  // More robust duplicate detection
                  if (trimmedTranscript && 
                      !trimmedPrev.endsWith(trimmedTranscript) && 
                      !trimmedPrev.includes(trimmedTranscript + " " + trimmedTranscript)) {
                    const newText = prev + (prev && !prev.endsWith('\n\n') ? separator : "") + transcript;
                    return newText;
                  }
                  return prev;
                });
                
                // Update the last processed transcript
                setLastProcessedTranscript(transcript.trim());
              }
            } else if (!turnIsFormatted && transcript.trim()) {
              // This is a partial, unformatted version - show in current stream only
              // Don't add to the main transcription text yet
              setCurrentStreamText(transcript);
            }
          } else if (data.type === "Begin") {
            console.log("🎤 Recording session started");
          } else if (data.type === "Error") {
            console.error("❌ AssemblyAI error:", data.error);
            setDebugInfo(`AssemblyAI error: ${data.error}`);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error, event.data);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setDebugInfo("WebSocket error");
        setIsConnecting(false);
        setIsRecording(false);
        toast({
          title: "Connection Error",
          description: "Failed to connect to transcription service",
          variant: "destructive",
        });
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setDebugInfo(`WebSocket closed: ${event.code}`);
        setIsConnecting(false);
        setIsRecording(false);
        onRecordingStop?.();
      };

      // Start audio processing
      await startAudioProcessing(stream, ws);

    } catch (error) {
      console.error("❌ Error starting recording:", error);
      setDebugInfo("Error starting recording");
      setIsConnecting(false);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const startAudioProcessing = async (stream: MediaStream, ws: WebSocket) => {
    try {
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;

      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create audio source from stream
      const source = audioContext.createMediaStreamSource(stream);

      // Create gain node to boost microphone input
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 3.0; // Boost microphone input more

      // Create script processor for audio processing
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect audio nodes: source -> gain -> processor -> destination
      source.connect(gainNode);
      gainNode.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        // Check cleanup flag FIRST before any processing
        if (isCleaningUpRef.current) {
          return;
        }
        
        if (ws.readyState === WebSocket.OPEN && !isCleaningUpRef.current) {
          const inputData = event.inputBuffer.getChannelData(0);
          
          // Check if there's actual audio data (not just silence)
          let hasAudio = false;
          for (let i = 0; i < inputData.length; i++) {
            if (Math.abs(inputData[i]) > 0.01) {
              hasAudio = true;
              break;
            }
          }
          
          if (hasAudio && !isCleaningUpRef.current) {
            // Convert float32 to int16
            const int16Array = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            
            // Double-check cleanup flag before sending
            if (!isCleaningUpRef.current) {
              // Send audio data to AssemblyAI
              ws.send(int16Array.buffer);
            }
          }
        }
      };

    } catch (error) {
      console.error("Error in audio processing:", error);
      setDebugInfo("Audio processing error");
    }
  };

  const stopRecording = () => {
    console.log("🛑 Stopping recording...");
    
    // Set cleanup flag FIRST to stop audio processing immediately
    isCleaningUpRef.current = true;
    
    // Stop recording state immediately
    setIsRecording(false);
    setIsConnecting(false);
    setCurrentStreamText("");
    
    // Disconnect processor IMMEDIATELY to stop audio processing
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current = null;
      } catch (error) {
        console.error("Error disconnecting processor:", error);
      }
    }
    
    // Stop all tracks IMMEDIATELY to release microphone permissions
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
          track.stop();
          console.log("🔇 Stopped track:", track.kind);
        });
        // Explicitly close the stream
        streamRef.current = null;
      } catch (error) {
        console.error("Error stopping tracks:", error);
      }
    }
    
    // Close WebSocket
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify({ type: "EndOfStream" }));
        websocketRef.current.close();
        websocketRef.current = null;
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (error) {
        console.error("Error closing audio context:", error);
      }
    }
    
    onRecordingStop?.();
    
    // Reset cleanup flag after a delay
    setTimeout(() => {
      isCleaningUpRef.current = false;
    }, 1000);
  };

  const handleRecordingToggle = () => {
    if (isRecording || isConnecting) {
      // Set cleanup flag immediately to stop audio processing
      isCleaningUpRef.current = true;
      stopRecording();
    } else {
      startRecording();
    }
  };

  const displayText = transcriptionText; // Only show final transcription, not partial stream text

  // Call onTranscription callback whenever the full text changes
  useEffect(() => {
    if (onTranscription && displayText) {
      onTranscription(displayText);
    }
  }, [displayText]); // Remove onTranscription dependency to prevent re-renders

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">

      
      {/* Header with recording controls and tone rewrite */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center space-x-3">
          <div>
            <h2 className="font-serif text-xl font-semibold">Daily Reflection</h2>
            {dailyPrompt && showPrompt && canEdit && (
              <p className="text-sm text-muted-foreground mt-1">
                {dailyPrompt}
              </p>
            )}
          </div>
          {!canEdit && (
            <div className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
              Read-only (created on {creationDate})
            </div>
          )}
          {isConnecting && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
              <span>Connecting...</span>
            </div>
          )}
          {isRecording && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
              <span>Recording</span>
              {currentStreamText && (
                <div className="flex items-center space-x-1">
                  <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                  <span className="text-xs">Transcribing...</span>
                </div>
              )}
            </div>
          )}
          {isProcessing && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
              <span>Processing</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Rewrite Button - Clean placement */}
          {canEdit && transcriptionText.trim() && (
            <Button
              onClick={handleToneRewrite}
              disabled={isRewriting || !transcriptionText.trim()}
              variant="outline"
              size="sm"
              className="flex items-center space-x-2"
            >
              {isRewriting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>Rewrite</span>
            </Button>
          )}
          
          {/* Recording Button */}
          {canEdit && (
            <Button
              onClick={handleRecordingToggle}
              disabled={isConnecting || isProcessing}
              variant="ghost"
              size="sm"
              className={cn(
                "transition-all duration-200",
                (isRecording || isConnecting) && "text-destructive hover:text-destructive/80"
              )}
            >
              {(isRecording || isConnecting) ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              <span className="ml-2 text-sm">
                {(isRecording || isConnecting) ? "Stop" : "Record"}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Tone Controls - Only show when text is available */}
      {canEdit && transcriptionText.trim() && (
        <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg">
          <span className="text-sm font-medium">Tone:</span>
          <Select value={tonePreset} onValueChange={setTonePreset}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
              <SelectItem value="inspirational">Inspirational</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={intensity} onValueChange={setIntensity}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subtle">Subtle</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="strong">Strong</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={emotionalOverlay} onValueChange={setEmotionalOverlay}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Mood" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="optimistic">Optimistic</SelectItem>
              <SelectItem value="cautious">Cautious</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="calm">Calm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Main text canvas */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={displayText}
          onChange={(e) => canEdit && setTranscriptionText(e.target.value)}
          placeholder={canEdit ? 
            (showPrompt && dailyPrompt ? `Today's prompt: ${dailyPrompt}` : "Start recording to capture your thoughts, or begin typing...") : 
            "This session is read-only"
          }
          className={cn(
            "min-h-[400px] text-base leading-relaxed resize-none border-0 focus-visible:ring-0 p-6",
            "bg-transparent font-serif",
            currentStreamText && "animate-pulse",
            !canEdit && "cursor-not-allowed opacity-90"
          )}
          style={{ 
            fontSize: '16px',
            lineHeight: '1.6',
            fontFamily: 'var(--font-serif)'
          }}
          readOnly={!canEdit}
        />
        
        {/* Subtle recording indicator overlay */}
        {isRecording && (
          <div className="absolute top-4 right-4">
            <div className="w-3 h-3 bg-destructive rounded-full animate-pulse opacity-60" />
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-4">
        <div className="flex items-center space-x-4">
          <span>
            {displayText.split(' ').filter(word => word.length > 0).length} words
          </span>
          <span>
            {displayText.length} characters
          </span>
          {isRecording && (
            <span className="text-destructive">
              Live transcription active
            </span>
          )}
          {!canEdit && (
            <span className="text-muted-foreground">
              Read-only mode
            </span>
          )}
        </div>
        
        {!isRecording && !isProcessing && displayText && (
          <div className="text-xs opacity-60">
            {canEdit ? "Auto-saved" : "Saved"}
          </div>
        )}
      </div>


    </div>
  );
}