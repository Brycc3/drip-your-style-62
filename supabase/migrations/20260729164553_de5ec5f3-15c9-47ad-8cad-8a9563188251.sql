
-- Atomic: block another user and clear follows in either direction.
CREATE OR REPLACE FUNCTION public.block_and_unfollow(_blocked uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _blocked = _me THEN RAISE EXCEPTION 'cannot block yourself'; END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (_me, _blocked)
  ON CONFLICT DO NOTHING;
  DELETE FROM public.follows
  WHERE (follower_id = _me AND followee_id = _blocked)
     OR (follower_id = _blocked AND followee_id = _me);
END $$;
REVOKE ALL ON FUNCTION public.block_and_unfollow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_and_unfollow(uuid) TO authenticated;

-- Admin: hide a public outfit by flipping visibility back to private and
-- dropping its public slug. Does not touch closet content.
CREATE OR REPLACE FUNCTION public.admin_hide_outfit(_outfit uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.saved_outfits
     SET visibility = 'private', share_slug = NULL
   WHERE id = _outfit;
  INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, details, status, reviewed_at, reviewed_by, resolution_note)
  VALUES (auth.uid(), 'outfit', _outfit::text, 'admin_hide', _note, 'actioned', now(), auth.uid(), COALESCE(_note, 'Outfit hidden by admin'));
END $$;
REVOKE ALL ON FUNCTION public.admin_hide_outfit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_outfit(uuid, text) TO authenticated;

-- Admin: remove any public comment.
CREATE OR REPLACE FUNCTION public.admin_delete_comment(_comment uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _outfit uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT outfit_id INTO _outfit FROM public.outfit_comments WHERE id = _comment;
  DELETE FROM public.outfit_comments WHERE id = _comment;
  INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, details, status, reviewed_at, reviewed_by, resolution_note)
  VALUES (auth.uid(), 'comment', _comment::text, 'admin_delete', _note, 'actioned', now(), auth.uid(), COALESCE(_note, 'Comment removed by admin'));
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_comment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_comment(uuid, text) TO authenticated;

-- Admin: toggle a profile's public visibility.
CREATE OR REPLACE FUNCTION public.admin_set_suspension(_target uuid, _suspend boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.profiles SET public_suspended = _suspend WHERE id = _target;
  INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, details, status, reviewed_at, reviewed_by, resolution_note)
  VALUES (auth.uid(), 'user', _target::text,
          CASE WHEN _suspend THEN 'admin_suspend' ELSE 'admin_restore' END,
          _note, 'actioned', now(), auth.uid(),
          COALESCE(_note, CASE WHEN _suspend THEN 'Profile suspended by admin' ELSE 'Profile restored by admin' END));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_suspension(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_suspension(uuid, boolean, text) TO authenticated;

-- Admin: update a report's status (mark reviewed / dismissed / actioned).
CREATE OR REPLACE FUNCTION public.admin_update_report(_report uuid, _status text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _status NOT IN ('open','reviewed','dismissed','actioned') THEN
    RAISE EXCEPTION 'invalid status %', _status;
  END IF;
  UPDATE public.content_reports
     SET status = _status,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         resolution_note = COALESCE(_note, resolution_note)
   WHERE id = _report;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_report(uuid, text, text) TO authenticated;

-- Refresh the public feed view so suspended authors are always excluded even
-- if RLS on saved_outfits were bypassed (defense in depth).
CREATE OR REPLACE VIEW public.outfit_leaderboard
WITH (security_invoker = true) AS
SELECT o.id,
       o.user_id,
       o.name,
       o.cover_image_url,
       o.occasion,
       o.vibe,
       o.share_slug,
       o.created_at,
       COALESCE((SELECT count(*) FROM public.outfit_likes l WHERE l.outfit_id = o.id), 0)::bigint AS like_count,
       COALESCE((SELECT count(*) FROM public.outfit_comments c WHERE c.outfit_id = o.id), 0)::bigint AS comment_count,
       COALESCE((SELECT sum(exp((-EXTRACT(epoch FROM now() - l.created_at)) / 259200.0))
                   FROM public.outfit_likes l WHERE l.outfit_id = o.id), 0::numeric)::double precision AS trending_score
  FROM public.saved_outfits o
  JOIN public.profiles p ON p.id = o.user_id
 WHERE o.visibility = 'public'
   AND COALESCE(p.public_suspended, false) = false;

GRANT SELECT ON public.outfit_leaderboard TO authenticated, anon;
