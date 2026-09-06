-- v8.19.0: File hash deduplication + reference counting
ALTER TABLE files ADD COLUMN ref_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN content_hash TEXT;
ALTER TABLE files ADD COLUMN original_file_key TEXT;
