'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useTeams } from '@/components/providers/workspace-provider';

export function BackToApp() {
   const pathname = usePathname();
   const teams = useTeams();

   /*
    * O destino era fixo em /lndev-ui/team/CORE/all — org e time do repositório
    * original. Agora sai do workspace da própria URL e do primeiro time real;
    * sem time, a lista de times é o destino seguro.
    */
   const orgId = pathname.split('/')[1];
   const href = teams[0] ? `/${orgId}/team/${teams[0].id}/all` : `/${orgId}/teams`;

   return (
      <div className="w-full flex items-center justify-between gap-2">
         <Button className="w-fit" size="xs" variant="outline" asChild>
            <Link href={href}>
               <ChevronLeft className="size-4" />
               Voltar
            </Link>
         </Button>
         <ThemeToggle />
      </div>
   );
}
