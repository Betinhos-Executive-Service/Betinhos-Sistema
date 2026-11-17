---
name: verificar-mcp-dataverse
description: "Verifica o servidor MCP remoto do Dataverse (apps/mcp-dataverse, Cloudflare Worker com OAuth Entra): testes locais, deploy, registro no claude.ai e teste ponta a ponta em DEV e PROD. Use após mudar apps/mcp-dataverse/** ou quando pedirem para testar, publicar ou registrar o conector MCP do Dataverse."
---
# Verificar o MCP do Dataverse

## Cobre
- Código: `apps/mcp-dataverse/**` (`tools.ts`, `dataverse.ts`, `entra.ts`, `auth.ts`, `mcp.ts`, `index.ts`, `wrangler.jsonc`).
- Não cobre schema nem flows; o Worker só chama a Web API como a pessoa logada.

## 1. Local, sem rede (sempre)
Em `apps/mcp-dataverse`:
1. `pnpm typecheck` sem erros.
2. `pnpm test` verde (fetch simulado: resolução de EntitySet, OData/FetchXML, trava `confirmar` do PROD, truncamento, validação de tenant/domínio, troca e renovação de token, erros do Dataverse).
3. `npx wrangler deploy --dry-run --outdir <pasta temporária>` conclui; confira o tamanho gzip (limite do plano gratuito: 3 MB) e que o KV ainda mostra o id real (não `TROCAR_PELO_ID_DO_KV`) antes do deploy de verdade. O binding `RL_USER` (ratelimits) é criado no deploy; `observability` está ligado.

## 2. Deploy (só pelo Renan, do checkout principal)
1. `npx wrangler kv namespace create OAUTH_KV`; gravar o id em `wrangler.jsonc`.
2. `npx wrangler secret put ENTRA_CLIENT_SECRET` e `COOKIE_ENCRYPTION_KEY` (valor lido do prompt do wrangler; nunca no comando, em arquivo versionado ou no chat).
3. `pnpm deploy`. Conferir `https://mcp-dataverse.betinhosexecutiveservice.workers.dev/` (nome e versão) e que `/mcp` sem token responde 401 com `WWW-Authenticate`.

## 3. Registro no claude.ai
Configurações → Conectores → Adicionar personalizado → `https://mcp-dataverse.betinhosexecutiveservice.workers.dev/mcp`. Esperado: tela de consentimento do Worker, login Microsoft com conta `@betinhos.com.br`, volta ao claude.ai com o conector ativo. Conta de outro domínio ou tenant deve cair em página de erro 403.

## 4. Ponta a ponta (no claude.ai, conector ativo)
DEV (livre):
1. `whoami` com `ambiente: DEV`: conta, nome e organização corretos.
2. `list_tables` com filtro `reserva`, depois `describe_table` em `cr40f_reservadeveculos`.
3. `read_query` em `cr40f_reservadeveculos` com `select` de 3 colunas e `tamanhoPagina: 5`; conferir valores formatados e `proximaPagina`. Repetir com `fetchXml`.
4. Escrita em DEV: `create_record` e `delete_record` de um registro de teste; `update_record` sem `confirmar` funciona no DEV.

PROD (somente leitura, exceto o teste abaixo, que o Renan precisa pedir e acompanhar):
1. Leitura: `read_query` com `ambiente: PROD` em `cr40f_reservadeveculos`, `tamanhoPagina: 5`.
2. Trava: `update_record` em PROD sem `confirmar` deve devolver erro com "PRÉVIA" e nada gravado.
3. Escrita real, só com o Renan junto: no registro `f9a9d2b2-4818-430f-9630-01e6629a0dc3`, gravar `.` em `cr40f_observaointerna` com `confirmar: true`, ler de volta, e depois remover o `.` (restaurar o valor original lido antes; se estava vazio, enviar `null`). Pedir ao Renan que confira a auditoria do registro (quem alterou deve ser ele, não uma conta de serviço).

## Falhas conhecidas e onde olhar
- Conferir no `npx wrangler tail` uma linha JSON por chamada (`evento: tool`) sem filtros nem dados; exclusão no PROD sem `confirmacao_texto` deve voltar BLOQUEADO.
- Login volta com `invalid_grant`/`AADSTS`: redirect do Entra faltando ou secret expirado (`npx wrangler tail`; os logs nunca trazem token).
- `401` repetido nas ferramentas: sessão Microsoft expirada; remover e adicionar o conector de novo.
- `search` falha: Dataverse Search desligado no ambiente.
- `execute_prompt` é melhor esforço: o formato das entradas depende de cada prompt do AI Builder; valide com um prompt real em DEV antes de confiar.
- Dados sensíveis: não cole respostas com CPF ou telefone em chats públicos; o repositório é público e nada disso entra em teste ou código.
