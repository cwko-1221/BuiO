CREATE TABLE IF NOT EXISTS ScienceInquiryComments (
  ID UUID PRIMARY KEY,
  VideoID UUID NOT NULL REFERENCES ScienceInquiryVideos(ID) ON DELETE CASCADE,
  TeacherID VARCHAR(20) NOT NULL,
  TeacherName VARCHAR(120) NOT NULL,
  Message VARCHAR(2000) NOT NULL CHECK (length(trim(Message)) > 0),
  CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_science_inquiry_comments_video ON ScienceInquiryComments(VideoID, CreatedAt DESC, ID DESC);
ALTER TABLE ScienceInquiryComments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON ScienceInquiryComments FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON ScienceInquiryComments FROM authenticated;
  END IF;
END $$;
