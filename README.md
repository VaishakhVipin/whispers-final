# whispers-final
Talk. Recall. Repeat. A blazing-fast voice journal that remembers everything you say; searchable with AI.

🗣️ Whispers
Talk. Recall. Repeat.
A blazing-fast voice journal that remembers everything you say — searchable with AI.

✨ What is Whispers?
Whispers is a voice-first journaling app powered by:

🧠 <300ms Latency Streaming Transcription (AssemblyAI)

💬 Gemini (Free Plan) for semantic summaries & tagging

🔍 Algolia MCP for instant search of your thoughts

You talk. It listens, transcribes, understands, and makes it all searchable later.

🧪 Why It Matters
Most thoughts disappear as fast as they're spoken. Whispers is a second brain you can speak into — and search like Google.

This isn't a note-taking app.
It's a verbal memory system.

Use-cases:

Founders brain-dumping startup ideas

Students journaling reflections

Creators capturing sparks of content

Anyone needing private, searchable voice logs

🧩 Core Stack
Layer	Tool	Role
Transcription	AssemblyAI Universal Streaming	Sub-300ms real-time speech-to-text
Enrichment	Gemini Free API	Summarization + emotion extraction
Search	Algolia MCP Server	AI-powered contextual search
Backend	FastAPI	WebSocket relay, data orchestration
Frontend	Minimal HTML/JS	Mic recording, display, search UI

🧠 Features
🎙️ Real-time voice recording + transcription (AssemblyAI)

🪄 Auto-generated summaries using Gemini

🏷️ Tags: Emotion, topics, key phrases

📥 Stored in Algolia MCP with enriched metadata

🔎 Search with natural queries like:

“When did I talk about feeling burnt out?”
“What were my app ideas last month?”

🚀 How It Works
mermaid
Copy
Edit
sequenceDiagram
    participant User
    participant Browser
    participant FastAPI Server
    participant AssemblyAI
    participant Gemini
    participant Algolia MCP

    User->>Browser: Speak
    Browser->>FastAPI: Stream audio via WebSocket
    FastAPI->>AssemblyAI: Transcribe audio
    AssemblyAI-->>FastAPI: Real-time text
    FastAPI->>Gemini: Send transcript
    Gemini-->>FastAPI: Summary + tags
    FastAPI->>Algolia MCP: Index enriched doc
    User->>Browser: Type query
    Browser->>FastAPI: Search
    FastAPI->>Algolia MCP: Semantic query
    Algolia MCP-->>FastAPI: Matching logs
    FastAPI-->>Browser: Display results
⚙️ Setup Instructions
1. Clone Repo
bash
Copy
Edit
git clone https://github.com/VaishakhVipin/whispers-journal.git
cd whispers
2. Create .env
env
Copy
Edit
ASSEMBLYAI_API_KEY=your_assemblyai_key
GEMINI_API_KEY=your_gemini_free_plan_key
ALGOLIA_APP_ID=your_algolia_app_id
ALGOLIA_API_KEY=your_algolia_api_key
ALGOLIA_INDEX_NAME=whispers_logs
SERVER_URL=wss://your-ngrok-or-host-url
3. Install Dependencies
bash
Copy
Edit
pip install -r requirements.txt
4. Run Locally
bash
Copy
Edit
uvicorn main:app --reload
Frontend will auto-connect to /twilio/stream WebSocket via JS.

5. Set Up Algolia MCP
Clone their MCP Node server:

bash
Copy
Edit
git clone https://github.com/algolia/mcp-node.git
cd mcp-node
npm install
Run it:

bash
Copy
Edit
npm start
Set your .env to point to this MCP server instance.

⚠️ NOTE: MCP is experimental. Be prepared to handle quirks.
