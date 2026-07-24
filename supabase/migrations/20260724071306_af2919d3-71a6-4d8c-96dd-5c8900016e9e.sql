ALTER TABLE public.outfit_feedback ADD COLUMN IF NOT EXISTS snapshot JSONB;
CREATE INDEX IF NOT EXISTS outfit_feedback_user_created_idx ON public.outfit_feedback (user_id, created_at DESC);