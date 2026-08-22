import { redirect } from 'next/navigation';
import { WorkspaceProvider } from '@/components/providers/workspace-provider';
import { getWorkspace } from '@/lib/data/workspace';

/**
 * Carrega o workspace uma única vez para todas as rotas de /[orgId].
 * Sem sessão o middleware já teria redirecionado; a checagem aqui cobre o caso
 * de a sessão expirar entre o middleware e o render.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
   const workspace = await getWorkspace();

   if (!workspace.currentUser) {
      redirect('/login');
   }

   return <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>;
}
