GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_mod_member(uuid, uuid) TO authenticated, anon;