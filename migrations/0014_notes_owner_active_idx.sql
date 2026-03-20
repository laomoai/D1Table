-- Composite index for the most common query pattern: owner's active notes
-- Covers: GET /notes/tree WHERE owner_id = ? AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_notes_owner_active ON _notes(owner_id, deleted_at);
