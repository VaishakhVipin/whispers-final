import os
import requests
from dotenv import load_dotenv
from datetime import datetime
import pyjson

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ALGOLIA_APP_ID = os.getenv("ALGOLIA_APP_ID")
ALGOLIA_API_KEY = os.getenv("ALGOLIA_API_KEY")
ALGOLIA_SEARCH_KEY = os.getenv("ALGOLIA_SEARCH_KEY")
ALGOLIA_INDEX_NAME = os.getenv("ALGOLIA_INDEX_NAME", "whispers_logs")
ALGOLIA_MCP_URL = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX_NAME}/query"

# --- Gemini summarization ---
def summarize(text):
    """
    Summarize text using Gemini API (model: gemini-2.0-flash). Generate a short title, a concise summary, and 3-5 tags. Return only a JSON object with keys: 'title', 'summary', 'tags'.
    """
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {"Content-Type": "application/json"}
    prompt = (
        "Given the following journal entry, generate: "
        "1. A short, relevant title (3-7 words, no punctuation). "
        "2. A concise summary (1-2 sentences, no advice or analysis). "
        "3. 3-5 tags (single words or short phrases). "
        "Return ONLY a valid JSON object with keys: 'title', 'summary', 'tags'. "
        "Do NOT include any markdown, code block, or extra text. "
        "Example: {\"title\": \"Burnout at work\", \"summary\": \"Felt burnt out after a long week.\", \"tags\": [\"burnout\", \"work\"]} "
        "\n\nJournal Entry:\n" + text
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 256}
    }
    params = {"key": GEMINI_API_KEY}
    resp = requests.post(url, headers=headers, params=params, json=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    import json as pyjson
    import re
    try:
        response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        # Strip code block markers if present
        cleaned = re.sub(r"^```(?:json)?|```$", "", response_text.strip(), flags=re.MULTILINE).strip()
        parsed = pyjson.loads(cleaned)
        # If parsed is a string, parse again
        if isinstance(parsed, str):
            parsed = pyjson.loads(parsed)
        title = parsed.get("title", "")
        summary = parsed.get("summary", "")
        tags = parsed.get("tags", [])
    except Exception:
        title = ""
        summary = response_text
        tags = []
    return title, summary, tags

# --- Algolia MCP search ---
def search_journals(query):
    """
    Search Algolia MCP index and return list of journal dicts.
    """
    headers = {
        "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "Content-Type": "application/json"
    }
    payload = {"params": f"query={query}"}
    resp = requests.post(ALGOLIA_MCP_URL, headers=headers, json=payload, timeout=10)
    resp.raise_for_status()
    hits = resp.json().get("hits", [])
    # format as required
    results = []
    for hit in hits:
        results.append({
            "title": hit.get("title", ""),
            "summary": hit.get("summary", ""),
            "tags": hit.get("tags", []),
            "timestamp": hit.get("timestamp", "")
        })
    return results

# --- Gemini tool-calling for Algolia MCP ---
def search_with_tool_call(query):
    """
    Use Gemini-2.0-Flash tool-calling to search Algolia MCP via a tool schema.
    Returns Gemini's response (may include tool call results).
    """
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {"Content-Type": "application/json"}
    # Define the tool schema for Algolia search
    tool_schema = [
        {
            "function_declarations": [
                {
                    "name": "search_algolia",
                    "description": "Searches the user's journal entries using Algolia MCP and returns a list of relevant entries.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "The search query."}
                        },
                        "required": ["query"]
                    }
                }
            ]
        }
    ]
    # Prompt Gemini to use the tool
    prompt = f"""
You are an AI assistant for a journaling app. When the user asks a question about their past journals, use the search_algolia tool to find relevant entries. Only use the tool, do not answer from your own knowledge.
User query: {query}
"""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": tool_schema,
        "generationConfig": {"maxOutputTokens": 512}
    }
    params = {"key": GEMINI_API_KEY}
    resp = requests.post(url, headers=headers, params=params, json=payload, timeout=15)
    resp.raise_for_status()
    return resp.json()

