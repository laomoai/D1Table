-- Remove unused columns and indexes from _notes table
-- table_name and row_id were part of an earlier design that has been replaced
-- by @[title](table:name) markdown syntax and the "note" field type
DROP INDEX IF EXISTS idx_notes_table;
DROP INDEX IF EXISTS idx_notes_row;
-- SQLite does not support DROP COLUMN before 3.35.0
-- Cloudflare D1 uses a recent SQLite version that supports it
ALTER TABLE _notes DROP COLUMN table_name;
ALTER TABLE _notes DROP COLUMN row_id;
