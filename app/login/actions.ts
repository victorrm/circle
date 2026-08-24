'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string; notice?: string };

function readCredentials(formData: FormData) {
   return {
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
      next: String(formData.get('next') ?? '/'),
   };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
   const { email, password, next } = readCredentials(formData);

   if (!email || !password) {
      return { error: 'Informe e-mail e senha.' };
   }

   const supabase = await createClient();
   const { error } = await supabase.auth.signInWithPassword({ email, password });

   if (error) {
      return {
         error:
            error.message === 'Invalid login credentials'
               ? 'E-mail ou senha incorretos.'
               : error.message,
      };
   }

   revalidatePath('/', 'layout');
   redirect(next.startsWith('/') ? next : '/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
   const { email, password } = readCredentials(formData);
   const name = String(formData.get('name') ?? '').trim();

   if (!email || !password) {
      return { error: 'Informe e-mail e senha.' };
   }
   if (password.length < 8) {
      return { error: 'A senha precisa ter ao menos 8 caracteres.' };
   }

   const origin = (await headers()).get('origin');
   const supabase = await createClient();

   const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
         data: { name: name || email.split('@')[0] },
         emailRedirectTo: `${origin}/auth/callback`,
      },
   });

   if (error) {
      if (error.status === 429) {
         return { error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.' };
      }

      /*
       * O trigger enforce_invite_only recusa e-mails não convidados levantando
       * exceção. O GoTrue engole a mensagem do banco e devolve um 500 genérico,
       * cujo corpo varia entre versões — por isso a checagem é pelo status, e
       * não por texto: casar string quebraria numa atualização do Supabase.
       *
       * A mensagem é deliberadamente a mesma para "não convidado" e para outras
       * falhas de gravação. Dizer "este e-mail não foi convidado" permitiria
       * descobrir quem faz parte da organização, testando um endereço por vez.
       */
      if (error.status === 500) {
         return {
            error: 'Cadastro apenas por convite. Peça acesso a um administrador do workspace.',
         };
      }

      return { error: error.message };
   }

   // Com confirmação de e-mail ligada, a sessão vem nula: a pessoa precisa
   // clicar no link antes de entrar.
   if (!data.session) {
      return { notice: `Enviamos um link de confirmação para ${email}.` };
   }

   revalidatePath('/', 'layout');
   redirect('/');
}
