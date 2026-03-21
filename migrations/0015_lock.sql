-- Add lock support for tables and notes
ALTER TABLE _meta ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE _notes ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;
