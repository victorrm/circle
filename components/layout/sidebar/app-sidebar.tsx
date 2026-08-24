'use client';

import * as React from 'react';

import { NavInbox } from '@/components/layout/sidebar/nav-inbox';
import { NavTeams } from '@/components/layout/sidebar/nav-teams';
import { NavWorkspace } from '@/components/layout/sidebar/nav-workspace';
import { NavSettings } from '@/components/layout/sidebar/nav-settings';
import { NavTeamsSettings } from '@/components/layout/sidebar/nav-teams-settings';
import { OrgSwitcher } from '@/components/layout/sidebar/org-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BackToApp } from '@/components/layout/sidebar/back-to-app';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const isSettings = pathname.includes('/settings');
   return (
      <Sidebar collapsible="offcanvas" {...props}>
         <SidebarHeader>{isSettings ? <BackToApp /> : <OrgSwitcher />}</SidebarHeader>
         <SidebarContent>
            {isSettings ? (
               <>
                  <NavSettings />
                  <NavTeamsSettings />
               </>
            ) : (
               <>
                  <NavInbox />
                  <NavWorkspace />
                  <NavTeams />
               </>
            )}
         </SidebarContent>
         <SidebarFooter>
            <Link
               href="https://tidebreakers.com.br"
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center justify-center py-3 opacity-80 transition-opacity hover:opacity-100"
            >
               {/*
                * O SVG é todo #D6133C (o vermelho da marca) — legível no tema
                * claro e no escuro, sem precisar de variante por tema.
                * width/height explícitos evitam salto de layout no carregamento.
                *
                * <img> e não next/image: o otimizador do Next repassa SVG sem
                * processar, então o componente só acrescentaria peso sem ganho.
                */}
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img
                  src="/logo-tidebreakers.svg"
                  alt="Tidebreakers"
                  width={140}
                  height={21}
                  className="h-auto w-[140px]"
               />
            </Link>
         </SidebarFooter>
      </Sidebar>
   );
}
