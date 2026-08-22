import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
   return await updateSession(request);
}

export const config = {
   matcher: [
      /*
       * Tudo, exceto:
       *   - _next/static, _next/image  (build assets)
       *   - favicon e imagens
       * Assim o token de sessão é renovado em toda navegação real.
       */
      '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
   ],
};
