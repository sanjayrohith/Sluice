-- Prevent duplicate provider events while allowing events without a dedup key.
CREATE UNIQUE INDEX events_source_dedup_key_idx
  ON events (source_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Keep ready pending events efficient to find for dispatcher workers.
CREATE INDEX events_pending_retry_idx
  ON events (status, next_retry_at)
  WHERE status = 'pending';
