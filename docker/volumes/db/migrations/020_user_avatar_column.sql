-- v8.19.1: User avatar URL column
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
