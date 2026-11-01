---
name: verificar-portal-worker
description: "Verifica o Worker Cloudflare do portal de validação do cliente (apps/portal-cliente/worker/** e src/api/workerApi.ts): TOTP, cifra, prazo tácito, isolamento por cliente, rotas /api contra Dataverse falso, cron e wrangler dev. Use após mudar o Worker ou o adaptador workerApi."
---
# Verificar Worker do portal do cliente

## Cobre
- `apps/portal-cliente/worker/**` (rotas `/api/*`, login em duas etapas, cron de tácita e resumo, cliente Dataverse S2S) e `apps/portal-cliente/src/api/workerApi.ts`.
- Nomes do Dataverse em `worker/schema.ts`; os marcados `CONFIRMAR` dependem do schema no DEV.
- Multi-cliente (01/11/2026): `auth.ts` autoriza validador cadastrado ou e-mail de domínio autorizado (`cr40f_clientes1.cr40f_portaldominios`, igualdade exata do domínio, cliente único, com módulo) e cria o cadastro em `cr40f_validadorcliente` no 1º pedido de código; a sessão leva `modulos` e `index.ts` responde 403 para rota de módulo que o cliente não tem. `pedidos.ts`: `POST /api/pedidos` cria a reserva em Solicitado (202410004) com `cr40f_Cliente` e `cr40f_PortalUsuario`, 400 por campo, 409 `duplicado` (chave no KV por 60 s); `GET /api/pedidos` lista pelas duas lookups. `dataverse.ts` ganhou `criar()` (id do `OData-EntityId`).

## Roteiro
1. `pnpm --filter @betinhos/portal-cliente typecheck` (app + `tsc -p worker`) e `pnpm --filter @betinhos/portal-cliente test`. Na máquina local o Vitest leva 1–2 min; se `pnpm` travar, rode `node node_modules/vitest/vitest.mjs run worker` dentro de `apps/portal-cliente`.
   - `worker/logica.test.ts`: vetores RFC 6238, janela ±1, AES-GCM com contexto, feriados (Sexta-feira Santa calculada), filtros OData sempre com `_cr40f_cliente_value` e sem Retirado, mapeamento sem telefone de passageiro.
   - `worker/worker.test.ts` (Dataverse falso em `worker/fakeDataverse.ts`): e-mail não cadastrado → 204 sem e-mail; 5 códigos errados → 429; TOTP errado → 401 `totp_invalido`; cookie ausente/adulterado → 401; POST sem `Origin` próprio → 403; validador de outro cliente com id da Tenaris → 404 e nada muda; cron muda só o Liberado vencido e manda um resumo por cliente.
   - Multi-cliente e pedidos (mesmo arquivo): `@latasa.com.br` entra sem cadastro e o registro nasce com o nome do e-mail; e-mail de domínio estranho, subdomínio parecido (`tasa.com`), dois clientes com o mesmo domínio (`ambiguo.com`) e cliente sem módulo (`semmodulo.com`) → 204 sem e-mail e sem cadastro; Tenaris em `/pedidos` e Latasa em `/servicos` → 403; pedido sem origem ou no passado → 400 com a mensagem do campo; pedido completo → 201 `solicitado`, reserva com `cr40f_status` 202410004 e as duas lookups, `cr40f_id` vindo do Dataverse falso; repetição → 409; Meus serviços só do usuário e refletindo `programado` + voucher depois do PATCH.
2. `wrangler dev` (sobe Worker + `dist`): `pnpm --filter @betinhos/portal-cliente build` e `pnpm --dir apps/portal-cliente exec wrangler dev --port 8787`. Sem secrets: `GET /api/servicos` → 401; `POST /api/auth/codigo` com `Origin: http://localhost:8787` → 204; sem `Origin` → 403; `GET /` → index do app, que usa o Worker (sem a dica "Protótipo: use o código"; com `?mock` volta ao mock). No navegador, "Enviar código" chama `POST /api/auth/codigo` → 204. Teste o cron com `--test-scheduled` e `curl "http://localhost:8787/__scheduled?cron=0+11+*+*+1-5"` (sem secrets, o log mostra a falha do token, esperado).
3. Com o schema no DEV e secrets locais em `apps/portal-cliente/.dev.vars` (nunca versionado): repetir os cenários do passo 1 contra o DEV, só com validador de teste. Nunca contra PROD.

## Evidência
- Saída dos testes e do typecheck; respostas do `curl` no `wrangler dev`.

## Fora do alcance
- Deploy (`wrangler deploy`), secrets reais e usuário de aplicação: só com OK do Renan, a partir da `main`. Plugins disparados pela criação da reserva (AutoNumberGuard, preço, compartilhamento) só se veem no DEV.
