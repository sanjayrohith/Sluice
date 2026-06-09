ALTER TABLE events
  ADD COLUMN traceparent TEXT,
  ADD COLUMN tracestate TEXT;
