import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onTranscription?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

export function VoiceRecorder({ onTranscription, onRecordingStart, onRecordingStop }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const audioChunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        setIsProcessing(true);
        
        // Simulate transcription (replace with actual API call)
        setTimeout(() => {
          const mockTranscription = "This is a sample transcription of your voice recording. In a real implementation, this would connect to your backend API for real-time transcription using AssemblyAI.";
          setTranscription(mockTranscription);
          onTranscription?.(mockTranscription);
          setIsProcessing(false);
          
          toast({
            title: "Recording processed",
            description: "Your voice has been transcribed successfully.",
          });
        }, 2000);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscription("");
      onRecordingStart?.();
      
      toast({
        title: "Recording started",
        description: "Speak naturally - your voice is being captured.",
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: "destructive",
        title: "Microphone access denied",
        description: "Please allow microphone access to record your voice.",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      onRecordingStop?.();
    }
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Recording Button */}
      <div className="relative">
        <Button
          onClick={handleRecordingToggle}
          disabled={isProcessing}
          size="lg"
          className={cn(
            "w-24 h-24 rounded-full transition-all duration-300",
            "hover:scale-105 active:scale-95",
            isRecording 
              ? "bg-destructive hover:bg-destructive/90 recording-pulse" 
              : "bg-primary hover:bg-primary/90",
            isProcessing && "opacity-50 cursor-not-allowed"
          )}
        >
          {isProcessing ? (
            <div className="w-6 h-6 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : isRecording ? (
            <Square className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </Button>
        
        {isRecording && (
          <div className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-75" />
        )}
      </div>

      {/* Recording Status */}
      <div className="text-center">
        <p className="text-sm font-medium">
          {isProcessing 
            ? "Processing your recording..." 
            : isRecording 
              ? "Recording... Tap to stop" 
              : "Tap to start recording"
          }
        </p>
        {isRecording && (
          <p className="text-xs text-muted-foreground mt-1">
            Real-time transcription active
          </p>
        )}
      </div>

      {/* Transcription Display */}
      {transcription && (
        <Card className="w-full max-w-2xl p-6 shadow-elegant">
          <h3 className="font-serif text-lg font-semibold mb-3">Live Transcription</h3>
          <p className="text-sm leading-relaxed transcription-appear">
            {transcription}
          </p>
        </Card>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center space-x-2 text-destructive">
          <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
          <span className="text-xs font-medium">LIVE</span>
        </div>
      )}
    </div>
  );
}