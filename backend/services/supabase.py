import os
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Validate environment variables
if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is not set")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY environment variable is not set")

print(f"Initializing Supabase client with URL: {SUPABASE_URL}")
print(f"Supabase key type: {'Service Role' if SUPABASE_KEY.startswith('eyJ') and len(SUPABASE_KEY) > 100 else 'Anon Key'}")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Supabase client initialized successfully")
except Exception as e:
    print(f"Error initializing Supabase client: {e}")
    raise

def insert_session(session_id, user_id, date, created_at):
    try:
        data = {"session_id": session_id, "user_id": user_id, "date": date, "created_at": created_at}
        result = supabase.table("sessions").insert(data).execute()
        return result
    except Exception as e:
        print(f"Error inserting session: {e}")
        raise

def insert_journal_entry(entry_data):
    try:
        result = supabase.table("journal_entries").insert(entry_data).execute()
        return result
    except Exception as e:
        print(f"Error inserting journal entry: {e}")
        raise 