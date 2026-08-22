'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, signUp, type AuthState } from './actions';

type Mode = 'signin' | 'signup';

const EMPTY: AuthState = {};

export function LoginForm() {
   const searchParams = useSearchParams();
   const [mode, setMode] = useState<Mode>('signin');

   const [state, action, pending] = useActionState(mode === 'signin' ? signIn : signUp, EMPTY);

   const next = searchParams.get('next') ?? '/';
   const urlError = searchParams.get('error');
   const error = state.error ?? urlError;

   return (
      <div className="w-full max-w-sm">
         <header className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Circle</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
               {mode === 'signin' ? 'Entre para acessar o workspace.' : 'Crie sua conta.'}
            </p>
         </header>

         <form action={action} className="space-y-4">
            <input type="hidden" name="next" value={next} />

            {mode === 'signup' && (
               <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" autoComplete="name" placeholder="Seu nome" />
               </div>
            )}

            <div className="space-y-2">
               <Label htmlFor="email">E-mail</Label>
               <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@empresa.com"
               />
            </div>

            <div className="space-y-2">
               <Label htmlFor="password">Senha</Label>
               <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
               />
            </div>

            {error && (
               <p role="alert" className="text-sm text-destructive">
                  {error}
               </p>
            )}

            {state.notice && (
               <p role="status" className="text-sm text-muted-foreground">
                  {state.notice}
               </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
               {pending ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </Button>
         </form>

         <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
               type="button"
               onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
               className="font-medium text-foreground underline underline-offset-4"
            >
               {mode === 'signin' ? 'Criar conta' : 'Entrar'}
            </button>
         </p>
      </div>
   );
}
