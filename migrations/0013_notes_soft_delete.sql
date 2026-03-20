-- Soft delete for notes: deleted_at is NULL for active notes, set to timestamp when deleted
ALTER TABLE _notes ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON _notes(deleted_at);
