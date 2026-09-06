-- v8.18.9 migration: add avatar_url column to users table
-- Stores a per-user avatar URL. Admin can override their own avatar via
-- the ADMIN_AVATAR_URL env var (priority over this column at request time).
-- SVG is rejected at the API layer (XSS risk via <script>); the column
-- itself accepts any TEXT to keep migrations additive and forward-compatible.

ALTER TABLE users ADD COLUMN avatar_url TEXT;
