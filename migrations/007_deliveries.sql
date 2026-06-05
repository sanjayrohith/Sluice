CREATE TABLE deliveries (
  id             BIGSERIAL PRIMARY KEY,
  event_id       BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL,
  body           BYTEA,
  status         TEXT NOT NULL DEFAULT 'pending',
  attempts       INT NOT NULL DEFAULT 0,
  next_retry_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at      TIMESTAMPTZ,
  failed_reason  TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delivery_attempts
  ADD COLUMN delivery_id BIGINT REFERENCES deliveries(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS events_pending_retry_idx;
DROP INDEX IF EXISTS events_dead_created_idx;

CREATE INDEX deliveries_pending_retry_idx
  ON deliveries (status, next_retry_at)
  WHERE status = 'pending';

CREATE INDEX deliveries_dead_created_idx
  ON deliveries (status, created_at)
  WHERE status = 'dead';
