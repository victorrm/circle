import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 * Precisa ser criado por requisição — nunca guarde o retorno em variável global.
 */
export async function createClient() {
   const cookieStore = await cookies();

   return createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
         cookies: {
            getAll() {
               return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
               try {
                  cookiesToSet.forEach(({ name, value, options }) =>
                     cookieStore.set(name, value, options)
                  );
               } catch {
                  // Chamado de um Server Component: escrever cookie não é permitido.
                  // O middleware já renova a sessão, então isto pode ser ignorado.
               }
            },
         },
      }
   );
}