def mcp_search(query, user_id=None):
    """
    Multi-step MCP agent architecture for contextual journal search:
    
    Stage 1: Intent Extraction - Gemini analyzes query and extracts search terms
    Stage 2: Memory Retrieval - Check local memory for similar past queries
    Stage 3: Search Execution - Query Algolia with extracted terms and user filters
    Stage 4: Synthesis - Feed results back to Gemini for contextual insights
    Stage 5: Memory Storage - Store query and results for future reference
    """
    import json as pyjson
    import re
    import os
    from datetime import datetime
    
    # Initialize response structure
    response = {
        "original_query": query,
        "search_terms": [],
        "stage1_response": "",
        "algolia_hits": [],
        "final_summary": "",
        "memory_used": False,
        "timestamp": datetime.now().isoformat()
    }
    
    # ===== STAGE 1: Intent Extraction =====
    print("🔍 Stage 1: Extracting intent and search terms...")
    try:
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        headers = {"Content-Type": "application/json"}
        
        extraction_prompt = (
            "You are an AI assistant for a journaling app. "
            "Analyze the user's query and extract intent and search terms. "
            "Return a JSON object with: "
            "1. 'is_search': 'yes' if this requires searching past entries, 'no' otherwise "
            "2. 'search_terms': array of specific, relevant search terms "
            "3. 'intent': brief description of what the user is looking for "
            "4. 'response': a helpful, natural response about what you'll search for "
            "Example: {\"is_search\": \"yes\", \"search_terms\": [\"productivity\", \"morning\"], \"intent\": \"finding productivity patterns\", \"response\": \"I'll search for entries about your productivity and morning routines.\"} "
            f"User query: {query}"
        )
        
        payload = {
            "contents": [{"parts": [{"text": extraction_prompt}]}],
            "generationConfig": {"maxOutputTokens": 512}
        }
        params = {"key": GEMINI_API_KEY}
        
        resp = requests.post(url, headers=headers, params=params, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        cleaned = re.sub(r"^```(?:json)?|```$", "", response_text.strip(), flags=re.MULTILINE).strip()
        parsed = pyjson.loads(cleaned)
        
        is_search = parsed.get("is_search", "no").strip().lower() == "yes"
        search_terms = parsed.get("search_terms", [])
        intent = parsed.get("intent", "")
        stage1_response = parsed.get("response", "")
        
        response["search_terms"] = search_terms
        response["stage1_response"] = stage1_response
        
        print(f"✅ Stage 1 complete: is_search={is_search}, terms={search_terms}")
        
    except Exception as e:
        print(f"❌ Stage 1 failed: {e}")
        # Fallback: treat as search with basic terms
        is_search = True
        search_terms = query.lower().split()[:3]  # Basic fallback
        stage1_response = f"I'll search for entries related to your query: {query}"
        response["search_terms"] = search_terms
        response["stage1_response"] = stage1_response
    
    # ===== STAGE 2: Memory Retrieval =====
    print("🧠 Stage 2: Checking memory for similar queries...")
    memory_result = _check_memory(query, search_terms)
    if memory_result:
        response["memory_used"] = True
        response["final_summary"] = memory_result["summary"]
        print(f"✅ Memory hit: Found similar query from {memory_result['timestamp']}")
        return response
    
    # ===== STAGE 3: Search Execution (only if search needed) =====
    if not is_search:
        print("ℹ️ No search needed, returning direct response")
        response["final_summary"] = stage1_response
        return response
    
    print("🔍 Stage 3: Executing Algolia search...")
    algolia_results = []
    seen_ids = set()
    
    try:
        headers_algolia = {
            "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "Content-Type": "application/json"
        }
        
        for term in search_terms:
            print(f"  Searching for term: '{term}'...")
            filter_str = f"user_id:{user_id}" if user_id else ""
            
            request_body = {
                "indexName": ALGOLIA_INDEX_NAME,
                "query": term,
                "hitsPerPage": 10,
                "filters": filter_str
            }
            
            payload_algolia = {"requests": [request_body]}
            resp_algolia = requests.post(
                f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                headers=headers_algolia,
                json=payload_algolia,
                timeout=10
            )
            resp_algolia.raise_for_status()
            
            results = resp_algolia.json().get("results", [])
            for result in results:
                for hit in result.get("hits", []):
                    obj_id = hit.get("objectID")
                    if obj_id and obj_id not in seen_ids:
                        clean_hit = {
                            "objectID": obj_id,
                            "title": hit.get("title", ""),
                            "summary": hit.get("summary", ""),
                            "tags": hit.get("tags", []),
                            "timestamp": hit.get("timestamp", "")
                        }
                        algolia_results.append(clean_hit)
                        seen_ids.add(obj_id)
        
        # Sort by relevance and date
        sorted_results = _sort_by_relevance(algolia_results, search_terms)
        response["algolia_hits"] = sorted_results
        print(f"✅ Stage 3 complete: Found {len(sorted_results)} results")
        
    except Exception as e:
        print(f"❌ Stage 3 failed: {e}")
        response["algolia_hits"] = []
    
    # ===== STAGE 4: Synthesis =====
    print("🧠 Stage 4: Synthesizing insights from results...")
    try:
        synthesis_prompt = (
            f"You are analyzing journal search results for a user. "
            f"Original query: '{query}' "
            f"Search terms used: {search_terms} "
            f"Found {len(response['algolia_hits'])} relevant entries. "
            f"Provide a concise, insightful summary (2-3 sentences) that: "
            f"1. Acknowledges what was found "
            f"2. Highlights any patterns or insights "
            f"3. Uses a warm, personal tone "
            f"Focus on the most relevant findings and any emotional or temporal patterns. "
            f"Results: {pyjson.dumps(response['algolia_hits'][:5], indent=2)}"
        )
        
        synthesis_payload = {
            "contents": [{"parts": [{"text": synthesis_prompt}]}],
            "generationConfig": {"maxOutputTokens": 256}
        }
        
        resp = requests.post(url, headers=headers, params=params, json=synthesis_payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        final_summary = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        response["final_summary"] = final_summary.strip()
        print(f"✅ Stage 4 complete: Generated synthesis")
        
    except Exception as e:
        print(f"❌ Stage 4 failed: {e}")
        # Fallback summary
        if response["algolia_hits"]:
            response["final_summary"] = f"Found {len(response['algolia_hits'])} relevant entries for your query about {', '.join(search_terms)}."
        else:
            response["final_summary"] = "No relevant entries found for your query."
    
    # ===== STAGE 5: Memory Storage =====
    print("💾 Stage 5: Storing query and results in memory...")
    _store_memory(query, search_terms, response["final_summary"])
    
    return response


def _check_memory(query, search_terms):
    """Check local memory for similar past queries"""
    try:
        if not os.path.exists("memory_store.json"):
            return None
        
        with open("memory_store.json", "r") as f:
            memory = pyjson.load(f)
        
        # Simple similarity check (can be enhanced)
        query_lower = query.lower()
        for entry in memory.get("queries", []):
            if any(term.lower() in query_lower for term in entry.get("search_terms", [])):
                return entry
        
        return None
    except Exception as e:
        print(f"Memory check failed: {e}")
        return None


def _store_memory(query, search_terms, summary):
    """Store query and results in local memory"""
    try:
        memory = {"queries": []}
        
        if os.path.exists("memory_store.json"):
            with open("memory_store.json", "r") as f:
                memory = pyjson.load(f)
        
        # Keep only last 50 queries to prevent file bloat
        memory["queries"] = memory.get("queries", [])[-49:]
        
        new_entry = {
            "query": query,
            "search_terms": search_terms,
            "summary": summary,
            "timestamp": datetime.now().isoformat()
        }
        
        memory["queries"].append(new_entry)
        
        with open("memory_store.json", "w") as f:
            pyjson.dump(memory, f, indent=2)
            
    except Exception as e:
        print(f"Memory storage failed: {e}")


def _sort_by_relevance(hits, search_terms):
    """Sort Algolia hits by relevance score and date"""
    def calculate_relevance(hit):
        relevance_score = 0
        for term in search_terms:
            term_lower = term.lower()
            if term_lower in hit.get("title", "").lower():
                relevance_score += 3  # Title matches are most important
            if term_lower in hit.get("summary", "").lower():
                relevance_score += 2  # Summary matches are important
            if any(term_lower in tag.lower() for tag in hit.get("tags", [])):
                relevance_score += 1  # Tag matches are good
        return relevance_score
    
    return sorted(
        hits,
        key=lambda x: (calculate_relevance(x), x.get("timestamp", "")),
        reverse=True
    ) 