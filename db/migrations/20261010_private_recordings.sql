-- Apply only after the protected recording/image readers have been deployed.
UPDATE storage.buckets SET public=false, file_size_limit=20971520 WHERE id='recordings';
