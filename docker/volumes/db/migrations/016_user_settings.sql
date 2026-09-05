-- v8.18.4 migration: create user_settings table for encrypted settings sync
-- Each user's SystemSettings + GlobalViewSettings + GlobalReadSettings are
-- encrypted (AES-GCM via VaultContext key) and stored here for cross-device
-- sync. Server never decrypts — only stores/retrieves ciphertext.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id           TEXT    NOT NULL,
  scope             TEXT    NOT NULL,  -- 'system' | 'global_view' | 'global_read'
  encrypted_payload TEXT    NOT NULL,  -- base64(JSON(CipherEnvelope))
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
