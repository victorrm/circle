-- ============================================================================
-- Acesso por pertencimento, não por autenticação
--
-- A 0001 tratava "estar autenticado" como fronteira de segurança. Isso só vale
-- se o cadastro for fechado — e o cadastro público do Supabase vem ligado por
-- padrão, então qualquer pessoa criava conta e enxergava o workspace inteiro.
-- A chave publishable vai no bundle do navegador por natureza, então esconder
-- a chave nunca foi opção.
--
-- Agora existe um segundo portão: `profiles.is_active`. Quem cria conta sem ter
-- sido convidado ganha um perfil inativo, e a RLS não lhe mostra nada. Isso vale
-- mesmo com o cadastro público aberto.
-- ============================================================================

alter table public.profiles
   add column is_active boolean not null default false;

comment on column public.profiles.is_active is
   'Libera o acesso ao workspace. Falso por padrão: cadastro sozinho não dá acesso, é preciso ser convidado (scripts/invite.ts) ou ativado por um admin.';

-- Quem já existia antes desta migração continua com acesso.
update public.profiles set is_active = true;

-- ---------------------------------------------------------------------------
-- Portão de acesso
-- ---------------------------------------------------------------------------

/*
 * SECURITY DEFINER de propósito: a função lê `profiles`, que é justamente a
 * tabela protegida pelas políticas abaixo. Sem isso, verificar o acesso exigiria
 * ter acesso — recursão infinita de RLS.
 *
 * STABLE deixa o Postgres avaliar uma vez por consulta em vez de por linha.
 */
create or replace function public.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
   select exists (
      select 1
        from public.profiles p
       where p.user_id = auth.uid()
         and p.is_active
   );
$$;

revoke all on function public.is_workspace_member() from public;
grant execute on function public.is_workspace_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas: troca `true` por `is_workspace_member()`
-- ---------------------------------------------------------------------------

drop policy if exists rw_teams          on public.teams;
drop policy if exists rw_team_members   on public.team_members;
drop policy if exists rw_cycles         on public.cycles;
drop policy if exists rw_projects       on public.projects;
drop policy if exists rw_project_labels on public.project_labels;
drop policy if exists rw_issues         on public.issues;
drop policy if exists rw_issue_labels   on public.issue_labels;
drop policy if exists write_labels      on public.labels;

create policy rw_teams on public.teams
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_team_members on public.team_members
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_cycles on public.cycles
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_projects on public.projects
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_project_labels on public.project_labels
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_issues on public.issues
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy rw_issue_labels on public.issue_labels
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());
create policy write_labels on public.labels
   for all to authenticated
   using (public.is_workspace_member()) with check (public.is_workspace_member());

-- Perfis: cada um sempre enxerga o próprio (senão nem descobriria que está
-- inativo); a lista completa de membros só para quem faz parte do workspace.
drop policy if exists read_profiles   on public.profiles;
drop policy if exists insert_profiles on public.profiles;

create policy read_profiles on public.profiles
   for select to authenticated
   using (user_id = auth.uid() or public.is_workspace_member());

-- Perfis nascem pelo trigger de signup ou pelo script de convite, que rodam com
-- conexão direta. Cliente não cria perfil.
create policy insert_profiles on public.profiles
   for insert to authenticated
   with check (public.is_workspace_member());

-- `is_active` não pode ser auto-concedido: a política de update já restringe à
-- própria linha, mas sem isto a pessoa se promoveria sozinha.
drop policy if exists update_own_profile on public.profiles;
create policy update_own_profile on public.profiles
   for update to authenticated
   using (user_id = auth.uid())
   with check (
      user_id = auth.uid()
      and is_active = (select p.is_active from public.profiles p where p.user_id = auth.uid())
   );

-- ---------------------------------------------------------------------------
-- Trigger de signup
-- ---------------------------------------------------------------------------

/*
 * Some o `on conflict do update` do caminho de criação: ele deixava um cadastro
 * novo sequestrar um perfil convidado de mesmo e-mail que já tivesse dono.
 * O convite continua funcionando pelo primeiro UPDATE, que exige user_id nulo.
 */
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
   -- Caso convite: perfil já existe, sem dono. Mantém o is_active dele.
   update public.profiles
      set user_id = new.id,
          avatar_url = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
    where lower(email) = lower(new.email)
      and user_id is null;

   if not found then
      -- Cadastro espontâneo: ganha identidade, mas inativo — sem acesso a nada
      -- até um admin ativar.
      insert into public.profiles (user_id, email, name, avatar_url, is_active)
      values (
         new.id,
         new.email,
         coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
         new.raw_user_meta_data ->> 'avatar_url',
         false
      )
      on conflict (email) do nothing;
   end if;

   return new;
end;
$$;
