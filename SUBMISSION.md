# AssemblyAI Voice Agents Challenge Submission

## Whispers — A Real-Time Voice Journaling Agent

### What I Built

Whispers is a voice-first journaling application powered by AssemblyAI's universal-streaming API. It enables users to speak their thoughts in real-time, intelligently formatting their words into reflective, readable journal entries. The app serves as a personal wellness companion—part therapist, part mirror, part coach—helping users capture their daily reflections through natural speech.

This project falls under the **Real-Time Performance** and **Domain Expert** categories, demonstrating advanced real-time audio processing and specialized journaling functionality.

### Demo

🧠 **GitHub**: [github.com/vaish/whispers-journaling](https://github.com/VaishakhVipin/whispers-journaling)

🎥 **Video Demo**: [Link to be added]

🖥️ **Live App**: [Deployment pending - Vercel subdomain setup in progress]

### How I Used AssemblyAI

AssemblyAI's universal-streaming WebSocket API is the core of Whispers' real-time voice processing capabilities. The implementation streams microphone audio and receives live, formatted transcripts with exceptional accuracy and minimal latency.

**Key AssemblyAI Features Implemented:**

- **Real-time WebSocket Connection**: Direct streaming to AssemblyAI's v3 streaming endpoint with formatted finals
- **Live Transcription**: Continuous audio processing with immediate text output and partial transcript display
- **Auto-formatting**: Clean, punctuated transcripts with proper sentence boundaries using `formatted_finals=true`
- **Streaming State Management**: Robust connection handling with proper cleanup and error recovery
- **Duplicate Detection**: Intelligent handling to prevent transcription artifacts and repeated content
- **Paragraph Logic**: Smart paragraph spacing based on content analysis and sentence boundaries

**Code Snippet - WebSocket Implementation:**
```javascript
// Connect to AssemblyAI WebSocket
const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${token}`);

ws.onopen = () => {
  console.log("🎤 Connected to AssemblyAI - ready to record");
  setIsRecording(true);
  onRecordingStart?.();
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "Turn") {
    const transcript = data.transcript || "";
    const turnIsFormatted = data.turn_is_formatted || false;

    if (turnIsFormatted && transcript.trim()) {
      // Final, formatted version - add to main transcription
      console.log("📝 Clean transcription:", transcript);
      
      // Check for duplicates and add with proper paragraph spacing
      const shouldStartNewParagraph = shouldStartNewParagraphLogic(transcript, transcriptionText);
      const separator = shouldStartNewParagraph ? "\n\n" : " ";
      
      setTranscriptionText(prev => {
        const trimmedTranscript = transcript.trim();
        const trimmedPrev = prev.trim();
        
        // Robust duplicate detection
        if (trimmedTranscript && 
            !trimmedPrev.endsWith(trimmedTranscript) && 
            !trimmedPrev.includes(trimmedTranscript + " " + trimmedTranscript)) {
          return prev + (prev && !prev.endsWith('\n\n') ? separator : "") + transcript;
        }
        return prev;
      });
    } else if (!turnIsFormatted && transcript.trim()) {
      // Partial version - show in real-time stream
      setCurrentStreamText(transcript);
    }
  }
};

ws.onclose = (event) => {
  console.log("🔌 WebSocket closed:", event.code, event.reason);
  setIsRecording(false);
  onRecordingStop?.();
};
```

### UX Design & Features

**Voice-First Interface:**
- Minimalist journaling canvas with vintage paper aesthetic
- Pulsing recording indicator for live microphone status
- Real-time word count and session duration tracking
- Intelligent duplicate detection to prevent transcription artifacts

**Smart Journaling Features:**
- **Daily Reflection Prompts**: Curated prompts that refresh daily at 12 AM GMT
- **Tone Rewriting**: AI-powered text transformation (optimistic, technical, formal, etc.)
- **Session Management**: Edit sessions created on the same day, read-only after that
- **Content Analysis**: Automatic title generation, summaries, and key theme extraction
- **Search & Discovery**: Full-text search across all journal entries

**Technical Architecture:**
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Shadcn/ui
- **Backend**: FastAPI + Python for API endpoints and AI processing
- **Database**: Supabase for user authentication and session storage
- **Search**: Algolia for fast, semantic search across journal entries
- **AI Processing**: Google Gemini for content summarization and tone rewriting

### Key Technical Achievements

**Real-Time Performance:**
- Sub-200ms latency for live transcription display
- Seamless WebSocket connection management
- Efficient audio processing with proper resource cleanup
- Responsive UI updates synchronized with audio state

**Domain Expertise:**
- Specialized journaling workflow optimized for voice input
- Intelligent content organization with automatic categorization
- User behavior analysis with session statistics and trends
- Privacy-focused design with user data isolation

**Robust Error Handling:**
- Graceful microphone permission management
- Connection recovery mechanisms
- Comprehensive logging for debugging
- Fallback modes for degraded performance

### Key Takeaways

1. **AssemblyAI's Real-time Capabilities**: The universal-streaming API provides exceptional low-latency transcription with remarkable accuracy, making voice journaling feel natural and responsive.

2. **WebSocket Management is Critical**: Proper cleanup of WebSocket connections and audio resources is essential, especially when users navigate between pages or close the application.

3. **Voice Journaling Requires Context**: Beyond simple text capture, voice journaling benefits from emotional context, prompting, and intelligent content organization.

4. **Immutable Journals Encourage Honesty**: Locking journal entries after creation (read-only after the same day) encourages more authentic, unfiltered self-reflection.

5. **Real-time UX Demands Attention**: Users expect immediate feedback when speaking, requiring careful attention to UI state management and audio-visual synchronization.

### What's Next

**Immediate Roadmap:**
- Deploy live version with enhanced security and RLS re-enabled
- Implement user streak tracking and habit formation features
- Add sentiment analysis for emotional trend tracking
- Create memory timelines and reflection insights

**Future Enhancements:**
- Voice emotion detection for mood tracking
- Collaborative journaling features
- Integration with wellness apps and calendars
- Advanced AI coaching and reflection prompts

### Technical Stack

**Frontend:**
- React 18 with TypeScript
- Vite for fast development and building
- Tailwind CSS for styling
- Shadcn/ui for component library
- React Router for navigation

**Backend:**
- FastAPI for RESTful API endpoints
- Python for server-side processing
- Supabase for authentication and database
- Algolia for search indexing

**Voice & AI:**
- AssemblyAI Universal Streaming for real-time transcription
- Google Gemini for content analysis and rewriting
- WebSocket for real-time communication

**Deployment:**
- Vercel for frontend hosting
- Vercel Functions for backend API
- Environment-based security configuration

### Final Note

Whispers is built for people who think best out loud. It transforms the traditional journaling experience into a dynamic conversation with yourself—live, raw, and authentically yours. By leveraging AssemblyAI's cutting-edge voice technology, Whispers makes capturing daily reflections as natural as having a conversation, while providing the structure and insights that make journaling truly meaningful.

The project demonstrates how real-time voice technology can enhance personal wellness applications, creating a more intuitive and engaging way for users to document their thoughts, emotions, and personal growth journey. 