# Deploy — projetos.tidebreakers.com.br

## Ambiente local

```shell
cp .env.example .env.local   # preencha as três variáveis
pnpm install
pnpm db:migrate              # aplica supabase/migrations em ordem
pnpm db:seed                 # cria o workspace (um time, vazio)
pnpm dev
```

## Variáveis no host

Só estas duas. **`DATABASE_URL` não vai para o host** — ela ignora a RLS e serve
apenas para rodar migrações da sua máquina.

| Variável                               | Valor                                      |
| -------------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://wzndldadbppnmsijxtvc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`                         |

A chave publishable aparecer no bundle do navegador é esperado — é assim que ela
funciona. Quem protege os dados é a RLS, não o sigilo dela.

## Configurações no painel do Supabase

Estas não moram no código e precisam ser feitas uma vez, antes de a equipe entrar.

### 1. URLs de redirecionamento — senão o link de confirmação leva para localhost

**Authentication → URL Configuration**

- Site URL: `https://projetos.tidebreakers.com.br`
- Redirect URLs: `https://projetos.tidebreakers.com.br/auth/callback`

Se houver ambiente de homologação, acrescente a URL dele à lista.

### 2. Entrega de e-mail — sem isto, ninguém consegue se cadastrar

O SMTP embutido do Supabase serve para desenvolvimento: tem limite de poucos
e-mails por hora e, em projetos novos, só entrega para endereços da equipe do
projeto. Com a confirmação de e-mail ligada (`mailer_autoconfirm: false`, que é o
padrão), o cadastro da equipe vai falhar.

Duas saídas:

**a) SMTP próprio** — Authentication → Emails → SMTP Settings. Resend, SendGrid
ou SES resolvem. É o caminho certo se você quiser e-mails de recuperação de senha
com o domínio da empresa.

**b) Dispensar a confirmação** — Authentication → Sign In / Providers → Email,
desmarcar "Confirm email". Defensável aqui: o cadastro já é restrito a convidados
e a domínios liberados (migração 0003), então o endereço já foi validado antes de
chegar na tela. Remove a dependência de e-mail por completo.

### 3. Cadastro público

Pode deixar como está. A migração 0003 recusa cadastro não convidado no próprio
banco, o que vale para o formulário, para a API de admin e para o painel. A chave
"Allow new users to sign up" do painel é reforço, não a fronteira.

## Controle de acesso

```shell
pnpm db:invite --listar                          # quem tem acesso, e os domínios
pnpm db:invite ana@tidebreakers.com.br --admin   # convite individual
pnpm db:invite --dominio outra-empresa.com.br    # organização inteira
pnpm db:invite ana@… --revogar                   # tira o acesso, mantém histórico
```

Hoje: `@tidebreakers.com.br` liberado — qualquer e-mail do domínio cria conta e
já entra ativo, sem convite individual.

## Migrações em produção

Rodam da sua máquina, contra o banco de produção, **antes** do deploy do código
que depende delas:

```shell
pnpm db:migrate
```

O runner é transacional e registra o que já aplicou em `public._migrations`, então
rodar de novo é seguro. `pnpm db:reset` derruba o schema inteiro — nunca em
produção.
