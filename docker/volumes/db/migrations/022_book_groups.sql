-- v8.21: BookGroup — user-defined book groups (Group Management UI)
-- Prisma db push will create this table automatically on container startup,
-- but for users upgrading without prisma db push (rare), this migration is
-- also applied manually by the entrypoint.sh migration runner.

CREATE TABLE IF NOT EXISTS book_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_book_groups_user_sort
  ON book_groups (user_id, sort_order);
