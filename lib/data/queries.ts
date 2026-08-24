import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Issue } from '@/mock-data/issues';
import type { Project } from '@/mock-data/projects';
import type { Team } from '@/mock-data/teams';
import type { User } from '@/mock-data/users';
import type { Cycle } from '@/mock-data/cycles';
import type { LabelInterface } from '@/mock-data/labels';
import {
   toCycle,
   toIssue,
   toLabel,
   toProject,
   toTeam,
   toUser,
   type IssueRow,
   type ProfileRow,
   type ProjectRow,
   type TeamRow,
} from './mappers';

/*
 * Fragmentos de select do PostgREST.
 *
 * `issues` tem duas FKs para `profiles` (assignee_id e creator_id), então a
 * junção precisa nomear a constraint — senão o PostgREST não sabe qual seguir.
 */
const PROFILE = '*, team_members(team_id)';

const PROJECT = `
   *,
   lead:profiles!projects_lead_id_fkey(${PROFILE}),
   project_labels(label:labels(*))
`;

const ISSUE = `
   *,
   assignee:profiles!issues_assignee_id_fkey(${PROFILE}),
   project:projects(${PROJECT}),
   issue_labels(label:labels(*))
`;

/* -------------------------------------------------------------------------- */
/*                                   Sessão                                   */
/* -------------------------------------------------------------------------- */

export interface Membership {
   user: User;
   /** Falso quando a pessoa criou conta mas ainda não foi convidada. */
   isActive: boolean;
}

/**
 * Perfil de quem está logado, ou null se não houver sessão.
 * Usa getUser() (valida o token no servidor), nunca getSession().
 *
 * `isActive` vem separado do `User` de propósito: é estado de autorização, não
 * atributo de domínio — a interface de membros não deve exibi-lo por acidente.
 */
export async function getCurrentProfile(): Promise<Membership | null> {
   const supabase = await createClient();

   const {
      data: { user },
   } = await supabase.auth.getUser();
   if (!user) return null;

   const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE)
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>();

   if (error) throw new Error(`Falha ao carregar perfil: ${error.message}`);
   if (!data) return null;

   return { user: toUser(data), isActive: data.is_active };
}

/* -------------------------------------------------------------------------- */
/*                                   Times                                    */
/* -------------------------------------------------------------------------- */

export async function getTeams(currentProfileId?: string): Promise<Team[]> {
   const supabase = await createClient();

   const { data, error } = await supabase
      .from('teams')
      .select(`*, team_members(profile:profiles(${PROFILE})), projects(${PROJECT})`)
      .order('name')
      .returns<TeamRow[]>();

   if (error) throw new Error(`Falha ao carregar times: ${error.message}`);
   return (data ?? []).map((row) => toTeam(row, currentProfileId));
}

export async function getTeam(teamId: string, currentProfileId?: string): Promise<Team | null> {
   const supabase = await createClient();

   const { data, error } = await supabase
      .from('teams')
      .select(`*, team_members(profile:profiles(${PROFILE})), projects(${PROJECT})`)
      .eq('id', teamId)
      .maybeSingle<TeamRow>();

   if (error) throw new Error(`Falha ao carregar time ${teamId}: ${error.message}`);
   return data ? toTeam(data, currentProfileId) : null;
}

/* -------------------------------------------------------------------------- */
/*                                   Issues                                   */
/* -------------------------------------------------------------------------- */

export interface IssueQuery {
   teamId?: string;
   projectId?: string;
   cycleId?: string;
   assigneeId?: string;
}

export async function getIssues(query: IssueQuery = {}): Promise<Issue[]> {
   const supabase = await createClient();

   let builder = supabase.from('issues').select(ISSUE);

   if (query.teamId) builder = builder.eq('team_id', query.teamId);
   if (query.projectId) builder = builder.eq('project_id', query.projectId);
   if (query.cycleId) builder = builder.eq('cycle_id', query.cycleId);
   if (query.assigneeId) builder = builder.eq('assignee_id', query.assigneeId);

   const { data, error } = await builder.order('rank').returns<IssueRow[]>();

   if (error) throw new Error(`Falha ao carregar issues: ${error.message}`);
   return (data ?? []).map(toIssue);
}

export async function getIssue(identifier: string): Promise<Issue | null> {
   const supabase = await createClient();

   const { data, error } = await supabase
      .from('issues')
      .select(ISSUE)
      .eq('identifier', identifier)
      .maybeSingle<IssueRow>();

   if (error) throw new Error(`Falha ao carregar issue ${identifier}: ${error.message}`);
   return data ? toIssue(data) : null;
}

/* -------------------------------------------------------------------------- */
/*                                  Projetos                                  */
/* -------------------------------------------------------------------------- */

export async function getProjects(teamId?: string): Promise<Project[]> {
   const supabase = await createClient();

   let builder = supabase.from('projects').select(PROJECT);
   if (teamId) builder = builder.eq('team_id', teamId);

   const { data, error } = await builder.order('name').returns<ProjectRow[]>();

   if (error) throw new Error(`Falha ao carregar projetos: ${error.message}`);
   return (data ?? []).map(toProject);
}

export async function getProject(projectId: string): Promise<Project | null> {
   const supabase = await createClient();

   const { data, error } = await supabase
      .from('projects')
      .select(PROJECT)
      .eq('id', projectId)
      .maybeSingle<ProjectRow>();

   if (error) throw new Error(`Falha ao carregar projeto: ${error.message}`);
   return data ? toProject(data) : null;
}

/* -------------------------------------------------------------------------- */
/*                                  Membros                                   */
/* -------------------------------------------------------------------------- */

export async function getMembers(): Promise<User[]> {
   const supabase = await createClient();

   const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE)
      .order('name')
      .returns<ProfileRow[]>();

   if (error) throw new Error(`Falha ao carregar membros: ${error.message}`);
   return (data ?? []).map(toUser);
}

/* -------------------------------------------------------------------------- */
/*                                   Ciclos                                   */
/* -------------------------------------------------------------------------- */

/**
 * Os contadores do ciclo (scope/started/completed) são derivados das issues.
 * Passe `knownIssues` quando já as tiver em mãos para evitar um segundo fetch.
 */
export async function getCycles(teamId?: string, knownIssues?: Issue[]): Promise<Cycle[]> {
   const supabase = await createClient();

   let builder = supabase.from('cycles').select('*');
   if (teamId) builder = builder.eq('team_id', teamId);

   const [{ data, error }, issues] = await Promise.all([
      builder.order('number', { ascending: false }),
      knownIssues ?? getIssues(teamId ? { teamId } : {}),
   ]);

   if (error) throw new Error(`Falha ao carregar ciclos: ${error.message}`);
   return (data ?? []).map((row) => toCycle(row, issues));
}

/* -------------------------------------------------------------------------- */
/*                                   Labels                                   */
/* -------------------------------------------------------------------------- */

export async function getLabels(): Promise<LabelInterface[]> {
   const supabase = await createClient();

   const { data, error } = await supabase.from('labels').select('*').order('name');

   if (error) throw new Error(`Falha ao carregar labels: ${error.message}`);
   return (data ?? []).map(toLabel);
}
