# Worker do portal do cliente

Backend do `apps/portal-cliente` no Cloudflare Workers (mesma conta do `cadastro-passageiro`). Serve o build (`./dist`) e as rotas `/api/*`; o cron (8h, seg–sex) aplica a aprovação tácita e manda o resumo diário.

Multi-cliente: cada cliente (`cr40f_clientes1`) tem `cr40f_portalhabilitado`, `cr40f_portalmodulos` (Validar / Pedir / Meus serviços) e `cr40f_portaldominios`. Entra quem é validador cadastrado ativo ou tem e-mail de um domínio autorizado de um único cliente com módulo (o cadastro em `cr40f_validadorcliente` é criado no primeiro pedido de código). Cada pessoa cria a própria senha no 1º acesso (código por e-mail); "Esqueci a senha" segue o mesmo caminho. A sessão dura 30 dias e é conferida no Dataverse a cada chamada (ativo, portal habilitado, módulos e senha atual), e cada rota exige o seu módulo: Tenaris = Validar; Latasa = Pedir + Meus serviços.

| Rota | O que faz |
|---|---|
| `POST /api/auth/entrar` | `{email, senha}` → sessão (cookie de 30 dias); sem cadastro, sem senha ou senha errada: 401 `senha_invalida` |
| `POST /api/auth/codigo` | 1º acesso e "Esqueci a senha": e-mail autorizado (cadastro ou domínio) → 204 e o código (10 min); sem acesso → 403 `sem_acesso` (decisão do Renan, 24/11/2026); 10 negados do mesmo IP em 15 min → 429 |
| `POST /api/auth/codigo/confirmar` | `{email, codigo}` → libera a criação da senha por 10 min (cookie da etapa) |
| `POST /api/auth/senha` | `{senha}` (8 a 200 caracteres) → grava o hash, derruba as sessões antigas e abre a sessão |
| `GET /api/auth/sessao` | Sessão atual ou 401 (o portal abre já logado) |
| `POST /api/auth/sair` | Apaga a sessão |
| `GET /api/servicos` | Serviços do cliente da sessão (sem Retirado) |
| `POST /api/servicos/aprovar` | `{ids}` em lote |
| `POST /api/servicos/:id/duvida` · `/responder` | `{motivo, texto}` · `{texto}` |
| `GET /api/passageiros?q=` | Módulo Pedir: até 20 passageiros ativos do cliente da sessão (`cr40f_bancodedados`), filtrados por nome |
| `GET /api/enderecos?q=` | Módulo Pedir: até 6 sugestões `[{rotulo, endereco}]` da TomTom Search (`typeahead`, BR, pt-BR; POI, endereço e rua). Mínimo 3 caracteres, `q` até 100. Sem `TOMTOM_KEY` ou com a TomTom falhando responde `[]` (o campo continua texto livre) |
| `GET /api/rota?o=&d=` | Módulo Pedir: prévia do trajeto `{distanciaKm, minutos}` (TomTom Geocoding + Routing com trânsito, no servidor). Mesmos limites de `q`; sem `TOMTOM_KEY`, endereço não achado ou TomTom falhando responde `null` (a prévia só não aparece) |
| `POST /api/pedidos` | Módulo Pedir: `{passageiros[{id?, nome, telefone?, email?}], origem, destino, saida, tipoVeiculo?, observacao?}` (celular ou e-mail por passageiro; vínculos em `cr40f_servicosporpassageiro`) → reserva em **Solicitado** (`cr40f_status` 202410004) ligada ao cliente e ao usuário (`cr40f_portalusuario`), com o pedido do cliente em `cr40f_portalpedido` (JSON); 400 com a mensagem do campo; 409 `duplicado` para o mesmo pedido em 1 min |
| `GET /api/pedidos` | Módulo Meus serviços: reservas pedidas pelo usuário da sessão, com passageiros (`pessoas`), `tipoVeiculo`, status, veículo e voucher quando programadas |

Segurança: 5 erros (senha ou código) no mesmo e-mail → 15 min de bloqueio; limite por IP e por e-mail (`ratelimits`); CSRF por `Origin`; senha só como PBKDF2-SHA256 (100 mil iterações, sal próprio, `cr40f_senhahash` com segurança de coluna e sem auditoria: só o perfil "Portal do cliente - senha", com o usuário de aplicação do Worker, e o Administrador do Sistema leem; migration 20261124-1700); senha vale só com `cr40f_senhadefinidaem` preenchida (o "Zerar senha" do shell limpa só a data); código só como SHA-256; cookies cifrados (AES-GCM, `CHAVE_SESSAO`); toda consulta filtra pelo cliente da sessão; rota de módulo que o cliente não tem → 403. O número da reserva (`cr40f_id`) é do autonumber do Dataverse; o Worker nunca o inventa.

