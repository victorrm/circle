import { Button } from '@/components/ui/button';

/**
 * Mostrada a quem tem conta mas ainda não foi convidado ao workspace.
 *
 * Sem isto a pessoa cairia numa interface completamente vazia e pensaria que o
 * app está quebrado — a RLS devolve zero linhas em tudo, corretamente.
 */
export function PendingAccess({ email }: { email: string }) {
   return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
         <div className="w-full max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight">Acesso pendente</h1>

            <p className="mt-3 text-sm text-muted-foreground">
               Sua conta foi criada, mas ainda não faz parte deste workspace. Peça a um
               administrador para liberar o acesso de{' '}
               <span className="text-foreground">{email}</span>.
            </p>

            <form action="/auth/signout" method="post" className="mt-8">
               <Button type="submit" variant="outline" size="sm">
                  Sair
               </Button>
            </form>
         </div>
      </main>
   );
}
