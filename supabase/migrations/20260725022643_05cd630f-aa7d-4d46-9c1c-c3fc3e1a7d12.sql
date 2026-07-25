
ALTER FUNCTION public.is_following(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.record_item_wear(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.remove_item_wear(uuid) SECURITY INVOKER;
ALTER FUNCTION public.record_outfit_wear(uuid) SECURITY INVOKER;
ALTER FUNCTION public.remove_outfit_wear(uuid) SECURITY INVOKER;
