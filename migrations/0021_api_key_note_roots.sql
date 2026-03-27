ALTER TABLE _api_keys ADD COLUMN notes_scope TEXT NOT NULL DEFAULT 'all';

UPDATE _api_keys
SET notes_scope = 'none'
WHERE scope = 'groups';

CREATE TABLE IF NOT EXISTS _api_key_note_roots (
  key_id INTEGER NOT NULL REFERENCES _api_keys(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES _notes(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_api_key_note_roots_key ON _api_key_note_roots(key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_note_roots_note ON _api_key_note_roots(note_id);
