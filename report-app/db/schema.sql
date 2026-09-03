-- Assessment report imports. The original workbook and parsed report records
-- are both kept so every authorised device reads the same server-side data.
CREATE TABLE IF NOT EXISTS AssessmentImports (
  ID VARCHAR(36) PRIMARY KEY,
  Filename VARCHAR(255) NOT NULL,
  MimeType VARCHAR(120),
  FileSize BIGINT NOT NULL DEFAULT 0,
  FileData BYTEA,
  Records JSONB NOT NULL DEFAULT '[]'::jsonb,
  Source VARCHAR(30) NOT NULL DEFAULT 'upload',
  UploadedBy VARCHAR(20),
  UploadedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_assessment_imports_filename_ci;
CREATE INDEX IF NOT EXISTS idx_assessment_imports_filename
  ON AssessmentImports (LOWER(Filename));
CREATE INDEX IF NOT EXISTS idx_assessment_imports_uploaded_at
  ON AssessmentImports (UploadedAt DESC);
