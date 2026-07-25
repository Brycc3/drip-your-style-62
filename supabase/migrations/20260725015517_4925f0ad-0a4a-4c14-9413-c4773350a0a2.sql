
CREATE TABLE public.content_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('outfit','user','comment','shop_item','broken_link','other')),
  target_id text,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed can file reports"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id OR reporter_id IS NULL);

CREATE POLICY "reporter can read own"
  ON public.content_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

CREATE TRIGGER content_reports_touch
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.user_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own blocks"
  ON public.user_blocks FOR ALL TO authenticated
  USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);
