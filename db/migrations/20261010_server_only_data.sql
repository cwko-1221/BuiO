-- Platform authentication is enforced by the Node backend, not Supabase Auth.
-- Keep postgres/service_role access; close browser Data API access, including
-- sequences and defaults for future tables created by the backend owner.
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.relname);
  END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Separate new lesson images from private student recordings. Existing images
-- remain readable through the authenticated legacy-image route, without moving
-- object metadata independently of the underlying Storage objects.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES ('question-images','question-images',true,20971520)
ON CONFLICT(id) DO NOTHING;
