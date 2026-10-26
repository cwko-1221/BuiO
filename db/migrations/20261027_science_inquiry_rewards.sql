-- The permanent marker survives unpublishing/reviewing a video again.
ALTER TABLE ScienceInquiryVideos ADD COLUMN IF NOT EXISTS RewardedAt TIMESTAMPTZ;
