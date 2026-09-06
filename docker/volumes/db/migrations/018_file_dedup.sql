-- v8.19.0 migration: file dedup + reference counting
-- Adds three columns to the files table:
--   ref_count        — how many users reference this physical file
--                      (owner row = 1, dedup reference row = 0)
--   content_hash     — the book's content hash, used for cross-user dedup
--   original_file_key — for dedup'd reference rows, points to the owner's
--                      file_key where the actual bytes live. NULL = owner.

ALTER TABLE files ADD COLUMN ref_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN content_hash TEXT;
ALTER TABLE files ADD COLUMN original_file_key TEXT;

-- Lookup indexes for the dedup query: find any owner row with the same
-- content_hash and deletedAt IS NULL (owner rows have original_file_key IS NULL).
CREATE INDEX IF NOT EXISTS idx_files_content_hash_deleted
  ON files(content_hash, deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_original_file_key
  ON files(original_file_key);
