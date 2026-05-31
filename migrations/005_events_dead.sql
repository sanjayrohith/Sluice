ALTER TABLE events
  ADD COLUMN failed_reason TEXT;

CREATE INDEX events_dead_created_idx
  ON events (status, created_at)
  WHERE status = 'dead';
