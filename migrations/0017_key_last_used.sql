-- Track last API key usage time
ALTER TABLE _api_keys ADD COLUMN last_used_at INTEGER;
