create type public.app_role as enum ('teacher', 'student');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select, insert on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can read own roles, teachers read all" on public.user_roles
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'teacher'));
create policy "Users assign their own role at onboarding" on public.user_roles
  for insert to authenticated with check (auth.uid() = user_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.mods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);
grant select on public.mods to authenticated;
grant all on public.mods to service_role;
alter table public.mods enable row level security;
create policy "Authenticated users can view mods" on public.mods for select to authenticated using (true);
insert into public.mods (name, sort_order) values
  ('Mod 1', 1), ('Mod 2', 2), ('Mod 3', 3), ('Mod 4', 4), ('Mod 5', 5), ('Mod 6', 6), ('Mod 7', 7);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid references public.mods(id) on delete set null,
  name text not null,
  client_name text not null default '',
  project_focus text not null default '',
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  current_stage text not null default 'kickoff',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member',
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);
grant select, insert, delete on public.team_members to authenticated;
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;

create or replace function public.is_team_member(_team_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id)
$$;

create policy "Members and teachers can view teams" on public.teams for select to authenticated
  using (public.has_role(auth.uid(), 'teacher') or public.is_team_member(id, auth.uid()) or created_by = auth.uid());
create policy "Teachers create teams" on public.teams for insert to authenticated
  with check (public.has_role(auth.uid(), 'teacher'));
create policy "Members and teachers update teams" on public.teams for update to authenticated
  using (public.has_role(auth.uid(), 'teacher') or public.is_team_member(id, auth.uid()));
create policy "Teachers delete teams" on public.teams for delete to authenticated
  using (public.has_role(auth.uid(), 'teacher'));

create policy "Members and teachers view membership" on public.team_members for select to authenticated
  using (public.has_role(auth.uid(), 'teacher') or public.is_team_member(team_id, auth.uid()) or user_id = auth.uid());
create policy "Students join themselves, teachers add anyone" on public.team_members for insert to authenticated
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));
create policy "Teachers and self can leave" on public.team_members for delete to authenticated
  using (public.has_role(auth.uid(), 'teacher') or user_id = auth.uid());

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid references public.mods(id) on delete cascade,
  title text not null,
  description text not null default '',
  stage text not null default '',
  mission_date date not null default current_date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.missions to authenticated;
grant all on public.missions to service_role;
alter table public.missions enable row level security;
create policy "Authenticated users can view missions" on public.missions for select to authenticated using (true);
create policy "Teachers manage missions" on public.missions for all to authenticated
  using (public.has_role(auth.uid(), 'teacher')) with check (public.has_role(auth.uid(), 'teacher'));

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  entry_type text not null default 'notebook',
  title text not null,
  content text not null default '',
  stage text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.entries to authenticated;
grant all on public.entries to service_role;
alter table public.entries enable row level security;
create policy "Students manage own entries, teachers read all" on public.entries for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));
create policy "Students create own entries" on public.entries for insert to authenticated
  with check (user_id = auth.uid());
create policy "Students update own entries" on public.entries for update to authenticated
  using (user_id = auth.uid());
create policy "Students delete own entries" on public.entries for delete to authenticated
  using (user_id = auth.uid());

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null,
  description text not null default '',
  evidence_type text not null default 'link',
  url text not null default '',
  stage text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.evidence to authenticated;
grant all on public.evidence to service_role;
alter table public.evidence enable row level security;
create policy "Owners, teammates, and teachers can view evidence" on public.evidence for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher') or (team_id is not null and public.is_team_member(team_id, auth.uid())));
create policy "Students add own evidence" on public.evidence for insert to authenticated
  with check (user_id = auth.uid());
create policy "Owners update evidence" on public.evidence for update to authenticated using (user_id = auth.uid());
create policy "Owners delete evidence" on public.evidence for delete to authenticated using (user_id = auth.uid());

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  goal text not null default '',
  start_date date,
  end_date date,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sprints to authenticated;
grant all on public.sprints to service_role;
alter table public.sprints enable row level security;
create policy "Members and teachers view sprints" on public.sprints for select to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));
create policy "Members manage sprints" on public.sprints for all to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'))
  with check (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  sprint_id uuid references public.sprints(id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'todo',
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "Members and teachers view tasks" on public.tasks for select to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));
create policy "Members manage tasks" on public.tasks for all to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'))
  with check (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));

create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  meeting_date date not null default current_date,
  attendees text not null default '',
  notes text not null default '',
  decisions text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.meeting_minutes to authenticated;
grant all on public.meeting_minutes to service_role;
alter table public.meeting_minutes enable row level security;
create policy "Members and teachers view minutes" on public.meeting_minutes for select to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));
create policy "Members manage minutes" on public.meeting_minutes for all to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'))
  with check (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  description text not null,
  likelihood text not null default 'medium',
  impact text not null default 'medium',
  mitigation text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.risks to authenticated;
grant all on public.risks to service_role;
alter table public.risks enable row level security;
create policy "Members and teachers view risks" on public.risks for select to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));
create policy "Members manage risks" on public.risks for all to authenticated
  using (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'))
  with check (public.is_team_member(team_id, auth.uid()) or public.has_role(auth.uid(), 'teacher'));

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  kind text not null default 'supply',
  item text not null,
  details text not null default '',
  quantity text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.requests to authenticated;
grant all on public.requests to service_role;
alter table public.requests enable row level security;
create policy "Students view own requests, teachers view all" on public.requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));
create policy "Students create requests" on public.requests for insert to authenticated
  with check (user_id = auth.uid());
create policy "Students edit pending own requests, teachers update status" on public.requests for update to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.has_role(auth.uid(), 'teacher'));
create policy "Students delete pending own requests" on public.requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;
create policy "Teachers read all feedback, students read theirs" on public.feedback for select to authenticated
  using (author_id = auth.uid() or target_user_id = auth.uid() or public.has_role(auth.uid(), 'teacher')
    or (team_id is not null and public.is_team_member(team_id, auth.uid())));
create policy "Teachers write feedback" on public.feedback for insert to authenticated
  with check (public.has_role(auth.uid(), 'teacher') and author_id = auth.uid());

create table public.app_user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connector_id text not null,
  connection_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_id)
);
grant select, insert, update, delete on public.app_user_connections to service_role;
alter table public.app_user_connections enable row level security;