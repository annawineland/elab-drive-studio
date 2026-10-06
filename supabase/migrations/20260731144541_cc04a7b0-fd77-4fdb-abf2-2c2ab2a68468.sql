create or replace function public.join_team_by_code(_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into _team_id from public.teams where join_code = upper(trim(_code));
  if _team_id is null then
    raise exception 'Invalid join code';
  end if;
  insert into public.team_members (team_id, user_id)
  values (_team_id, auth.uid())
  on conflict (team_id, user_id) do nothing;
  return _team_id;
end;
$$;
revoke execute on function public.join_team_by_code(text) from anon, public;
grant execute on function public.join_team_by_code(text) to authenticated;