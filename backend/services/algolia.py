import os
from dotenv import load_dotenv
from algoliasearch.search.client import SearchClientSync
from typing import List, Dict, Any, Optional

load_dotenv()

ALGOLIA_APP_ID = os.getenv("ALGOLIA_APP_ID")
ALGOLIA_API_KEY = os.getenv("ALGOLIA_API_KEY")
ALGOLIA_INDEX_NAME = os.getenv("ALGOLIA_INDEX_NAME", "whispers_logs")

_client: Optional[SearchClientSync] = None

def get_client() -> SearchClientSync:
    """
    Get a singleton Algolia SearchClientSync instance.
    """
    global _client
    if _client is None:
        if not ALGOLIA_APP_ID or not ALGOLIA_API_KEY:
            raise RuntimeError("Algolia credentials not set in environment variables.")
        _client = SearchClientSync(ALGOLIA_APP_ID, ALGOLIA_API_KEY)
    return _client

def index_journal(entry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Index a single journal entry in Algolia. Waits for task completion.

    Args:
        entry: dict with at least 'objectID', 'title', 'summary', 'tags', etc.
    Returns:
        Algolia response dict.
    Raises:
        Exception on failure.

    Example:
        entry = {"objectID": "abc123", "title": "My Day", "summary": "...", "tags": ["mood"], ...}
        resp = index_journal(entry)
    """
    client = get_client()
    try:
        resp = client.save_object(index_name=ALGOLIA_INDEX_NAME, body=entry)
        client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=resp.task_id)
        return resp.to_dict()
    except Exception as e:
        raise RuntimeError(f"Algolia indexing failed: {e}")

def index_journals(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Index multiple journal entries in Algolia. Waits for task completion.

    Args:
        entries: list of dicts, each with 'objectID', 'title', etc.
    Returns:
        Algolia response dict.
    Raises:
        Exception on failure.

    Example:
        entries = [{"objectID": "1", ...}, {"objectID": "2", ...}]
        resp = index_journals(entries)
    """
    client = get_client()
    try:
        resp = client.save_objects(index_name=ALGOLIA_INDEX_NAME, body=entries)
        client.wait_for_task(index_name=ALGOLIA_INDEX_NAME, task_id=resp.task_id)
        return resp.to_dict()
    except Exception as e:
        raise RuntimeError(f"Algolia batch indexing failed: {e}")

def _test_index_journal():
    print("Running MCP connection test for index_journal...")
    # Subtest: Ensure Algolia SDK is NOT imported
    import sys
    assert 'algoliasearch' not in sys.modules, "Algolia SDK should not be imported; only HTTP MCP should be used."
    # Test: Index a unique journal entry
    entry = {
        "title": "MCP Test Entry",
        "summary": "This entry is for MCP connection testing only.",
        "tags": ["mcp", "test", "unique12345"],
        "timestamp": "2025-07-24T10:22:00Z"
    }
    try:
        response = index_journal(entry)
        print("Index response:", response)
        assert 'objectID' in response, "Response should contain objectID."
        print("MCP indexing test passed.")
    except Exception as e:
        print("MCP indexing test failed:", e)

def _test_search_journals():
    print("\n=== Running MCP search test for natural language query ===")
    from services.gemini import mcp_search
    query = "when did I feel burnt out"
    response = mcp_search(query)
    print("MCP search response:", response)
    print("=== End of MCP search test ===\n")

if __name__ == "__main__":
    _test_index_journal()
    _test_search_journals()