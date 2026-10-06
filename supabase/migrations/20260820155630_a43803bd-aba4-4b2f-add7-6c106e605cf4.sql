drop policy if exists "Students join themselves, teachers add anyone" on public.team_members;

create policy "Teachers can add team members directly" on public.team_members for insert to authenticated
  with check (public.has_role(auth.uid(), 'teacher'));

grant execute on function public.join_team_by_code(text) to authenticated;
revoke execute on function public.join_team_by_code(text) from anon, public;