## Publicação (cliente.betinhos.com.br)

Dois Workers e dois projetos Pages na conta Cloudflare do `cadastro-passageiro`. **Publicação é só pelo GitHub** (push na `develop` → DEV, push na `main` → PROD); `pnpm deploy:dev` fica para emergência local.

- `portal-cliente-dev` (`wrangler deploy --env dev`, Dataverse DEV): job `portal` do `deploy.yml` a cada push na `develop` (tag `portal-dev-publicado`). KV `portal-cliente-dev`; `PORTAL_URL` = `https://cliente.dev.betinhos.com.br/`.
- `portal-cliente` (`wrangler deploy`, Dataverse PROD): job `portal` do `producao.yml` a cada push na `main`, environment `prod-front`. KV `portal-cliente`.
- Pages (só `pages/functions/api/[[path]].ts`, que repassa `/api/*` ao Worker por service binding `API`; o `wrangler.jsonc` nasce em `scripts/publicar-pages.mjs`, numa pasta temporária). `portal-cliente-dev` (`portal-cliente-dev-67b.pages.dev`, domínio `cliente.dev.betinhos.com.br`) → Worker `portal-cliente-dev`. `portal-cliente` (`portal-cliente-5jp.pages.dev`, domínio `cliente.betinhos.com.br`) → Worker da variável do repositório **`PORTAL_API_SERVICE`** (vazia = `portal-cliente-dev`, o piloto). **Para ligar o PROD: defina `PORTAL_API_SERVICE=portal-cliente` em Settings → Variables → Actions e rode "Produção" (`workflow_dispatch`, caminho `portal`) ou espere o próximo push na `main`; sem PR.** Os domínios têm CNAME na Locaweb (a zona não está na Cloudflare, por isso Pages): `cliente` → `portal-cliente-5jp.pages.dev`, `cliente.dev` → `portal-cliente-dev-67b.pages.dev`. Cron e ratelimit ficam no Worker. A versão (`vX.Y.Z`) sobe a cada deploy sobre a maior entre o repo e a do ar (`<meta name="portal-versao">`); resumo do job e `conferir-no-ar.sh` mostram a versão.
- `pnpm --dir apps/portal-cliente deploy:dev` (emergência, wrangler logado): build, Worker DEV e Pages `portal-cliente-dev`. Nunca publique o PROD à mão.

Por ambiente, uma vez:

1. Papel `Portal do Cliente` (migration `20261124-1000-portal-cliente-papel.ps1`; PROD pelas soluções): o mínimo que o Worker usa. Criar reserva dispara os plugins da tabela (AutoNumberGuard, preço, compartilhamento): confira no DEV antes do piloto.
2. App registration no Entra com client secret, usuário de aplicação no Dataverse com o papel `Portal do Cliente`.
3. Secrets (`pnpm exec wrangler secret put <NOME> [--env dev]`, valor pelo stdin, nunca no comando): `DV_TENANT`, `DV_CLIENT_ID`, `DV_CLIENT_SECRET`, `DV_URL`, `EMAIL_FLOW_URL`, `CHAVE_SESSAO`; opcional `TOMTOM_KEY` (chave da TomTom Search, a mesma conta do acompanhar-motorista; sem ela o Pedir só não sugere endereço). A chave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, uma por ambiente. Trocar `CHAVE_SESSAO` derruba todas as sessões (as senhas continuam).

## Local

- `pnpm test` (lógica pura + rotas contra o Dataverse falso de `worker/fakeDataverse.ts`) e `pnpm typecheck`.
- `pnpm build && pnpm exec wrangler dev` sobe Worker + assets; sem secrets, as rotas que tocam o Dataverse respondem 500 (`falha`).
- Qual API o app usa (`src/main.tsx`): mock só no dev server local (`pnpm dev`, porta 52463, em `localhost`/`127.0.0.1`) ou com `?mock` na URL; em qualquer outro endereço (workers.dev, `wrangler dev`) usa `createWorkerApi()`. A dica do código e o `?apagar-senhas` só existem no mock.
