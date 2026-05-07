CREATE TABLE rejected_events (
  id         BIGSERIAL PRIMARY KEY,
  source_id  TEXT NOT NULL,
  reason     TEXT NOT NULL,
  raw_body   BYTEA NOT NULL,
  headers    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
