-- Knowledge Base: archive support for notes
ALTER TABLE _notes ADD COLUMN archived_at INTEGER;
ALTER TABLE _notes ADD COLUMN cover TEXT;
ALTER TABLE _notes ADD COLUMN description TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_archived ON _notes(archived_at);
