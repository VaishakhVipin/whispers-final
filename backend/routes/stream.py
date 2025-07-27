from fastapi import APIRouter, Request, HTTPException
from services.gemini import summarize, mcp_search
from services.assembly import get_assemblyai_token_universal_streaming
from services.supabase import insert_session, supabase
import uuid
from datetime import datetime, timezone
import os
from algoliasearch.search.client import SearchClientSync
import hashlib

router = APIRouter()

# Daily prompts that refresh at 12 AM GMT
DAILY_PROMPTS = [
    "What's the most important lesson you learned today?",
    "Describe a moment today that made you feel grateful.",
    "What challenge did you face today, and how did you handle it?",
    "What's something you're looking forward to tomorrow?",
    "Reflect on a conversation that impacted you today.",
    "What's one thing you'd like to improve about yourself?",
    "Describe a small victory you had today.",
    "What's something that's been on your mind lately?",
    "How are you feeling right now, and why?",
    "What's a goal you're working towards?",
    "Reflect on a decision you made today.",
    "What's something that made you smile today?",
    "What's a fear or worry you'd like to let go of?",
    "Describe a person who influenced you today.",
    "What's something you're curious about?",
    "How did you take care of yourself today?",
    "What's a memory from today you want to remember?",
    "What's something you're proud of accomplishing?",
    "Reflect on a change you've noticed in yourself.",
    "What's something you're grateful for in your life right now?",
    "What's a question you've been pondering?",
    "Describe a moment of peace or calm you experienced.",
    "What's something you'd like to tell your future self?",
    "How did you show kindness to someone today?",
    "What's a dream or aspiration you have?",
    "Reflect on a mistake you made and what you learned.",
    "What's something that's been challenging you lately?",
    "How do you want to grow as a person?",
    "What's a simple pleasure you enjoyed today?"
]

def get_daily_prompt():
    """Get the daily prompt based on the current date (12 AM GMT refresh)"""
    # Get current date in GMT
    gmt_now = datetime.now(timezone.utc)
    gmt_date = gmt_now.strftime("%Y-%m-%d")
    
    # Use date as seed for consistent prompt selection
    date_hash = hashlib.md5(gmt_date.encode()).hexdigest()
    prompt_index = int(date_hash, 16) % len(DAILY_PROMPTS)
    
    return DAILY_PROMPTS[prompt_index]

@router.get("/daily-prompt")
async def get_todays_prompt():
    """Get today's reflection prompt (same for all users, refreshes at 12 AM GMT)"""
    try:
        prompt = get_daily_prompt()
        return {
            "prompt": prompt,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
        }
    except Exception as e:
        print(f"Error getting daily prompt: {e}")
        raise HTTPException(status_code=500, detail="Failed to get daily prompt")

# Algolia setup (single index for all users)
ALGOLIA_APP_ID = os.environ.get("ALGOLIA_APP_ID")
ALGOLIA_API_KEY = os.environ.get("ALGOLIA_API_KEY")
ALGOLIA_SEARCH_KEY = os.environ.get("ALGOLIA_SEARCH_KEY")
ALGOLIA_INDEX_NAME = os.environ.get("ALGOLIA_INDEX_NAME", "journal_entries")

algolia_client = SearchClientSync(ALGOLIA_APP_ID, ALGOLIA_API_KEY)

