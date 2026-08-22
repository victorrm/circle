import {
   Accessibility,
   Bell,
   Blocks,
   Bomb,
   Box,
   BrickWall,
   Cuboid,
   FormInput,
   Globe,
   Grid2X2,
   HelpCircle,
   LayoutDashboard,
   Loader,
   Lock,
   Play,
   Settings,
   Shapes,
   Table,
   TrafficCone,
   Vault,
   Wallpaper,
   type LucideIcon,
} from 'lucide-react';

/**
 * O banco guarda o nome do ícone; o componente é resolvido aqui.
 *
 * Registro explícito em vez de `import * as lucide` de propósito: o import
 * estrela puxaria as ~1500 ícones do pacote para o bundle do cliente.
 * Para oferecer um ícone novo no seletor de projetos, adicione-o aqui.
 */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
   Accessibility,
   Bell,
   Blocks,
   Bomb,
   Box,
   BrickWall,
   Cuboid,
   FormInput,
   Globe,
   Grid2X2,
   HelpCircle,
   LayoutDashboard,
   Loader,
   Lock,
   Play,
   Settings,
   Shapes,
   Table,
   TrafficCone,
   Vault,
   Wallpaper,
};

export const PROJECT_ICON_NAMES = Object.keys(PROJECT_ICONS);

export function resolveProjectIcon(name: string | null | undefined): LucideIcon {
   return (name && PROJECT_ICONS[name]) || Box;
}

/** Caminho inverso: componente → nome, para gravar no banco. */
export function projectIconName(icon: { displayName?: string; name?: string }): string {
   const name = icon.displayName ?? icon.name;
   return name && name in PROJECT_ICONS ? name : 'Box';
}
