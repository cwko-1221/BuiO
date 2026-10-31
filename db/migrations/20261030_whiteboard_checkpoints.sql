-- Private, short-lived classroom recovery. Runtime also creates this table
-- idempotently. Only the backend's database owner/service connection may read it.
CREATE TABLE IF NOT EXISTS WhiteboardCheckpoints (
  RoomID TEXT NOT NULL,
  PartID TEXT NOT NULL,
  Payload JSONB NOT NULL,
  UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (RoomID, PartID)
);
ALTER TABLE WhiteboardCheckpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON WhiteboardCheckpoints FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON WhiteboardCheckpoints FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON WhiteboardCheckpoints FROM authenticated;
  END IF;
END $$;