def get_user_from_token(request: Request):
    """Extract user from Authorization token"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No valid session")
    
    token = auth_header.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid session")
        return user_response.user
    except Exception as e:
        print(f"Error getting user from token: {e}")
        raise HTTPException(status_code=401, detail="Invalid session")

@router.post("/start_session")
async def start_session(request: Request):
    """Create a new journaling session for the authenticated user"""
    try:
        user = get_user_from_token(request)
        print(f"Creating session for user: {user.id}")
        
        # Get request data to check if session is from prompt
        data = await request.json() if request.method == "POST" else {}
        is_from_prompt = data.get("is_from_prompt", False)
        
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        date = now.strftime("%Y-%m-%d")
        created_at = now.isoformat()
        
        # Insert session with user_id and prompt flag
        try:
            session_data = {
                "session_id": session_id, 
                "user_id": user.id,
                "date": date, 
                "created_at": created_at,
                "is_from_prompt": is_from_prompt
            }
            print(f"Inserting session data: {session_data}")
            result = supabase.table("sessions").insert(session_data).execute()
            print(f"Session inserted successfully: {result}")
            print(f"Inserted session data: {result.data}")
            
            # Verify the session was actually inserted
            if result.data:
                print(f"✅ Session successfully inserted with data: {result.data}")
            else:
                print(f"❌ Session insert returned no data: {result}")
                # Try to check if session exists anyway
                try:
                    check_result = supabase.table("sessions").select("*").eq("session_id", session_id).execute()
                    print(f"Session check result: {check_result}")
                except Exception as check_error:
                    print(f"Error checking session: {check_error}")
                
        except Exception as e:
            print(f"❌ Error inserting session: {e}")
            # Don't continue - this is critical for the app to work
            raise HTTPException(status_code=500, detail=f"Failed to create session in database: {str(e)}")
        
        response_data = {
            "session_id": session_id, 
            "user_id": user.id,
            "date": date, 
            "created_at": created_at,
            "is_from_prompt": is_from_prompt
        }
        print(f"Returning session data: {response_data}")
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting session: {e}")
        raise HTTPException(status_code=500, detail="Failed to start session")

@router.post("/index")
async def index_entry(request: Request):
    """Index a journal entry for the authenticated user"""
    try:
        user = get_user_from_token(request)
        print(f"Indexing entry for user: {user.id}")
        
        data = await request.json()
        print(f"Received entry data: {data}")
        
        # Remove user_id from required fields since we get it from token
        required_fields = ["session_id", "date", "timestamp", "title", "summary", "tags", "text"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            print(f"Missing required fields: {missing}")
            return {"error": f"Missing required fields: {', '.join(missing)}"}
        
        # Prepare entry for Algolia with user_id from token
        entry = {
            "user_id": user.id,
            "session_id": data["session_id"],
            "date": data["date"],
            "timestamp": data["timestamp"],
            "title": data["title"],
            "summary": data["summary"],
            "tags": data["tags"],
            "text": data["text"],
            "audio_url": data.get("audio_url", "")
        }
        print(f"📦 Prepared entry for indexing: {entry}")
        print(f"📝 Text length being indexed: {len(data['text'])}")
        print(f"📝 Text preview: {data['text'][:100]}...")
        
        # Check if entry already exists for this session_id
        try:
            print(f"🔍 Checking if entry exists for session_id: {data['session_id']}")
            import requests
            
            # Search for existing entry with same session_id and user_id
            search_request = {
                "indexName": ALGOLIA_INDEX_NAME,
                "query": "",
                "filters": f"session_id:{data['session_id']} AND user_id:{user.id}",
                "hitsPerPage": 1
            }
            
            headers = {
                "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
                "X-Algolia-Application-Id": ALGOLIA_APP_ID,
                "Content-Type": "application/json"
            }
            
            search_response = requests.post(
                f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                headers=headers,
                json={"requests": [search_request]},
                timeout=10
            )
            
            if search_response.status_code == 200:
                search_data = search_response.json()
                print(f"🔍 Search response: {search_data}")
                hits = search_data.get("results", [{}])[0].get("hits", [])
                print(f"🔍 Found {len(hits)} hits for session_id: {data['session_id']}")
                
                if hits:
                    # Entry exists, update it
                    existing_entry = hits[0]
                    entry_id = existing_entry.get("objectID")
                    entry["objectID"] = entry_id
                    entry["entry_id"] = entry_id
                    
                    print(f"🔄 Updating existing entry with ID: {entry_id}")
                    print(f"🔄 Existing entry title: {existing_entry.get('title')}")
                    res = algolia_client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
                    algolia_client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=res.task_id)
                    print(f"✅ Entry updated successfully in Algolia: {res.to_dict()}")
                    return {"result": "updated", "entry_id": entry_id, "algolia": res.to_dict()}
                else:
                    # Try fallback search without filters to see if entry exists
                    print(f"🔍 Trying fallback search for session_id: {data['session_id']}")
                    fallback_request = {
                        "indexName": ALGOLIA_INDEX_NAME,
                        "query": "",
                        "hitsPerPage": 1000
                    }
                    
                    fallback_response = requests.post(
                        f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                        headers=headers,
                        json={"requests": [fallback_request]},
                        timeout=10
                    )
                    
                    if fallback_response.status_code == 200:
                        fallback_data = fallback_response.json()
                        fallback_hits = fallback_data.get("results", [{}])[0].get("hits", [])
                        
                        # Find entry with matching session_id
                        matching_entry = None
                        for hit in fallback_hits:
                            if hit.get("session_id") == data["session_id"] and hit.get("user_id") == user.id:
                                matching_entry = hit
                                break
                        
                        if matching_entry:
                            # Entry exists, update it
                            entry_id = matching_entry.get("objectID")
                            entry["objectID"] = entry_id
                            entry["entry_id"] = entry_id
                            
                            print(f"🔄 Updating existing entry (fallback) with ID: {entry_id}")
                            print(f"🔄 Existing entry title: {matching_entry.get('title')}")
                            res = algolia_client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
                            algolia_client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=res.task_id)
                            print(f"✅ Entry updated successfully in Algolia: {res.to_dict()}")
                            return {"result": "updated", "entry_id": entry_id, "algolia": res.to_dict()}
                        else:
                            # Entry doesn't exist, create new one
                            entry_id = str(uuid.uuid4())
                            entry["entry_id"] = entry_id
                            entry["objectID"] = entry_id
                            
                            print(f"🆕 Creating new entry with ID: {entry_id}")
                            print(f"🆕 No existing entry found for session_id: {data['session_id']}")
                            res = algolia_client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
                            algolia_client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=res.task_id)
                            print(f"✅ Entry created successfully in Algolia: {res.to_dict()}")
                            return {"result": "created", "entry_id": entry_id, "algolia": res.to_dict()}
                    else:
                        # Fallback search failed, create new entry
                        entry_id = str(uuid.uuid4())
                        entry["entry_id"] = entry_id
                        entry["objectID"] = entry_id
                        
                        print(f"🆕 Creating new entry (fallback failed) with ID: {entry_id}")
                        res = algolia_client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
                        algolia_client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=res.task_id)
                        print(f"✅ Entry created successfully in Algolia: {res.to_dict()}")
                        return {"result": "created", "entry_id": entry_id, "algolia": res.to_dict()}
            else:
                print(f"❌ Search failed with status {search_response.status_code}")
                # Fallback: create new entry
                entry_id = str(uuid.uuid4())
                entry["entry_id"] = entry_id
                entry["objectID"] = entry_id
                
                print(f"🆕 Creating new entry (fallback) with ID: {entry_id}")
                res = algolia_client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
                algolia_client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=res.task_id)
                print(f"✅ Entry created successfully in Algolia: {res.to_dict()}")
                return {"result": "created", "entry_id": entry_id, "algolia": res.to_dict()}
                
        except Exception as e:
            print(f"❌ Error checking/updating entry in Algolia: {e}")
            return {"error": str(e)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error indexing entry: {e}")
        raise HTTPException(status_code=500, detail="Failed to index entry")

@router.post("/search")
async def search(request: Request):
    """Search journal entries for the authenticated user"""
    try:
        user = get_user_from_token(request)
        data = await request.json()
        query = data.get("query", "")
        
        if not query:
            return {"error": "Missing required field: query"}
        
        try:
            # Use Gemini + MCP logic with user_id from token
            result = mcp_search(query, user_id=user.id)
            return result
        except Exception as e:
            return {"error": str(e)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error searching entries: {e}")
        raise HTTPException(status_code=500, detail="Failed to search entries")

@router.post("/summarize")
async def summarize_text(request: Request):
    """Summarize text and generate title, summary, and tags"""
    try:
        user = get_user_from_token(request)
        data = await request.json()
        text = data.get("text", "")
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        title, summary, tags = summarize(text)
        return {
            "title": title,
            "summary": summary,
            "tags": tags
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error summarizing text: {e}")
        raise HTTPException(status_code=500, detail="Failed to summarize text")

@router.post("/rewrite-tone")
async def rewrite_tone(request: Request):
    """Rewrite text with a specific tone using the tone rewriting guide"""
    try:
        user = get_user_from_token(request)
        data = await request.json()
        
        text = data.get("text", "")
        tone_preset = data.get("tone_preset", "conversational")  # professional, conversational, inspirational, technical, creative
        intensity = data.get("intensity", "moderate")  # subtle, moderate, strong, complete
        emotional_overlay = data.get("emotional_overlay", None)  # optimistic, cautious, urgent, calm
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        # Create the prompt based on the tone rewriting guide
        tone_instructions = {
            "professional": {
                "style": "Academic, Business, Legal",
                "tone": "Authoritative, Precise, Objective",
                "voice": "Third-person, Passive constructions",
                "vocabulary": "Technical, Industry-specific",
                "sentence_structure": "Complex, Compound",
                "punctuation": "Conservative, Traditional"
            },
            "conversational": {
                "style": "Personal, Social, Informal",
                "tone": "Warm, Approachable, Relatable",
                "voice": "First/second-person, Active voice",
                "vocabulary": "Everyday, Accessible",
                "sentence_structure": "Simple, Direct",
                "punctuation": "Liberal, Expressive"
            },
            "inspirational": {
                "style": "Self-help, Leadership, Coaching",
                "tone": "Encouraging, Empowering, Hopeful",
                "voice": "Second-person, Direct address",
                "vocabulary": "Aspirational, Action-oriented",
                "sentence_structure": "Varied, Rhythmic",
                "punctuation": "Dynamic, Emphatic"
            },
            "technical": {
                "style": "Scientific, Research, Documentation",
                "tone": "Objective, Systematic, Detailed",
                "voice": "Third-person, Impersonal",
                "vocabulary": "Precise, Specialized",
                "sentence_structure": "Structured, Logical",
                "punctuation": "Standard, Clear"
            },
            "creative": {
                "style": "Literary, Marketing, Artistic",
                "tone": "Imaginative, Vivid, Engaging",
                "voice": "Varied, Experimental",
                "vocabulary": "Rich, Descriptive, Metaphorical",
                "sentence_structure": "Artistic, Varied",
                "punctuation": "Creative, Expressive"
            }
        }
        
        intensity_levels = {
            "subtle": "Gentle adjustments, preserve 90% original",
            "moderate": "Balanced changes, preserve 70% original",
            "strong": "Significant transformation, preserve 50% original",
            "complete": "Full rewrite, preserve core message only"
        }
        
        emotional_overlays = {
            "optimistic": "Add hope, possibility, positive outcomes",
            "cautious": "Add warnings, considerations, careful language",
            "urgent": "Add immediacy, deadlines, action words",
            "calm": "Add reassurance, patience, measured tone"
        }
        
        selected_tone = tone_instructions.get(tone_preset, tone_instructions["conversational"])
        intensity_desc = intensity_levels.get(intensity, intensity_levels["moderate"])
        overlay_desc = emotional_overlays.get(emotional_overlay, "") if emotional_overlay else ""
        
        # Create the rewriting prompt
        prompt = f"""
        Rewrite the following text using these specifications:
        
        TONE PRESET: {tone_preset.upper()}
        - Style: {selected_tone['style']}
        - Tone: {selected_tone['tone']}
        - Voice: {selected_tone['voice']}
        - Vocabulary: {selected_tone['vocabulary']}
        - Sentence Structure: {selected_tone['sentence_structure']}
        - Punctuation: {selected_tone['punctuation']}
        
        INTENSITY: {intensity.upper()}
        - {intensity_desc}
        
        {f"EMOTIONAL OVERLAY: {emotional_overlay.upper()}\n- {overlay_desc}" if emotional_overlay else ""}
        
        ORIGINAL TEXT:
        {text}
        
        Please rewrite the text according to these specifications while maintaining the core message and meaning. Return only the rewritten text without any explanations or additional formatting.
        """
        
        # Use the existing summarize function (which uses Gemini) to rewrite the text
        title, summary, tags = summarize(prompt)
        
        # Return the rewritten text
        return {
            "original_text": text,
            "rewritten_text": summary,  # Use summary field for the rewritten text
            "tone_preset": tone_preset,
            "intensity": intensity,
            "emotional_overlay": emotional_overlay
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rewriting tone: {e}")
        raise HTTPException(status_code=500, detail="Failed to rewrite text")

@router.get("/token")
async def get_token(request: Request):
    """Get AssemblyAI token - also serves as auth test"""
    try:
        # Try to get user from token to test auth
        user = get_user_from_token(request)
        print(f"User authenticated: {user.id}")
    except Exception as e:
        print(f"Auth error in /token: {e}")
        # Still return token even if auth fails for now
    
    token = get_assemblyai_token_universal_streaming()
    return {"token": token} 

@router.get("/sessions")
async def get_user_sessions(request: Request):
    """Get all sessions for the authenticated user"""
    try:
        user = get_user_from_token(request)
        print(f"Fetching sessions for user: {user.id}")
        
        try:
            # Get sessions for the user, ordered by created_at descending
            result = supabase.table("sessions").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
            all_sessions = result.data or []
            # Filter out sessions that don't have title/summary (empty sessions)
            sessions = [s for s in all_sessions if s.get("title") and s.get("summary")]
            print(f"Found {len(all_sessions)} total sessions, {len(sessions)} valid sessions for user {user.id}")
            print(f"Valid sessions data: {sessions}")
            return sessions
        except Exception as e:
            print(f"Error fetching sessions: {e}")
            return []
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting user sessions: {e}")
        raise HTTPException(status_code=500, detail="Failed to get sessions")

@router.get("/sessions/{session_id}")
async def get_session_by_id(request: Request, session_id: str):
    """Get a specific session by ID for the authenticated user"""
    try:
        user = get_user_from_token(request)
        print(f"Fetching session {session_id} for user: {user.id}")
        
        try:
            # Get the specific session for the user
            result = supabase.table("sessions").select("*").eq("session_id", session_id).eq("user_id", user.id).execute()
            print(f"Supabase result: {result}")
            session = result.data[0] if result.data else None
            
            if not session:
                print(f"No session found in Supabase for session_id: {session_id}")
                raise HTTPException(status_code=404, detail="Session not found")
            
            print(f"Found session in Supabase: {session}")
            
            # Also get the entry from Algolia if it exists
            try:
                import requests
                import os
                
                ALGOLIA_SEARCH_KEY = os.environ.get("ALGOLIA_SEARCH_KEY")
                
                print(f"🔍 Algolia config - APP_ID: {ALGOLIA_APP_ID}, INDEX: {ALGOLIA_INDEX_NAME}")
                
                headers = {
                    "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
                    "X-Algolia-Application-Id": ALGOLIA_APP_ID,
                    "Content-Type": "application/json"
                }
                
                # First try session-specific search
                request_body = {
                    "indexName": ALGOLIA_INDEX_NAME,
                    "query": "",
                    "filters": f"session_id:{session_id} AND user_id:{user.id}",
                    "hitsPerPage": 1
                }
                
                print(f"🔍 Algolia session-specific search request: {request_body}")
                
                algolia_response = requests.post(
                    f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                    headers=headers,
                    json={"requests": [request_body]}
                )
                
                print(f"🔍 Algolia response status: {algolia_response.status_code}")
                
                if algolia_response.status_code == 200:
                    algolia_data = algolia_response.json()
                    hits = algolia_data.get("results", [{}])[0].get("hits", [])
                    if hits:
                        entry = hits[0]
                        print(f"✅ Found Algolia entry via session-specific search: {entry}")
                        print(f"📝 Entry text length: {len(entry.get('text', ''))}")
                        print(f"📝 Entry text preview: {entry.get('text', '')[:100]}...")
                        session["text"] = entry.get("text", "")
                        session["tags"] = entry.get("tags", [])
                    else:
                        print("❌ No hits found in session-specific search, trying fallback...")
                        
                        # Fallback: search all entries for this user and find by session_id
                        fallback_request = {
                            "indexName": ALGOLIA_INDEX_NAME,
                            "query": "",
                            "filters": f"user_id:{user.id}",
                            "hitsPerPage": 1000
                        }
                        
                        fallback_response = requests.post(
                            f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                            headers=headers,
                            json={"requests": [fallback_request]}
                        )
                        
                        if fallback_response.status_code == 200:
                            fallback_data = fallback_response.json()
                            fallback_hits = fallback_data.get("results", [{}])[0].get("hits", [])
                            
                            # Find entry with matching session_id
                            matching_entry = None
                            for hit in fallback_hits:
                                if hit.get("session_id") == session_id:
                                    matching_entry = hit
                                    break
                            
                            if matching_entry:
                                print(f"✅ Found Algolia entry via fallback search: {matching_entry}")
                                print(f"📝 Entry text length: {len(matching_entry.get('text', ''))}")
                                print(f"📝 Entry text preview: {matching_entry.get('text', '')[:100]}...")
                                session["text"] = matching_entry.get("text", "")
                                session["tags"] = matching_entry.get("tags", [])
                            else:
                                print("❌ No matching session found in fallback search")
                                session["text"] = ""
                                session["tags"] = []
                        else:
                            print(f"❌ Fallback search failed with status {fallback_response.status_code}")
                            session["text"] = ""
                            session["tags"] = []
                else:
                    print(f"❌ Algolia request failed with status {algolia_response.status_code}")
                    session["text"] = ""
                    session["tags"] = []
            except Exception as e:
                print(f"💥 Error fetching entry from Algolia: {e}")
                session["text"] = ""
                session["tags"] = []
            
            print(f"📦 Final session data being returned: {session}")
            print(f"📝 Final text length: {len(session.get('text', ''))}")
            
            # Content is now only stored in Algolia - no Supabase fallback needed
            if not session.get('text'):
                print("❌ No content found in Algolia - this session may not have been saved yet")
            
            return session
        except Exception as e:
            print(f"Error fetching session: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch session")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting session by ID: {e}")
        raise HTTPException(status_code=500, detail="Failed to get session")

@router.put("/update-session")
async def update_session(request: Request):
    """Update a session with title and other metadata"""
    try:
        user = get_user_from_token(request)
        data = await request.json()
        
        session_id = data.get("session_id")
        title = data.get("title")
        summary = data.get("summary")
        text = data.get("text")  # This is the journal content
        
        print(f"Updating session {session_id} for user {user.id}")
        print(f"Title: {title}")
        print(f"Summary: {summary}")
        print(f"Text length: {len(text) if text else 0}")
        
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        try:
            # Update the session with title and summary
            update_data = {}
            if title:
                update_data["title"] = title
            if summary:
                update_data["summary"] = summary
            
            if update_data:
                print(f"Updating session with data: {update_data}")
                result = supabase.table("sessions").update(update_data).eq("session_id", session_id).eq("user_id", user.id).execute()
                print(f"Session updated successfully: {result}")
            
            # Content is now only stored in Algolia - no Supabase storage needed
            if text:
                print(f"Content will be stored in Algolia when session is saved")
                print(f"Text length: {len(text)} characters")
            
            return {"message": "Session updated successfully"}
        except Exception as e:
            print(f"Error updating session in database: {e}")
            error_msg = str(e)
            if "column" in error_msg.lower() and ("title" in error_msg or "summary" in error_msg):
                raise HTTPException(status_code=500, detail="Database schema error: title/summary columns missing. Please run the database schema update.")
            else:
                raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in update_session: {e}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@router.get("/entries")
async def get_user_entries(request: Request, full_content: bool = False):
    """Get all journal entries for the authenticated user from Algolia"""
    try:
        user = get_user_from_token(request)
        print(f"Fetching entries for user: {user.id} (full_content: {full_content})")
        
        try:
            # Query Algolia for all entries for this user
            import requests
            import os
            
            ALGOLIA_APP_ID = os.environ.get("ALGOLIA_APP_ID")
            ALGOLIA_SEARCH_KEY = os.environ.get("ALGOLIA_SEARCH_KEY")
            ALGOLIA_API_KEY = os.environ.get("ALGOLIA_API_KEY")
            ALGOLIA_INDEX_NAME = os.environ.get("ALGOLIA_INDEX_NAME", "journal_entries")
            
            headers = {
                "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
                "X-Algolia-Application-Id": ALGOLIA_APP_ID,
                "Content-Type": "application/json"
            }
            
            # Search for all entries for this user (empty query returns all)
            request_body = {
                "indexName": ALGOLIA_INDEX_NAME,
                "query": "",
                "hitsPerPage": 1000,  # Get all entries
                "filters": f"user_id:{user.id}"
            }
            
            payload = {
                "requests": [request_body]
            }
            
            resp = requests.post(
                f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                headers=headers,
                json=payload,
                timeout=10
            )
            resp.raise_for_status()
            
            results = resp.json().get("results", [])
            entries = []
            
            for result in results:
                for hit in result.get("hits", []):
                    entry = {
                        "objectID": hit.get("objectID"),
                        "title": hit.get("title", ""),
                        "summary": hit.get("summary", ""),
                        "tags": hit.get("tags", []),
                        "timestamp": hit.get("timestamp", ""),
                        "text": hit.get("text", ""),
                        "session_id": hit.get("session_id", ""),
                        "date": hit.get("date", "")
                    }
                    
                    # Add full_content field when requested
                    if full_content:
                        entry["full_content"] = hit.get("text", "")
                    
                    entries.append(entry)
            
            # Sort by timestamp (newest first)
            entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            
            print(f"Found {len(entries)} entries for user {user.id}")
            return entries
            
        except Exception as e:
            print(f"Error fetching entries from Algolia: {e}")
            return []
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting user entries: {e}")
        raise HTTPException(status_code=500, detail="Failed to get entries")

@router.get("/session-stats")
async def get_session_stats(request: Request):
    """Get session statistics for the authenticated user"""
    try:
        user = get_user_from_token(request)
        print(f"Getting session stats for user: {user.id}")
        
        try:
            # Get all sessions for the user
            result = supabase.table("sessions").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
            all_sessions = result.data or []
            print(f"Found {len(all_sessions)} total sessions for user {user.id}")
            print(f"Raw sessions data: {all_sessions}")
            
            # Filter out sessions that don't have title/summary (empty sessions)
            sessions = [s for s in all_sessions if s.get("title") and s.get("summary")]
            print(f"After filtering empty sessions: {len(sessions)} valid sessions")
            print(f"Filtered sessions data: {sessions}")
            
            if not sessions:
                print("No sessions found, returning default stats")
                default_data = {
                    "total_sessions": 0,
                    "avg_session_duration": "0m",
                    "consistency": "0%",
                    "sessions_this_week": 0,
                    "sessions_last_week": 0,
                    "first_session_date": None,
                    "last_session_date": None
                }
                print(f"Returning default session stats: {default_data}")
                return default_data
            
            # Calculate basic stats
            total_sessions = len(sessions)
            first_session_date = sessions[-1]["created_at"] if sessions else None
            last_session_date = sessions[0]["created_at"] if sessions else None
            
            # Calculate sessions per week for consistency
            from datetime import datetime, timedelta
            now = datetime.now()
            week_ago = now - timedelta(days=7)
            two_weeks_ago = now - timedelta(days=14)
            
            print(f"Debug stats: total_sessions={total_sessions}, now={now}, week_ago={week_ago}")
            print(f"Debug sessions: {sessions}")
            
            # Fix timezone handling for date comparison
            sessions_this_week = 0
            sessions_last_week = 0
            
            for s in sessions:
                try:
                    # Parse the created_at timestamp
                    created_at_str = s["created_at"]
                    if created_at_str.endswith('Z'):
                        created_at_str = created_at_str[:-1] + '+00:00'
                    
                    session_date = datetime.fromisoformat(created_at_str)
                    print(f"Session date: {session_date}, week_ago: {week_ago}")
                    
                    if session_date > week_ago:
                        sessions_this_week += 1
                        print(f"✅ Session {s['session_id']} is this week")
                    elif two_weeks_ago < session_date <= week_ago:
                        sessions_last_week += 1
                        print(f"📅 Session {s['session_id']} is last week")
                except Exception as e:
                    print(f"Error parsing session date: {e}")
            
            print(f"Debug: sessions_this_week={sessions_this_week}, sessions_last_week={sessions_last_week}")
            
            # Calculate consistency (sessions per week average)
            if first_session_date:
                first_date = datetime.fromisoformat(first_session_date.replace('Z', '+00:00'))
                weeks_since_first = max(1, (now - first_date).days / 7)
                avg_sessions_per_week = total_sessions / weeks_since_first
                consistency = min(100, int(avg_sessions_per_week * 20))  # 5 sessions/week = 100%
            else:
                consistency = 0
            
            # Calculate average session duration based on created_at timestamps
            # For now, we'll estimate based on time between sessions
            avg_session_duration = "12m"  # Default fallback
            if len(sessions) > 1:
                try:
                    # Calculate average time between sessions as a proxy for session duration
                    total_time_diff = 0
                    valid_diffs = 0
                    
                    for i in range(len(sessions) - 1):
                        current_session = sessions[i]
                        next_session = sessions[i + 1]
                        
                        current_time = datetime.fromisoformat(current_session["created_at"].replace('Z', '+00:00'))
                        next_time = datetime.fromisoformat(next_session["created_at"].replace('Z', '+00:00'))
                        
                        # Only count if sessions are within reasonable time range (not more than 24 hours apart)
                        time_diff = abs((current_time - next_time).total_seconds() / 60)  # in minutes
                        if time_diff <= 1440:  # 24 hours in minutes
                            total_time_diff += time_diff
                            valid_diffs += 1
                    
                    if valid_diffs > 0:
                        avg_minutes = int(total_time_diff / valid_diffs)
                        avg_session_duration = f"{avg_minutes}m"
                except Exception as e:
                    print(f"Error calculating average session duration: {e}")
                    avg_session_duration = "12m"
            
            result_data = {
                "total_sessions": total_sessions,
                "avg_session_duration": avg_session_duration,
                "consistency": f"{consistency}%",
                "sessions_this_week": sessions_this_week,
                "sessions_last_week": sessions_last_week,
                "first_session_date": first_session_date,
                "last_session_date": last_session_date
            }
            print(f"Returning session stats: {result_data}")
            return result_data
            
        except Exception as e:
            print(f"Error calculating session stats: {e}")
            error_data = {
                "total_sessions": 0,
                "avg_session_duration": "0m",
                "consistency": "0%",
                "sessions_this_week": 0,
                "sessions_last_week": 0,
                "first_session_date": None,
                "last_session_date": None
            }
            print(f"Returning error session stats: {error_data}")
            return error_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting session stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get session stats") 