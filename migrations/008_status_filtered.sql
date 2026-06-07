ALTER TABLE events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'running', 'succeeded', 'dead', 'filtered'));
