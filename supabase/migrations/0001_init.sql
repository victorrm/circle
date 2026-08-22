-- ============================================================================
-- Circle — schema inicial
--
-- Convenções:
--   * Tabelas de referência (statuses, priorities, project_healths, labels) são
--     semeadas aqui mesmo. Os ícones continuam no código (mock-data/*.tsx),
--     ligados por id — o banco guarda só o id, nunca o componente React.
--   * `profiles` NÃO é filha de auth.users. Um membro pode existir antes de ter
--     conta (fluxo de convite); o vínculo acontece no primeiro login, por e-mail.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas de referência
-- ---------------------------------------------------------------------------

create table public.statuses (
   id       text primary key,
   name     text not null,
   color    text not null,
   category text not null check (
      category in ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled')
   ),
   position smallint not null
);

insert into public.statuses (id, name, color, category, position) values
   ('in-progress',      'In Progress',      '#facc15', 'started',   0),
   ('technical-review', 'Technical Review', '#22c55e', 'started',   1),
   ('done',             'Done',             '#5e6ad2', 'completed', 2),
   ('paused',           'Paused',           '#26b5ce', 'started',   3),
   ('to-do',            'Todo',             '#99a2b2', 'unstarted', 4),
   ('backlog',          'Backlog',          '#95a2b3', 'backlog',   5),
   ('triage',           'Triage',           '#f2790f', 'triage',    6),
   ('idea',             'Idea',             '#5e6ad2', 'backlog',   7),
   ('product-feedback', 'Product Feedback', '#f2994a', 'started',   8),
   ('blocked',          'Blocked',          '#eb5757', 'started',   9),
   ('shipped',          'Shipped',          '#4cb782', 'completed', 10),
   ('canceled',         'Canceled',         '#95a2b3', 'canceled',  11),
   ('duplicate',        'Duplicate',        '#95a2b3', 'canceled',  12);

create table public.priorities (
   id       text primary key,
   name     text not null,
   position smallint not null
);

insert into public.priorities (id, name, position) values
   ('no-priority', 'No priority', 0),
   ('urgent',      'Urgent',      1),
   ('high',        'High',        2),
   ('medium',      'Medium',      3),
   ('low',         'Low',         4);

create table public.project_healths (
   id          text primary key,
   name        text not null,
   color       text not null,
   description text not null
);

insert into public.project_healths (id, name, color, description) values
   ('no-update', 'No Update', '#8f9299', 'The project has not been updated in the last 30 days.'),
   ('off-track', 'Off Track', '#eb5757', 'The project is not on track and may be delayed.'),
   ('on-track',  'On Track',  '#4cb782', 'The project is on track and on schedule.'),
   ('at-risk',   'At Risk',   '#f2c94c', 'The project is at risk and may be delayed.');

create table public.labels (
   id    text primary key,
   name  text not null,
   color text not null
);

insert into public.labels (id, name, color) values
   ('ui',                   'UI Enhancement',       'purple'),
   ('bug',                  'Bug',                  'red'),
   ('feature',              'Feature',              'green'),
   ('documentation',        'Documentation',        'blue'),
   ('refactor',             'Refactor',             'yellow'),
   ('performance',          'Performance',          'orange'),
   ('design',               'Design',               'pink'),
   ('security',             'Security',             'gray'),
   ('accessibility',        'Accessibility',        'indigo'),
   ('testing',              'Testing',              'teal'),
   ('internationalization', 'Internationalization',  'cyan');

-- ---------------------------------------------------------------------------
-- Membros
-- ---------------------------------------------------------------------------

create table public.profiles (
   id          uuid primary key default gen_random_uuid(),
   -- Nulo enquanto a pessoa não tiver conta. Preenchido no primeiro login.
   user_id     uuid unique references auth.users (id) on delete set null,
   email       text unique not null,
   name        text not null,
   avatar_url  text,
   role        text not null default 'Member'
                  check (role in ('Member', 'Admin', 'Guest', 'Application')),
   status      text not null default 'offline'
                  check (status in ('online', 'offline', 'away')),
   timezone    text not null default 'UTC',
   joined_date date not null default current_date,
   created_at  timestamptz not null default now(),
   updated_at  timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles (user_id);

-- ---------------------------------------------------------------------------
-- Times
-- ---------------------------------------------------------------------------

create table public.teams (
   id            text primary key,            -- 'CORE', 'DESIGN', ...
   name          text not null,
   icon          text not null default '📋',  -- emoji
   color         text not null default '#5e6ad2',
   -- Prefixo dos identificadores de issue ('LNUI' → LNUI-701) e contador.
   issue_prefix  text not null,
   issue_counter integer not null default 0,
   created_at    timestamptz not null default now()
);

create table public.team_members (
   team_id    text not null references public.teams (id) on delete cascade,
   profile_id uuid not null references public.profiles (id) on delete cascade,
   joined_at  timestamptz not null default now(),
   primary key (team_id, profile_id)
);

create index team_members_profile_idx on public.team_members (profile_id);

-- ---------------------------------------------------------------------------
-- Ciclos (sprints)
-- ---------------------------------------------------------------------------

create table public.cycles (
   id         uuid primary key default gen_random_uuid(),
   number     integer not null,
   name       text not null,
   team_id    text not null references public.teams (id) on delete cascade,
   status     text not null check (status in ('planned', 'upcoming', 'current', 'completed')),
   start_date date not null,
   end_date   date not null,
   capacity   smallint not null default 100,
   created_at timestamptz not null default now(),
   unique (team_id, number),
   check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Projetos
-- ---------------------------------------------------------------------------

create table public.projects (
   id                       uuid primary key default gen_random_uuid(),
   name                     text not null,
   description              text not null default '',
   -- Nome do ícone lucide-react ou remixicon, resolvido no cliente.
   icon                     text not null default 'Box',
   status_id                text not null references public.statuses (id),
   priority_id              text not null references public.priorities (id),
   health_id                text not null references public.project_healths (id)
                               default 'no-update',
   team_id                  text references public.teams (id) on delete set null,
   lead_id                  uuid references public.profiles (id) on delete set null,
   percent_complete         smallint not null default 0
                               check (percent_complete between 0 and 100),
   start_date               date not null default current_date,
   target_date              date,
   initiative               text,
   health_updated_ago_days  smallint,
   created_at               timestamptz not null default now(),
   updated_at               timestamptz not null default now()
);

create index projects_team_idx on public.projects (team_id);

create table public.project_labels (
   project_id uuid not null references public.projects (id) on delete cascade,
   label_id   text not null references public.labels (id) on delete cascade,
   primary key (project_id, label_id)
);

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------

create table public.issues (
   id          uuid primary key default gen_random_uuid(),
   -- Gerado pelo trigger abaixo a partir do prefixo do time.
   identifier  text unique not null,
   title       text not null,
   description text not null default '',
   team_id     text not null references public.teams (id) on delete cascade,
   status_id   text not null references public.statuses (id),
   priority_id text not null references public.priorities (id) default 'no-priority',
   project_id  uuid references public.projects (id) on delete set null,
   cycle_id    uuid references public.cycles (id) on delete set null,
   assignee_id uuid references public.profiles (id) on delete set null,
   creator_id  uuid references public.profiles (id) on delete set null,
   parent_id   uuid references public.issues (id) on delete set null,
   -- Ordenação LexoRank dentro das colunas do board.
   rank        text not null,
   due_date    date,
   created_at  timestamptz not null default now(),
   updated_at  timestamptz not null default now()
);

create index issues_team_idx     on public.issues (team_id);
create index issues_status_idx   on public.issues (status_id);
create index issues_assignee_idx on public.issues (assignee_id);
create index issues_project_idx  on public.issues (project_id);
create index issues_cycle_idx    on public.issues (cycle_id);
create index issues_parent_idx   on public.issues (parent_id);
create index issues_rank_idx     on public.issues (rank);

create table public.issue_labels (
   issue_id uuid not null references public.issues (id) on delete cascade,
   label_id text not null references public.labels (id) on delete cascade,
   primary key (issue_id, label_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at := now();
   return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
   for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
   for each row execute function public.touch_updated_at();
create trigger issues_touch before update on public.issues
   for each row execute function public.touch_updated_at();

-- Identificador da issue (LNUI-701) a partir do contador do time.
create or replace function public.assign_issue_identifier()
returns trigger
language plpgsql
as $$
declare
   v_prefix  text;
   v_counter integer;
begin
   if new.identifier is not null and new.identifier <> '' then
      return new;
   end if;

   update public.teams
      set issue_counter = issue_counter + 1
    where id = new.team_id
   returning issue_prefix, issue_counter into v_prefix, v_counter;

   if v_prefix is null then
      raise exception 'Time % não existe', new.team_id;
   end if;

   new.identifier := v_prefix || '-' || v_counter;
   return new;
end;
$$;

create trigger issues_assign_identifier before insert on public.issues
   for each row execute function public.assign_issue_identifier();

-- Vincula (ou cria) o profile quando alguém cria conta.
-- Se já existe um membro com aquele e-mail — caso do convite — só liga o user_id.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
   update public.profiles
      set user_id = new.id,
          avatar_url = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
    where lower(email) = lower(new.email)
      and user_id is null;

   if not found then
      insert into public.profiles (user_id, email, name, avatar_url)
      values (
         new.id,
         new.email,
         coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
         new.raw_user_meta_data ->> 'avatar_url'
      )
      on conflict (email) do update set user_id = excluded.user_id;
   end if;

   return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
   for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Modelo: workspace único e interno. Toda pessoa autenticada no projeto Supabase
-- lê e escreve o conteúdo. O que NÃO é livre: editar o perfil de outra pessoa.
-- As tabelas de referência são somente leitura pelo cliente.
-- ---------------------------------------------------------------------------

alter table public.statuses        enable row level security;
alter table public.priorities      enable row level security;
alter table public.project_healths enable row level security;
alter table public.labels          enable row level security;
alter table public.profiles        enable row level security;
alter table public.teams           enable row level security;
alter table public.team_members    enable row level security;
alter table public.cycles          enable row level security;
alter table public.projects        enable row level security;
alter table public.project_labels  enable row level security;
alter table public.issues          enable row level security;
alter table public.issue_labels    enable row level security;

-- Referência: leitura para autenticados, escrita só via migração.
create policy read_statuses   on public.statuses        for select to authenticated using (true);
create policy read_priorities on public.priorities      for select to authenticated using (true);
create policy read_healths    on public.project_healths for select to authenticated using (true);

-- Labels são editáveis pela UI (Settings → Issue labels).
create policy read_labels  on public.labels for select to authenticated using (true);
create policy write_labels on public.labels for all    to authenticated using (true) with check (true);

-- Perfis: todos leem; cada um edita apenas o próprio.
create policy read_profiles on public.profiles
   for select to authenticated using (true);
create policy update_own_profile on public.profiles
   for update to authenticated
   using (user_id = auth.uid())
   with check (user_id = auth.uid());
create policy insert_profiles on public.profiles
   for insert to authenticated with check (true);

-- Conteúdo do workspace: leitura e escrita para autenticados.
create policy rw_teams          on public.teams          for all to authenticated using (true) with check (true);
create policy rw_team_members   on public.team_members   for all to authenticated using (true) with check (true);
create policy rw_cycles         on public.cycles         for all to authenticated using (true) with check (true);
create policy rw_projects       on public.projects       for all to authenticated using (true) with check (true);
create policy rw_project_labels on public.project_labels for all to authenticated using (true) with check (true);
create policy rw_issues         on public.issues         for all to authenticated using (true) with check (true);
create policy rw_issue_labels   on public.issue_labels   for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime — mantém boards de pessoas diferentes em sincronia.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.issues;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.issue_labels;
