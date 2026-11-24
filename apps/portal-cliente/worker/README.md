# Worker do portal do cliente

Backend do `apps/portal-cliente` no Cloudflare Workers (mesma conta do `cadastro-passageiro`). Serve o build (`./dist`) e as rotas `/api/*`; o cron (8h, seg–sex) aplica a aprovação tácita e manda o resumo diário.

Multi-cliente: cada cliente (`cr40f_clientes1`) tem `cr40f_portalhabilitado`, `cr40f_portalmodulos` (Validar / Pedir / Meus serviços) e `cr40f_portaldominios`. Entra quem é validador cadastrado ativo ou tem e-mail de um domínio autorizado de um único cliente com módulo (o cadastro em `cr40f_validadorcliente` é criado no primeiro pedido de código). Os módulos vão na sessão (cookie de 12 h) e cada rota exige o seu: Tenaris = Validar; Latasa = Pedir + Meus serviços.

| Rota | O que faz |
|---|---|
| `POST /api/auth/codigo` | Sempre 204; se o e-mail é de usuário autorizado (cadastro ou domínio), manda o código (10 min) |
| `POST /api/auth/entrar` | Código do e-mail → `cadastrar_autenticador` (QR), `autenticador` ou `ok` (dispositivo lembrado) |
| `POST /api/auth/totp` | Código do autenticador (`lembrar` = 30 dias) → sessão (cookie 12 h) |
| `POST /api/auth/sair` | Apaga a sessão |
| `GET /api/servicos` | Serviços do cliente da sessão (sem Retirado) |
| `POST /api/servicos/aprovar` | `{ids}` em lote |
| `POST /api/servicos/:id/duvida` · `/responder` | `{motivo, texto}` · `{texto}` |
| `POST /api/pedidos` | Módulo Pedir: `{passageiros[], origem, destino, saida, observacao?}` → reserva em **Solicitado** (`cr40f_status` 202410004) ligada ao cliente e ao usuário (`cr40f_portalusuario`), com o pedido do cliente em `cr40f_portalpedido` (JSON); 400 com a mensagem do campo; 409 `duplicado` para o mesmo pedido em 1 min |
| `GET /api/pedidos` | Módulo Meus serviços: reservas pedidas pelo usuário da sessão, com status, veículo e voucher quando programadas |

Segurança: 5 erros (código ou TOTP) no mesmo e-mail → 15 min de bloqueio; limite por IP e por e-mail (`ratelimits`); CSRF por `Origin`; segredo TOTP cifrado (AES-GCM, `CHAVE_TOTP`); código e token do dispositivo só como SHA-256; toda consulta filtra pelo cliente da sessão; rota de módulo que o cliente não tem → 403. O número da reserva (`cr40f_id`) é do autonumber do Dataverse; o Worker nunca o inventa.

## Publicação (cliente.betinhos.com.br)

Dois Workers e um projeto Pages na conta Cloudflare do `cadastro-passageiro`:

- `portal-cliente-dev` (`wrangler deploy --env dev`, Dataverse DEV): piloto. KV `portal-cliente-dev`.
- `portal-cliente` (`wrangler deploy`, Dataverse PROD): só depois do piloto, a partir da `main`. KV `portal-cliente`.
- Pages `portal-cliente` (`pages/`, `portal-cliente-5jp.pages.dev`): serve o `dist` e repassa `/api/*` ao Worker por service binding (`pages/functions/api/[[path]].ts`). Produção (branch `main` do Pages) liga no `portal-cliente`; preview (`--branch dev`, `dev.portal-cliente-5jp.pages.dev`) no `portal-cliente-dev`. O domínio `cliente.betinhos.com.br` é custom domain do Pages com CNAME na Locaweb para `portal-cliente-5jp.pages.dev` (a zona não está na Cloudflare, por isso Pages e não custom domain de Worker). Cron e ratelimit ficam no Worker.
- `pnpm --dir apps/portal-cliente deploy:dev` faz build, Worker DEV e Pages preview.

Por ambiente, uma vez:

1. Papel `Portal do Cliente` (migration `20261124-1000-portal-cliente-papel.ps1`; PROD pelas soluções): o mínimo que o Worker usa. Criar reserva dispara os plugins da tabela (AutoNumberGuard, preço, compartilhamento): confira no DEV antes do piloto.
2. App registration no Entra com client secret, usuário de aplicação no Dataverse com o papel `Portal do Cliente`.
3. Secrets (`pnpm exec wrangler secret put <NOME> [--env dev]`, valor pelo stdin, nunca no comando): `DV_TENANT`, `DV_CLIENT_ID`, `DV_CLIENT_SECRET`, `DV_URL`, `EMAIL_FLOW_URL`, `CHAVE_TOTP`, `CHAVE_SESSAO`. As chaves: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, uma para cada e por ambiente. Trocar `CHAVE_TOTP` invalida todos os autenticadores cadastrados.

## Local

- `pnpm test` (lógica pura + rotas contra o Dataverse falso de `worker/fakeDataverse.ts`) e `pnpm typecheck`.
- `pnpm build && pnpm exec wrangler dev` sobe Worker + assets; sem secrets, as rotas que tocam o Dataverse respondem 500 (`falha`).
- Qual API o app usa (`src/main.tsx`): mock só no dev server local (`pnpm dev`, porta 52463, em `localhost`/`127.0.0.1`) ou com `?mock` na URL; em qualquer outro endereço (workers.dev, `wrangler dev`) usa `createWorkerApi()`. A dica do código e o `?refazer-autenticador` só existem no mock.
