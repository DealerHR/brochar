/*
  # Storage RLS policies for brochure-assets bucket

  Allows:
  - Anyone to read (public bucket)
  - Authenticated users to upload/update files
*/

CREATE POLICY "Public read brochure-assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'brochure-assets');

CREATE POLICY "Authenticated upload brochure-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brochure-assets');

CREATE POLICY "Authenticated update brochure-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brochure-assets')
  WITH CHECK (bucket_id = 'brochure-assets');

CREATE POLICY "Authenticated delete brochure-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brochure-assets');
