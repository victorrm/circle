/**
 * Seed do workspace.
 *
 *   pnpm db:seed          cria um workspace vazio, pronto para uso real
 *   pnpm db:seed --demo   carrega também o dataset de exemplo do repositório
 *
 * O modo padrão é deliberadamente mínimo: um time, nenhuma issue. Carregar as
 * ~250 issues de exemplo (todas sobre uma biblioteca de componentes) num
 * workspace que vai ser usado de verdade só gera ruído para apagar depois.
 * Use --demo apenas para explorar a interface cheia.
 */
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

const TEAM = {
   id: process.env.SEED_TEAM_ID ?? 'GERAL',
   name: process.env.SEED_TEAM_NAME ?? 'Time Geral',
   prefix: process.env.SEED_TEAM_PREFIX ?? 'GER',
   icon: '📋',
   color: '#5e6ad2',
};

function connectionString(): string {
   const url = process.env.DATABASE_URL;
   if (!url) {
      console.error('DATABASE_URL não definida em .env.local.');
      process.exit(1);
   }
   return url;
}

/* -------------------------------------------------------------------------- */
/*                              Workspace mínimo                              */
/* -------------------------------------------------------------------------- */

async function seedMinimal(client: Client) {
   await client.query(
      `insert into public.teams (id, name, icon, color, issue_prefix)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [TEAM.id, TEAM.name, TEAM.icon, TEAM.color, TEAM.prefix]
   );
   console.log(`✓ time ${TEAM.id} (${TEAM.name}) — prefixo ${TEAM.prefix}-1, ${TEAM.prefix}-2, …`);
   console.log('✓ workspace pronto. Os membros aparecem conforme criam conta.');
}

/* -------------------------------------------------------------------------- */
/*                          Dataset de demonstração                           */
/* -------------------------------------------------------------------------- */

async function seedDemo(client: Client) {
   // Import dinâmico: o modo mínimo não paga o custo de carregar os mocks.
   const [{ users }, { teams }, { projects }, { cycles }, { issues }] = await Promise.all([
      import('../mock-data/users'),
      import('../mock-data/teams'),
      import('../mock-data/projects'),
      import('../mock-data/cycles'),
      import('../mock-data/issues'),
   ]);

   /* Membros — sem conta de login; user_id é preenchido quando fizerem signup. */
   const profileIdByMock = new Map<string, string>();
   for (const u of users) {
      const { rows } = await client.query<{ id: string }>(
         `insert into public.profiles (email, name, avatar_url, role, status, timezone, joined_date)
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (email) do update set name = excluded.name
          returning id`,
         [u.email, u.name, u.avatarUrl, u.role, u.status, u.timezone, u.joinedDate]
      );
      profileIdByMock.set(u.id, rows[0].id);
   }
   console.log(`✓ ${users.length} membros`);

   /* Times */
   for (const t of teams) {
      await client.query(
         `insert into public.teams (id, name, icon, color, issue_prefix)
          values ($1, $2, $3, $4, $5)
          on conflict (id) do update set name = excluded.name`,
         [t.id, t.name, t.icon, t.color, t.id.slice(0, 4).toUpperCase()]
      );
      // `teams.members` tem duplicatas no mock; o Set evita violar a PK.
      for (const memberMockId of new Set(t.members.map((m) => m.id))) {
         const profileId = profileIdByMock.get(memberMockId);
         if (!profileId) continue;
         await client.query(
            `insert into public.team_members (team_id, profile_id) values ($1, $2)
             on conflict do nothing`,
            [t.id, profileId]
         );
      }
   }
   console.log(`✓ ${teams.length} times`);

   /* Ciclos */
   const cycleIdByMock = new Map<string, string>();
   const cycleTeamByMock = new Map<string, string>();
   for (const c of cycles) {
      const { rows } = await client.query<{ id: string }>(
         `insert into public.cycles (number, name, team_id, status, start_date, end_date, capacity)
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (team_id, number) do update set name = excluded.name
          returning id`,
         [c.number, c.name, c.teamId, c.status, c.startDate, c.endDate, c.capacity]
      );
      cycleIdByMock.set(c.id, rows[0].id);
      cycleTeamByMock.set(c.id, c.teamId);
   }
   console.log(`✓ ${cycles.length} ciclos`);

   /* Projetos */
   const projectIdByMock = new Map<string, string>();
   const projectTeamByMock = new Map<string, string>();
   for (const p of projects) {
      // O ícone é um componente React; o banco guarda só o nome, resolvido no cliente.
      const iconName =
         (p.icon as unknown as { displayName?: string; name?: string }).displayName ??
         (p.icon as unknown as { name?: string }).name ??
         'Box';

      const { rows } = await client.query<{ id: string }>(
         `insert into public.projects
             (name, icon, status_id, priority_id, health_id, team_id, lead_id,
              percent_complete, start_date, target_date, initiative, health_updated_ago_days)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          returning id`,
         [
            p.name,
            iconName,
            p.status.id,
            p.priority.id,
            p.health.id,
            p.teamId,
            profileIdByMock.get(p.lead.id) ?? null,
            p.percentComplete,
            p.startDate,
            p.targetDate ?? null,
            p.initiative ?? null,
            p.healthUpdatedAgoDays ?? null,
         ]
      );
      projectIdByMock.set(p.id, rows[0].id);
      projectTeamByMock.set(p.id, p.teamId);

      for (const l of p.labels) {
         await client.query(
            `insert into public.project_labels (project_id, label_id) values ($1, $2)
             on conflict do nothing`,
            [rows[0].id, l.id]
         );
      }
   }
   console.log(`✓ ${projects.length} projetos`);

   /* Issues — identifier vem do mock; o trigger respeita quando já preenchido. */
   const fallbackTeam = teams[0].id;
   let issueCount = 0;
   for (const i of issues) {
      const teamId =
         (i.cycleId ? cycleTeamByMock.get(i.cycleId) : undefined) ??
         (i.project ? projectTeamByMock.get(i.project.id) : undefined) ??
         fallbackTeam;

      const { rows } = await client.query<{ id: string }>(
         `insert into public.issues
             (identifier, title, description, team_id, status_id, priority_id,
              project_id, cycle_id, assignee_id, rank, due_date, created_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          on conflict (identifier) do nothing
          returning id`,
         [
            i.identifier,
            i.title,
            i.description,
            teamId,
            i.status.id,
            i.priority.id,
            i.project ? (projectIdByMock.get(i.project.id) ?? null) : null,
            i.cycleId ? (cycleIdByMock.get(i.cycleId) ?? null) : null,
            i.assignee ? (profileIdByMock.get(i.assignee.id) ?? null) : null,
            i.rank,
            i.dueDate ?? null,
            i.createdAt,
         ]
      );
      if (rows.length === 0) continue;

      for (const l of i.labels) {
         await client.query(
            `insert into public.issue_labels (issue_id, label_id) values ($1, $2)
             on conflict do nothing`,
            [rows[0].id, l.id]
         );
      }
      issueCount++;
   }
   console.log(`✓ ${issueCount} issues`);

   // Os identificadores do mock foram inseridos direto, sem passar pelo contador.
   // Sem isto, a primeira issue criada pela UI colidiria com uma existente.
   await client.query(`
      update public.teams t
         set issue_counter = greatest(t.issue_counter, coalesce(m.max_num, 0))
        from (
           select team_id,
                  max(nullif(regexp_replace(identifier, '^.*-', ''), '')::int) as max_num
             from public.issues
            group by team_id
        ) m
       where m.team_id = t.id
   `);
   console.log('✓ contadores de identificador ajustados');
}

/* -------------------------------------------------------------------------- */

async function main() {
   const demo = process.argv.includes('--demo');
   const client = new Client({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
   });

   await client.connect();
   try {
      await client.query('begin');
      await seedMinimal(client);
      if (demo) await seedDemo(client);
      await client.query('commit');
   } catch (err) {
      await client.query('rollback');
      throw err;
   } finally {
      await client.end();
   }

   console.log('\nSeed concluído.');
}

main().catch((err) => {
   console.error(err instanceof Error ? err.message : err);
   process.exit(1);
});
