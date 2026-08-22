import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Rotas acessíveis sem sessão. */
const PUBLIC_PATHS = ['/login', '/auth'];

/**
 * Renova o token de sessão a cada requisição e barra quem não está autenticado.
 *
 * O cookie precisa ser propagado tanto para a request (para os Server Components
 * lerem a sessão nova) quanto para a response (para o browser guardá-la), por
 * isso o `supabaseResponse` é recriado dentro do `setAll`.
 */
export async function updateSession(request: NextRequest) {
   let supabaseResponse = NextResponse.next({ request });

   const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
         cookies: {
            getAll() {
               return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
               cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
               supabaseResponse = NextResponse.next({ request });
               cookiesToSet.forEach(({ name, value, options }) =>
                  supabaseResponse.cookies.set(name, value, options)
               );
            },
         },
      }
   );

   // Não colocar código entre createServerClient e getUser(): qualquer await no
   // meio pode fazer a sessão expirar de forma imprevisível.
   const {
      data: { user },
   } = await supabase.auth.getUser();

   const { pathname } = request.nextUrl;
   const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

   if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
   }

   if (user && pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
   }

   return supabaseResponse;
}
