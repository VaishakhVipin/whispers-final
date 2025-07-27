import os
import requests
from dotenv import load_dotenv

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
    Enhanced MCP tool-calling loop for Gemini:
    1. Ask Gemini to extract only the most relevant, specific search terms from the user query (not generic words), and let Gemini decide the number of terms dynamically.
    2. If it's a search, use those terms to query Algolia individually; otherwise, answer directly.
    3. Always include a simple Gemini response in the output, even for Algolia queries.
    4. Return a clean, deduplicated, and readable response.
    """
    import json as pyjson
    import re
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {"Content-Type": "application/json"}
    # Step 1: Ask Gemini to extract search terms and decide if it's a search
    extraction_prompt = (
        "You are an AI assistant for a journaling app. "
        "When the user asks a question about their past journals, "
        "extract the most relevant search terms and provide a helpful response. "
        "Return a JSON object with: "
        "1. 'is_search': 'yes' if this is a search query, 'no' otherwise "
        "2. 'search_terms': array of specific search terms to use "
        "3. 'gemini_response': a brief, helpful response about what you're looking for "
        "Example: {\"is_search\": \"yes\", \"search_terms\": [\"productivity\", \"morning\"], \"gemini_response\": \"I'll search for entries about your productivity and morning routines.\"} "
        f"User query: {query}"
    )
    extraction_payload = {
        "contents": [{"parts": [{"text": extraction_prompt}]}],
        "generationConfig": {"maxOutputTokens": 512}
    }
    params = {"key": GEMINI_API_KEY}
    resp = requests.post(url, headers=headers, params=params, json=extraction_payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    try:
        response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        # Strip code block markers if present
        cleaned = re.sub(r"^```(?:json)?|```$", "", response_text.strip(), flags=re.MULTILINE).strip()
        parsed = pyjson.loads(cleaned)
        is_search = parsed.get("is_search", "no").strip().lower() == "yes"
        search_terms = parsed.get("search_terms", [])
        gemini_response = parsed.get("gemini_response", "")
    except Exception:
        is_search = False
        search_terms = []
        gemini_response = ""
    # Debug print
    print("User query:", query)
    print("Gemini full response_text:", response_text)
    print("Gemini search_terms:", search_terms)
    print("is_search:", is_search)
    # Step 2: If it's a search, use search_terms to query Algolia individually
    algolia_results = []
    seen_ids = set()
    if is_search and search_terms:
        headers_algolia = {
            "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY or ALGOLIA_API_KEY,
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "Content-Type": "application/json"
        }
        for term in search_terms:
            print(f"Searching Algolia for term: '{term}' ...", end=' ')
            # Add user_id filter if provided
            filter_str = f"user_id:{user_id}" if user_id else None
            request_body = {
                "indexName": ALGOLIA_INDEX_NAME,
                "query": term,
                "hitsPerPage": 10,
                "filters": filter_str if filter_str else ""
            }
            payload_algolia = {
                "requests": [request_body]
            }
            resp_algolia = requests.post(
                f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries",
                headers=headers_algolia,
                json=payload_algolia,
                timeout=10
            )
            resp_algolia.raise_for_status()
            results = resp_algolia.json().get("results", [])
            found = 0
            for result in results:
                for hit in result.get("hits", []):
                    found += 1
                    obj_id = hit.get("objectID")
                    if obj_id and obj_id not in seen_ids:
                        # Only keep relevant fields for the API response
                        clean_hit = {
                            "objectID": obj_id,
                            "title": hit.get("title", ""),
                            "summary": hit.get("summary", ""),
                            "tags": hit.get("tags", []),
                            "timestamp": hit.get("timestamp", "")
                        }
                        algolia_results.append(clean_hit)
                        seen_ids.add(obj_id)
            print(f"found {found} results.")
    print("Final Algolia results:", algolia_results)
    
    # Sort results by relevance (more search terms matched = higher relevance) and date (newer first)
    def calculate_relevance(hit):
        relevance_score = 0
        # Count how many search terms appear in title, summary, or tags
        for term in search_terms:
            term_lower = term.lower()
            if term_lower in hit.get("title", "").lower():
                relevance_score += 3  # Title matches are most important
            if term_lower in hit.get("summary", "").lower():
                relevance_score += 2  # Summary matches are important
            if any(term_lower in tag.lower() for tag in hit.get("tags", [])):
                relevance_score += 1  # Tag matches are good
        return relevance_score
    
    # Sort by relevance (descending) then by timestamp (descending - newest first)
    sorted_results = sorted(
        algolia_results,
        key=lambda x: (calculate_relevance(x), x.get("timestamp", "")),
        reverse=True
    )
    
    print("Sorted results by relevance and date:", sorted_results)
    
    # Step 3: Return both Gemini's response and Algolia results (if any), formatted
    return {
        "gemini_response": gemini_response,
        "results": sorted_results,
        "search_terms": search_terms,
        "is_search": is_search
    } 