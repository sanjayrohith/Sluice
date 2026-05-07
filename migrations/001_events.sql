CREATE TABLE events (
  id            BIGSERIAL PRIMARY KEY,
  source_id     TEXT NOT NULL,
  dedup_key     TEXT,
  raw_body      BYTEA NOT NULL,
  headers       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
