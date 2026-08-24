/**
 * Convida (ou ativa) alguém no workspace.
 *
 *   pnpm db:invite ana@empresa.com
 *   pnpm db:invite ana@empresa.com --nome "Ana Souza" --time GERAL --admin
 *   pnpm db:invite ana@empresa.com --revogar
 *   pnpm db:invite ana@empresa.com --remover
 *   pnpm db:invite --dominio empresa.com.br
 *   pnpm db:invite --listar
 *
 * O cadastro é restrito a convidados (migração 0003): sem passar por aqui — ou
 * por um domínio liberado — a criação da conta é recusada pelo banco, inclusive
 * pelo painel do Supabase.
 *
 * Convidar cria o perfil já ativo. A pessoa então cria a conta em /login e o
 * trigger a liga a este perfil pelo e-mail, preservando o acesso concedido aqui.
 *
 * Roda por conexão direta ao Postgres, fora da RLS — é operação de admin.
 */
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

interface Options {
   email?: string;
   nome?: string;
   time?: string;
   admin: boolean;
   revogar: boolean;
   remover: boolean;
   listar: boolean;
   dominio?: string;
   removerDominio: boolean;
}

function parseArgs(argv: string[]): Options {
   const opts: Options = {
      admin: false,
      revogar: false,
      remover: false,
      listar: false,
      removerDominio: false,
   };

   for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--admin') opts.admin = true;
      else if (arg === '--revogar') opts.revogar = true;
      else if (arg === '--remover') opts.remover = true;
      else if (arg === '--listar') opts.listar = true;
      else if (arg === '--nome') opts.nome = argv[++i];
      else if (arg === '--time') opts.time = argv[++i];
      else if (arg === '--dominio') opts.dominio = argv[++i];
      else if (arg === '--remover-dominio') {
         opts.dominio = argv[++i];
         opts.removerDominio = true;
      } else if (!arg.startsWith('--')) opts.email = arg;
   }

   return opts;
}

function connectionString(): string {
   const url = process.env.DATABASE_URL;
   if (!url) {
      console.error('DATABASE_URL não definida em .env.local.');
      process.exit(1);
   }
   return url;
}

async function listar(client: Client) {
   const { rows } = await client.query<{
      email: string;
      name: string;
      role: string;
      is_active: boolean;
      has_login: boolean;
      teams: string | null;
   }>(`
      select p.email,
             p.name,
             p.role,
             p.is_active,
             (p.user_id is not null) as has_login,
             string_agg(tm.team_id, ', ' order by tm.team_id) as teams
        from public.profiles p
        left join public.team_members tm on tm.profile_id = p.id
       group by p.id
       order by p.is_active desc, p.name
   `);

   if (rows.length === 0) {
      console.log('Nenhum membro cadastrado ainda.');
      return;
   }

   console.log('acesso  login  papel   times            e-mail');
   for (const r of rows) {
      console.log(
         `${(r.is_active ? 'ativo ' : 'INATIVO').padEnd(7)} ` +
            `${(r.has_login ? 'sim ' : 'não ').padEnd(6)} ` +
            `${r.role.padEnd(7)} ` +
            `${(r.teams ?? '—').padEnd(16)} ` +
            `${r.email}`
      );
   }

   const inativos = rows.filter((r) => !r.is_active).length;
   if (inativos > 0) {
      console.log(
         `\n${inativos} perfil(is) inativo(s) — criaram conta mas não têm acesso a nada.` +
            '\nPara liberar: pnpm db:invite <email>'
      );
   }

   const { rows: dominios } = await client.query<{ domain: string; note: string | null }>(
      'select domain, note from public.allowed_domains order by domain'
   );

   console.log('\nDomínios liberados (convite por organização):');
   if (dominios.length === 0) {
      console.log('  (nenhum) — só entra quem for convidado individualmente');
   } else {
      for (const d of dominios) {
         console.log(`  @${d.domain}${d.note ? `  — ${d.note}` : ''}`);
      }
   }
}

async function gerenciarDominio(client: Client, dominio: string, remover: boolean) {
   const d = dominio.replace(/^@/, '').toLowerCase();

   if (remover) {
      const { rowCount } = await client.query(
         'delete from public.allowed_domains where domain = $1',
         [d]
      );
      if (rowCount === 0) {
         console.error(`@${d} não estava liberado.`);
         process.exit(1);
      }
      console.log(`✓ @${d} removido`);
      console.log('  Quem já tem conta continua com acesso — use --revogar para tirar.');
      return;
   }

   await client.query(
      `insert into public.allowed_domains (domain) values ($1) on conflict do nothing`,
      [d]
   );
   console.log(`✓ @${d} liberado`);
   console.log(`  Qualquer e-mail @${d} pode criar conta e já entra ativo.`);
}

