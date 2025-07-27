-- Add user_id column to sessions table (if it doesn't exist)
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);