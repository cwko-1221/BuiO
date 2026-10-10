SET LOCAL lock_timeout = '3s';
CREATE TABLE IF NOT EXISTS PlatformOperationReceipts (
  ActorID varchar(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
  OperationKey varchar(120) NOT NULL, Kind varchar(40) NOT NULL,
  PayloadHash char(64) NOT NULL, Response jsonb NOT NULL,
  CreatedAt timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(ActorID,OperationKey)
);
ALTER TABLE PlatformOperationReceipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON PlatformOperationReceipts FROM anon,authenticated;
