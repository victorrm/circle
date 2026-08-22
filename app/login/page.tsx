import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
   return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
         <Suspense>
            <LoginForm />
         </Suspense>
      </main>
   );
}
