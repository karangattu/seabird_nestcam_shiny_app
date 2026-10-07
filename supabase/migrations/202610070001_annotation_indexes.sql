-- Run this file in the Supabase SQL editor for an existing database.
-- These indexes support annotation pages, filters, and CSV exports.
CREATE INDEX IF NOT EXISTS idx_annotations_created_id ON public.annotations (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_camera_created_id ON public.annotations (camera, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_site_created_id ON public.annotations (site, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_date_created_id ON public.annotations (retrieval_date, created_at DESC, id DESC);
