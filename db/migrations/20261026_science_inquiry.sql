CREATE TABLE IF NOT EXISTS ScienceInquiryVideos (
  ID UUID PRIMARY KEY,
  AuthorID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
  AuthorName TEXT NOT NULL,
  Title VARCHAR(100) NOT NULL,
  Description VARCHAR(2000) NOT NULL,
  Kind TEXT NOT NULL CHECK (Kind IN ('observation', 'question')),
  StorageKey TEXT NOT NULL UNIQUE,
  PosterKey TEXT NOT NULL UNIQUE,
  Duration DOUBLE PRECISION NOT NULL,
  OriginalBytes BIGINT NOT NULL,
  VideoBytes BIGINT NOT NULL,
  Width INTEGER NOT NULL,
  Height INTEGER NOT NULL,
  Status TEXT NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'published', 'rejected')),
  ReviewNote VARCHAR(500) NOT NULL DEFAULT '',
  ReviewedBy VARCHAR(20),
  ReviewedAt TIMESTAMPTZ,
  PublishedAt TIMESTAMPTZ,
  Revision INTEGER NOT NULL DEFAULT 0,
  CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_science_inquiry_feed ON ScienceInquiryVideos(Status, PublishedAt DESC);
CREATE INDEX IF NOT EXISTS idx_science_inquiry_author ON ScienceInquiryVideos(AuthorID, CreatedAt DESC);
CREATE TABLE IF NOT EXISTS ScienceInquiryLikes (
  VideoID UUID NOT NULL REFERENCES ScienceInquiryVideos(ID) ON DELETE CASCADE,
  StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
  CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (VideoID, StudentID)
);
ALTER TABLE ScienceInquiryVideos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ScienceInquiryLikes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON ScienceInquiryVideos, ScienceInquiryLikes FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON ScienceInquiryVideos, ScienceInquiryLikes FROM authenticated;
  END IF;
END $$;
