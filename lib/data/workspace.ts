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
   /** Falso quando a pessoa está autenticada mas ainda não foi convidada. */
   isActive: boolean;
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
   const membership = await getCurrentProfile();

   // Sem acesso liberado, a RLS devolveria listas vazias em todas as consultas.
   // Evita seis idas ao banco para não trazer nada.
   if (!membership?.isActive) {
      return {
         currentUser: membership?.user ?? null,
         isActive: false,
         issues: [],
         projects: [],
         teams: [],
         members: [],
         cycles: [],
         labels: [],
      };
   }

   const issues = await getIssues();

   const [projects, teams, members, cycles, labels] = await Promise.all([
      getProjects(),
      getTeams(membership.user.id),
      getMembers(),
      // Reaproveita as issues já carregadas em vez de buscá-las de novo.
      getCycles(undefined, issues),
      getLabels(),
   ]);

   return {
      currentUser: membership.user,
      isActive: true,
      issues,
      projects,
      teams,
      members,
      cycles,
      labels,
   };
}
