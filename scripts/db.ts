/**
 * Runner de migrações.
 *
 *   pnpm db:migrate     aplica os .sql de supabase/migrations ainda não aplicados
 *   pnpm db:reset       derruba o schema public e reaplica tudo do zero
 *
 * Conecta direto no Postgres (DATABASE_URL), fora do PostgREST — é o único
 * caminho com permissão de DDL. A chave publishable só lê e escreve dados.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function connectionString(): string {
   const url = process.env.DATABASE_URL;
   if (!url) {
      console.error(
         'DATABASE_URL não definida em .env.local.\n' +
            'Pegue em: Supabase → Project Settings → Database → Connection string → URI'
      );
      process.exit(1);
   }
   return url;
}

async function main() {
   const reset = process.argv.includes('--reset');
   const client = new Client({
      connectionString: connectionString(),
      // O pooler da Supabase usa certificado próprio; a conexão segue cifrada.
      ssl: { rejectUnauthorized: false },
   });

   await client.connect();

   try {
      if (reset) {
         console.log('· derrubando schema public');
         await client.query('drop schema if exists public cascade');
         await client.query('create schema public');
         await client.query('grant usage on schema public to anon, authenticated, service_role');
         await client.query(
            'grant all on all tables in schema public to anon, authenticated, service_role'
         );
         // O trigger em auth.users sobrevive ao drop do schema public e passaria
         // a apontar para uma função inexistente.
         await client.query('drop trigger if exists on_auth_user_created on auth.users');
      }

      await client.query(`
         create table if not exists public._migrations (
            name       text primary key,
            applied_at timestamptz not null default now()
         )
      `);

      const { rows } = await client.query<{ name: string }>('select name from public._migrations');
      const applied = new Set(rows.map((r) => r.name));

      const files = readdirSync(MIGRATIONS_DIR)
         .filter((f) => f.endsWith('.sql'))
         .sort();

      let count = 0;
      for (const file of files) {
         if (applied.has(file)) {
            console.log(`· ${file} (já aplicada)`);
            continue;
         }

         const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

         // Cada migração é atômica: ou aplica inteira, ou não aplica nada.
         await client.query('begin');
         try {
            await client.query(sql);
            await client.query('insert into public._migrations (name) values ($1)', [file]);
            await client.query('commit');
            console.log(`✓ ${file}`);
            count++;
         } catch (err) {
            await client.query('rollback');
            console.error(`✗ ${file} — revertida\n`);
            throw err;
         }
      }

      console.log(count === 0 ? '\nNada a aplicar.' : `\n${count} migração(ões) aplicada(s).`);
   } finally {
      await client.end();
   }
}

main().catch((err) => {
   console.error(err instanceof Error ? err.message : err);
   process.exit(1);
});
