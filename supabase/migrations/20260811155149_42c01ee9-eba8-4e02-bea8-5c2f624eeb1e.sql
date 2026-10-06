REVOKE ALL ON FUNCTION public.link_roster_for_user(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_roster_spot_for_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_roster_on_enrollment() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;