async function removerConvite(client: Client, email: string) {
   const { rows } = await client.query<{ user_id: string | null }>(
      'select user_id from public.profiles where lower(email) = lower($1)',
      [email]
   );

   if (rows.length === 0) {
      console.error(`Nenhum perfil com o e-mail ${email}.`);
      process.exit(1);
   }

   if (rows[0].user_id) {
      console.error(
         `${email} já tem conta de login — remover o perfil deixaria a conta órfã.\n` +
            'Use --revogar para tirar o acesso mantendo o histórico.'
      );
      process.exit(1);
   }

   await client.query('delete from public.profiles where lower(email) = lower($1)', [email]);
   console.log(`✓ convite de ${email} removido`);
}

async function revogar(client: Client, email: string) {
   const { rowCount } = await client.query(
      `update public.profiles set is_active = false where lower(email) = lower($1)`,
      [email]
   );

   if (rowCount === 0) {
      console.error(`Nenhum perfil com o e-mail ${email}.`);
      process.exit(1);
   }

   console.log(`✓ acesso de ${email} revogado`);
   console.log('  A conta de login continua existindo, mas não enxerga mais o workspace.');
}

async function convidar(client: Client, opts: Options) {
   const email = opts.email!.toLowerCase();
   const nome = opts.nome ?? email.split('@')[0];
   const role = opts.admin ? 'Admin' : 'Member';

   const { rows } = await client.query<{ id: string; user_id: string | null; existia: boolean }>(
      `insert into public.profiles (email, name, role, is_active)
       values ($1, $2, $3, true)
       on conflict (email) do update
          set is_active = true,
              role = excluded.role,
              name = case
                        when $4::boolean then excluded.name
                        else public.profiles.name
                     end
       returning id, user_id, (xmax <> 0) as existia`,
      [email, nome, role, opts.nome !== undefined]
   );

   const { id, user_id, existia } = rows[0];
   console.log(existia ? `✓ ${email} reativado` : `✓ ${email} convidado`);
   console.log(`  papel: ${role}`);

   if (opts.time) {
      const { rowCount } = await client.query(
         `insert into public.team_members (team_id, profile_id)
          select $1, $2
           where exists (select 1 from public.teams where id = $1)
             on conflict do nothing`,
         [opts.time, id]
      );
      if (rowCount === 0) {
         const { rows: teams } = await client.query<{ id: string }>(
            'select id from public.teams order by id'
         );
         console.log(
            `  ⚠ time "${opts.time}" não existe ou a pessoa já estava nele.` +
               ` Times disponíveis: ${teams.map((t) => t.id).join(', ') || '(nenhum)'}`
         );
      } else {
         console.log(`  time: ${opts.time}`);
      }
   }

   console.log(
      user_id
         ? '  já tem conta de login — o acesso vale imediatamente'
         : '  ainda sem conta de login: ao se cadastrar com este e-mail, o acesso é aplicado'
   );
}

async function main() {
   const opts = parseArgs(process.argv.slice(2));

   if (!opts.listar && !opts.email && !opts.dominio) {
      console.error(
         'Uso:\n' +
            '  pnpm db:invite <email> [--nome "Nome"] [--time ID] [--admin]\n' +
            '  pnpm db:invite <email> --revogar          tira o acesso, mantém a conta\n' +
            '  pnpm db:invite <email> --remover          apaga convite ainda não usado\n' +
            '  pnpm db:invite --dominio empresa.com.br   libera a organização inteira\n' +
            '  pnpm db:invite --remover-dominio empresa.com.br\n' +
            '  pnpm db:invite --listar'
      );
      process.exit(1);
   }

   const client = new Client({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
   });
   await client.connect();

   try {
      if (opts.listar) await listar(client);
      else if (opts.dominio) await gerenciarDominio(client, opts.dominio, opts.removerDominio);
      else if (opts.revogar) await revogar(client, opts.email!);
      else if (opts.remover) await removerConvite(client, opts.email!);
      else await convidar(client, opts);
   } finally {
      await client.end();
   }
}

main().catch((err) => {
   console.error(err instanceof Error ? err.message : err);
   process.exit(1);
});
