REVOKE ALL ON FUNCTION public.is_following(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_following(uuid, uuid) TO authenticated, service_role;