import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

/**
 * Cliente Supabase para componentes client-side.
 *
 * `createBrowserClient` já memoiza a instância internamente, então chamar isto
 * a cada render é barato — não é preciso guardar em módulo nem em contexto.
 */
export function createClient() {
   return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
   );
}
