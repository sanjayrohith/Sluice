CREATE TABLE delivery_attempts (
  id               BIGSERIAL PRIMARY KEY,
  event_id         BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attempt_number   INT NOT NULL,
  destination_id   TEXT NOT NULL,
  request_headers  JSONB NOT NULL,
  response_status  INT NOT NULL,
  response_headers JSONB NOT NULL,
  response_body    TEXT NOT NULL,
  duration_ms      INT NOT NULL,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX delivery_attempts_event_attempt_idx
  ON delivery_attempts (event_id, attempt_number);
