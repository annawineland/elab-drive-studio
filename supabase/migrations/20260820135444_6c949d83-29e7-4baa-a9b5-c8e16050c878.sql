REVOKE EXECUTE ON FUNCTION public.link_roster_for_user(uuid, text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.link_roster_on_enrollment() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_roster_spot_for_user() FROM authenticated, anon, public;