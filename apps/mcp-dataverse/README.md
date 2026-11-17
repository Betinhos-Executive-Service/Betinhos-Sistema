# mcp-dataverse

Servidor MCP remoto do Dataverse da Betinhos, num Cloudflare Worker (plano gratuito). Faz o que o MCP nativo do Dataverse faz, sem gastar Copilot Credits: login com a conta Microsoft (Entra, delegado) e chamadas à Web API v9.2 como a própria pessoa.

- Streamable HTTP em `/mcp`; SSE em `/sse`; página simples em `/`.
- Worker = servidor OAuth do claude.ai (`@cloudflare/workers-oauth-provider`, com registro dinâmico de cliente) e do Entra (PKCE + client secret). Só contas `@betinhos.com.br` do tenant da Betinhos.
- Toda ferramenta aceita `ambiente`: `DEV` (padrão), `TEST` ou `PROD`. Escrita no PROD exige `confirmar: true`; sem isso volta só uma prévia. `delete_record` e `delete_table` no PROD pedem também `confirmacao_texto` (GUID ou nome lógico).
- Saída enxuta: sem `@odata.*` e sem nulos; `campo@txt` traz o rótulo formatado (só quando difere do valor) e `campo@tab` a tabela do lookup.
- Cache no SQLite do Durable Object (sobrevive à hibernação): token de acesso por ambiente, nome lógico para EntitySetName (6 h), `describe_table` e `list_tables` (1 h); `atualizar: true` ignora o cache e criar/alterar/excluir tabela invalida.
- Repete 429/503/504 (até 2 vezes, respeitando `Retry-After`, espera total máxima de 15 s; 504 só em leitura); 25 s de timeout por chamada.
- Limite de 120 chamadas por minuto por usuário (binding `ratelimits` `RL_USER`, criado no deploy). Logs de Workers: uma linha JSON por chamada (ferramenta, ambiente, ms, status, ok, e-mail), nunca dados, filtros ou tokens (`npx wrangler tail`).
- SQL/TDS não existe na Web API: `read_query` usa OData ou FetchXML.

## Ferramentas

`whoami`, `list_tables`, `describe_table`, `read_query`, `search`, `fetch`, `create_record`, `update_record`, `upsert_record`, `delete_record`, `create_table`, `update_table`, `delete_table`, `list_prompts`, `execute_prompt` (melhor esforço), `execute_action`, `associate`, `disassociate`. Respostas até ~60 KB e páginas de até 200 linhas (padrão 50), com aviso de truncamento e `proximaPagina`/`pagingCookie`.

## Publicar

1. Criar o KV e colocar o id em `wrangler.jsonc` (substitui `TROCAR_PELO_ID_DO_KV`): `npx wrangler kv namespace create OAUTH_KV`.
2. Segredos (nunca no repositório):
   ```
   npx wrangler secret put ENTRA_CLIENT_SECRET
   npx wrangler secret put COOKIE_ENCRYPTION_KEY   # 32+ caracteres aleatórios
   ```
3. `pnpm deploy` (dentro de `apps/mcp-dataverse`).
4. O app do Entra precisa dos redirects `https://mcp-dataverse.betinhosexecutiveservice.workers.dev/callback` e `http://localhost:8788/callback`, com permissão delegada `user_impersonation` do Dynamics CRM.

## Registrar no claude.ai

Configurações → Conectores → Adicionar personalizado → `https://mcp-dataverse.betinhosexecutiveservice.workers.dev/mcp`. Na primeira vez abre o consentimento e o login Microsoft.

## Local

```
cp .dev.vars.example .dev.vars   # preencher os dois segredos; MCP_RESOURCE já aponta para localhost
pnpm dev                         # http://localhost:8788
pnpm typecheck && pnpm test
```

Testes: `fetch` simulado, sem rede nem Dataverse real. Roteiro de verificação ponta a ponta: skill `verificar-mcp-dataverse`.
