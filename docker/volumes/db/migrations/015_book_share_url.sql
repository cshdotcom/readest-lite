-- v8.18.3 migration: add book_url column to book_shares for feed:// book sharing
-- Feed books have no book file on disk — they're described by a `feed://` URL
-- that encodes the subscription. Sharing one of them stores the descriptor
-- here instead of a file reference. NULL for ordinary book shares.

ALTER TABLE book_shares
  ADD COLUMN IF NOT EXISTS book_url TEXT;
