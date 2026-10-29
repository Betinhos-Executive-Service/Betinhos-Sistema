# Worker do portal de validação

Backend do `apps/portal-cliente` no Cloudflare Workers (mesma conta do `cadastro-passageiro`). Serve o build (`./dist`) e as rotas `/api/*`; o cron (8h, seg–sex) aplica a aprovação tácita e manda o resumo diário.

| Rota | O que faz |
|---|---|
| `POST /api/auth/codigo` | Sempre 204; se o e-mail é de validador ativo, manda o código (10 min) |
| `POST /api/auth/entrar` | Código do e-mail → `cadastrar_autenticador` (QR), `autenticador` ou `ok` (dispositivo lembrado) |
| `POST /api/auth/totp` | Código do autenticador (`lembrar` = 30 dias) → sessão (cookie 12 h) |
| `POST /api/auth/sair` | Apaga a sessão |
| `GET /api/servicos` | Serviços do cliente da sessão (sem Retirado) |
| `POST /api/servicos/aprovar` | `{ids}` em lote |
| `POST /api/servicos/:id/duvida` · `/responder` | `{motivo, texto}` · `{texto}` |

Segurança: 5 erros (código ou TOTP) no mesmo e-mail → 15 min de bloqueio; limite por IP e por e-mail (`ratelimits`); CSRF por `Origin`; segredo TOTP cifrado (AES-GCM, `CHAVE_TOTP`); código e token do dispositivo só como SHA-256; toda consulta filtra pelo cliente da sessão.

## Antes do 1º deploy (nada disso foi feito)

1. Schema no DEV: tabelas de `packages/deploy/provision-portal-cliente.ps1` e as de validador, mensagem, código e dispositivo. Confira os nomes marcados `CONFIRMAR` em `worker/schema.ts`.
2. Usuário de aplicação (Entra ID + Dataverse) com papel mínimo: leitura de `cr40f_reservadeveculos`, `cr40f_composicaodeprecos` e `cr40f_clientes1`; leitura e escrita só em `cr40f_validacaoservico`, `cr40f_validadorcliente`, `cr40f_mensagemvalidacao`, `cr40f_codigoacesso` e `cr40f_dispositivoconfiavel`. Sem acesso a contato/telefone de passageiro.
3. KV: `wrangler kv namespace create portal-cliente` e troque o id em `wrangler.jsonc`.
4. Secrets (`pnpm exec wrangler secret put <NOME>`): `DV_TENANT`, `DV_CLIENT_ID`, `DV_CLIENT_SECRET`, `DV_URL`, `EMAIL_FLOW_URL`, `CHAVE_TOTP`, `CHAVE_SESSAO`. As chaves: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, uma para cada. Trocar `CHAVE_TOTP` invalida todos os autenticadores cadastrados.
5. `pnpm build && pnpm exec wrangler deploy` (da `main`).

## Local

- `pnpm test` (lógica pura + rotas contra o Dataverse falso de `worker/fakeDataverse.ts`) e `pnpm typecheck`.
- `pnpm build && pnpm exec wrangler dev` sobe Worker + assets; sem secrets, as rotas que tocam o Dataverse respondem 500 (`falha`).
- Qual API o app usa (`src/main.tsx`): mock só no dev server local (`pnpm dev`, porta 52463, em `localhost`/`127.0.0.1`) ou com `?mock` na URL; em qualquer outro endereço (workers.dev, `wrangler dev`) usa `createWorkerApi()`. A dica do código e o `?refazer-autenticador` só existem no mock.
