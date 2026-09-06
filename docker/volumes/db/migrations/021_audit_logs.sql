-- v8.19.6: Audit logs for admin operations + rollback
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_user_id TEXT,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rolled_back BOOLEAN NOT NULL DEFAULT 0,
  rolled_back_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
