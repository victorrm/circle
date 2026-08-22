'use client';

import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { Workspace } from '@/lib/data/workspace';
import { useIssuesStore } from '@/store/issues-store';

const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * Distribui os dados carregados no servidor para o cliente.
 *
 * A hidratação dos stores acontece durante o primeiro render (não num efeito):
 * assim o primeiro paint já sai com os dados certos, sem piscar vazio. O ref
 * garante que rode uma vez só, mesmo com o duplo-render do StrictMode.
 */
export function WorkspaceProvider({
   workspace,
   children,
}: {
   workspace: Workspace;
   children: ReactNode;
}) {
   const hydrated = useRef(false);

   if (!hydrated.current) {
      useIssuesStore.getState().hydrate(workspace.issues);
      hydrated.current = true;
   }

   return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
   const ctx = useContext(WorkspaceContext);
   if (!ctx) {
      throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>.');
   }
   return ctx;
}

/* Atalhos — evitam re-render por mudança em partes não usadas do workspace. */
export const useCurrentUser = () => useWorkspace().currentUser;
export const useTeams = () => useWorkspace().teams;
export const useMembers = () => useWorkspace().members;
export const useProjects = () => useWorkspace().projects;
export const useCycles = () => useWorkspace().cycles;
export const useLabels = () => useWorkspace().labels;
