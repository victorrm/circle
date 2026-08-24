-- ============================================================================
-- Cadastro apenas por convite
--
-- A 0002 impedia que um cadastro não convidado ENXERGASSE algo, mas a conta
-- ainda era criada. Agora a criação em si é recusada.
--
-- A regra vale para qualquer caminho — formulário público, API de admin ou
-- painel do Supabase — porque mora no banco, não numa configuração da
-- plataforma que possa ser revertida sem querer.
--
-- Duas formas de entrar, como pedido:
--   individual   — perfil pré-criado com o e-mail (scripts/invite.ts)
--   organização  — domínio na allowlist (ex.: todo @empresa.com.br)
-- ============================================================================

create table public.allowed_domains (
   -- Sem o '@'. Ex.: 'tidebreakers.com.br'
   domain     text primary key check (domain = lower(domain) and domain not like '@%'),
   note       text,
   created_at timestamptz not null default now()
);

comment on table public.allowed_domains is
   'Convite por organização: qualquer e-mail nestes domínios pode criar conta e já entra ativo. Vazio = somente convite individual.';

alter table public.allowed_domains enable row level security;

create policy read_allowed_domains on public.allowed_domains
   for select to authenticated using (public.is_workspace_member());

-- Escrita só por conexão direta (scripts/invite.ts): conceder um domínio
-- inteiro é operação de administração, não de aplicação.

-- ---------------------------------------------------------------------------
-- Portão de criação de conta
-- ---------------------------------------------------------------------------

create or replace function public.email_is_invited(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
   select
      -- Convite individual: perfil já existe para este e-mail.
      exists (select 1 from public.profiles where lower(email) = lower(p_email))
      -- Convite por organização: domínio liberado.
      or exists (
         select 1 from public.allowed_domains
          where domain = lower(split_part(p_email, '@', 2))
      );
$$;

/*
 * BEFORE INSERT em auth.users: recusa a conta antes de existir.
 *
 * O primeiro usuário é liberado incondicionalmente — sem isso o workspace ficaria
 * impossível de inaugurar (ninguém para convidar ninguém). A partir do segundo,
 * a regra vale para todos.
 */
create or replace function public.enforce_invite_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
   if (select count(*) from auth.users) = 0 then
      return new;
   end if;

   if not public.email_is_invited(new.email) then
      raise exception 'Cadastro apenas por convite: % não foi convidado', new.email
         using errcode = 'check_violation',
               hint = 'Peça a um administrador para rodar: pnpm db:invite <email>';
   end if;

   return new;
end;
$$;

create trigger on_auth_user_invite_check before insert on auth.users
   for each row execute function public.enforce_invite_only();

-- ---------------------------------------------------------------------------
-- Ativação de quem entra por domínio
-- ---------------------------------------------------------------------------

/*
 * Quem chega por convite individual já tem perfil ativo e é só vincular.
 * Quem chega por domínio não tem perfil — e agora nasce ATIVO, porque passou
 * pelo portão. O caso de perfil inativo deixa de acontecer em cadastros novos;
 * a coluna segue existindo para revogar acesso de quem já entrou.
 */
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
   v_first boolean;
begin
   -- Só o primeiro usuário do sistema entra sem convite (bootstrap).
   v_first := (select count(*) from auth.users) <= 1;

   -- Convite individual: perfil existe, sem dono. Preserva o is_active dele.
   update public.profiles
      set user_id = new.id,
          avatar_url = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
    where lower(email) = lower(new.email)
      and user_id is null;

   if not found then
      insert into public.profiles (user_id, email, name, avatar_url, is_active, role)
      values (
         new.id,
         new.email,
         coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
         new.raw_user_meta_data ->> 'avatar_url',
         true,
         -- Quem inaugura o workspace precisa poder administrar.
         case when v_first then 'Admin' else 'Member' end
      )
      on conflict (email) do nothing;
   end if;

   return new;
end;
$$;
