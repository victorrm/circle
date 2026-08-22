/**
 * Traduz linhas do Postgres para os tipos de domínio já usados pela interface.
 *
 * A interface inteira (323 arquivos) continua consumindo `Issue`, `Project`,
 * `User`… exatamente como antes — só a origem dos dados mudou. Ícones de status
 * e prioridade seguem vindo do código, ligados por id, porque são componentes
 * React e não cabem numa coluna.
 */
import type { Issue } from '@/mock-data/issues';
import type { Project, Health } from '@/mock-data/projects';
import { health as healthList } from '@/mock-data/projects';
import type { Team } from '@/mock-data/teams';
import type { User } from '@/mock-data/users';
import type { Cycle } from '@/mock-data/cycles';
import type { LabelInterface } from '@/mock-data/labels';
import { priorities, type Priority } from '@/mock-data/priorities';
import { status as statusList, type Status } from '@/mock-data/status';
import type { Tables } from '@/lib/supabase/types';
import { resolveProjectIcon } from './icons';

/* ----------------------------- Config estática ---------------------------- */

const FALLBACK_STATUS = statusList.find((s) => s.id === 'backlog')!;
const FALLBACK_PRIORITY = priorities.find((p) => p.id === 'no-priority')!;
const FALLBACK_HEALTH = healthList.find((h) => h.id === 'no-update')!;

export const statusById = (id: string): Status =>
   statusList.find((s) => s.id === id) ?? FALLBACK_STATUS;

export const priorityById = (id: string): Priority =>
   priorities.find((p) => p.id === id) ?? FALLBACK_PRIORITY;

export const healthById = (id: string): Health =>
   healthList.find((h) => h.id === id) ?? FALLBACK_HEALTH;

/* -------------------------------- Membros -------------------------------- */

/** Avatar determinístico para quem ainda não subiu foto. */
const fallbackAvatar = (seed: string) =>
   `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;

export type ProfileRow = Tables<'profiles'> & { team_members?: { team_id: string }[] };

export function toUser(row: ProfileRow): User {
   return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url ?? fallbackAvatar(row.email),
      status: row.status,
      role: row.role,
      joinedDate: row.joined_date,
      timezone: row.timezone,
      teamIds: row.team_members?.map((tm) => tm.team_id) ?? [],
   };
}

/* --------------------------------- Labels -------------------------------- */

export const toLabel = (row: Tables<'labels'>): LabelInterface => ({
   id: row.id,
   name: row.name,
   color: row.color,
});

/** Junções do PostgREST vêm como `{ label: Row | null }[]`. */
const joinedLabels = (rows: { label: Tables<'labels'> | null }[] | undefined): LabelInterface[] =>
   (rows ?? []).reduce<LabelInterface[]>((acc, r) => {
      if (r.label) acc.push(toLabel(r.label));
      return acc;
   }, []);

/** Usado onde a UI exige um `User` mas o banco permite nulo. */
export const UNASSIGNED_USER: User = {
   id: '',
   name: 'Sem responsável',
   email: '',
   avatarUrl: fallbackAvatar('unassigned'),
   status: 'offline',
   role: 'Member',
   joinedDate: '',
   timezone: 'UTC',
   teamIds: [],
};

/* -------------------------------- Projetos ------------------------------- */

export type ProjectRow = Tables<'projects'> & {
   lead?: ProfileRow | null;
   project_labels?: { label: Tables<'labels'> | null }[];
};

export function toProject(row: ProjectRow): Project {
   return {
      id: row.id,
      name: row.name,
      status: statusById(row.status_id),
      icon: resolveProjectIcon(row.icon),
      percentComplete: row.percent_complete,
      startDate: row.start_date,
      targetDate: row.target_date ?? undefined,
      // A UI assume um lead sempre presente; um projeto sem lead usa um
      // placeholder em vez de quebrar a renderização.
      lead: row.lead ? toUser(row.lead) : UNASSIGNED_USER,
      priority: priorityById(row.priority_id),
      health: healthById(row.health_id),
      teamId: row.team_id ?? '',
      labels: joinedLabels(row.project_labels),
      initiative: row.initiative ?? undefined,
      healthUpdatedAgoDays: row.health_updated_ago_days ?? undefined,
   };
}

/* --------------------------------- Issues -------------------------------- */

export type IssueRow = Tables<'issues'> & {
   assignee?: ProfileRow | null;
   project?: ProjectRow | null;
   issue_labels?: { label: Tables<'labels'> | null }[];
};

export function toIssue(row: IssueRow): Issue {
   return {
      id: row.id,
      identifier: row.identifier,
      title: row.title,
      description: row.description,
      teamId: row.team_id,
      status: statusById(row.status_id),
      assignee: row.assignee ? toUser(row.assignee) : null,
      priority: priorityById(row.priority_id),
      labels: joinedLabels(row.issue_labels),
      createdAt: row.created_at,
      cycleId: row.cycle_id ?? '',
      project: row.project ? toProject(row.project) : undefined,
      rank: row.rank,
      dueDate: row.due_date ?? undefined,
   };
}

/* --------------------------------- Times --------------------------------- */

export type TeamRow = Tables<'teams'> & {
   team_members?: { profile: ProfileRow | null }[];
   projects?: ProjectRow[];
};

export function toTeam(row: TeamRow, currentProfileId?: string): Team {
   const members = (row.team_members ?? [])
      .map((tm) => tm.profile)
      .filter((p): p is ProfileRow => Boolean(p))
      .map(toUser);

   return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      // "joined" é relativo a quem está olhando.
      joined: currentProfileId ? members.some((m) => m.id === currentProfileId) : false,
      members,
      projects: (row.projects ?? []).map(toProject),
   };
}

/* --------------------------------- Ciclos -------------------------------- */

/**
 * Métricas de ciclo (scope/started/completed) são derivadas das issues, não
 * armazenadas — assim não há como o número no banco divergir da realidade.
 */
export function toCycle(row: Tables<'cycles'>, issues: Issue[] = []): Cycle {
   const mine = issues.filter((i) => i.cycleId === row.id);
   const completed = mine.filter((i) => i.status.category === 'completed').length;
   const started = mine.filter((i) => i.status.category === 'started').length;

   return {
      id: row.id,
      number: row.number,
      name: row.name,
      teamId: row.team_id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      capacity: row.capacity,
      scope: mine.length,
      scopeDelta: 0,
      started,
      completed,
      successRate: mine.length > 0 ? Math.round((completed / mine.length) * 100) : undefined,
   };
}
