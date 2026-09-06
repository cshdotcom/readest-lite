-- v8.19.0 migration: recycle bin table
-- Books deleted by the user are soft-deleted (Book.deletedAt = now) and a
-- row is added here. The recycle bin UI lets the user restore (clear
-- deletedAt) or permanently delete (delete physical file + Book rows).
-- Rows past expiresAt are auto-cleaned on every GET /api/recycle-bin.

CREATE TABLE IF NOT EXISTS recycle_bin_items (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  book_hash   TEXT NOT NULL,
  book_title  TEXT NOT NULL,
  book_format TEXT NOT NULL,
  file_key    TEXT,
  deleted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recycle_user ON recycle_bin_items(user_id);
CREATE INDEX IF NOT EXISTS idx_recycle_user_expires ON recycle_bin_items(user_id, expires_at);
