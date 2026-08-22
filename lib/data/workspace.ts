import 'server-only';

import type { Issue } from '@/mock-data/issues';
import type { Project } from '@/mock-data/projects';
import type { Team } from '@/mock-data/teams';
import type { User } from '@/mock-data/users';
import type { Cycle } from '@/mock-data/cycles';
import type { LabelInterface } from '@/mock-data/labels';
import {
   getCurrentProfile,
   getCycles,
   getIssues,
   getLabels,
   getMembers,
   getProjects,
   getTeams,
} from './queries';

export interface Workspace {
   currentUser: User | null;
   issues: Issue[];
   projects: Project[];
   teams: Team[];
   members: User[];
   cycles: Cycle[];
   labels: LabelInterface[];
}

/**
 * Carrega o workspace inteiro numa passada, para hidratar os stores do cliente.
 *
 * O perfil vem primeiro porque `getTeams` precisa dele para marcar quais times
 * a pessoa integra; o resto sai em paralelo.
 */
export async function getWorkspace(): Promise<Workspace> {
   const [currentUser, issues] = await Promise.all([getCurrentProfile(), getIssues()]);

   const [projects, teams, members, cycles, labels] = await Promise.all([
      getProjects(),
      getTeams(currentUser?.id),
      getMembers(),
      // Reaproveita as issues já carregadas em vez de buscá-las de novo.
      getCycles(undefined, issues),
      getLabels(),
   ]);

   return { currentUser, issues, projects, teams, members, cycles, labels };
}
