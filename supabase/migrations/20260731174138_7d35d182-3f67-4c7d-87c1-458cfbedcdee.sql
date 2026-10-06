REVOKE EXECUTE ON FUNCTION public.link_roster_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_roster_on_enrollment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_roster_spot_for_user() FROM PUBLIC, anon, authenticated;