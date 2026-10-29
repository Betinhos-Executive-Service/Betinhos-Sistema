---
name: verificar-flow-emails-portal
description: "Verifica o flow HTTP 'Portal cliente – e-mails' (código de acesso, resumo diário e resposta da Betinhos pela caixa compartilhada do financeiro). Use após mudar packages/deploy/flows/portal-cliente-emails.*, os modelos em flows/portal-cliente-emails/*.html ou provision-flow-portal-cliente-emails.ps1."
---
# Verificar flow de e-mails do portal do cliente

## Cobre
- `packages/deploy/flows/portal-cliente-emails.json` (definição), `flows/portal-cliente-emails/*.html` (modelos com `{{campo}}`), `flows/portal-cliente-emails.test.mjs` e `packages/deploy/provision-flow-portal-cliente-emails.ps1`.
- Contrato com o Worker do portal: POST `{ tipo, para[], dados }`; respostas `202 {ok:true}`, `400 {ok:false,codigo}` (`entrada_invalida`/`tipo_invalido`), `502 {ok:false,codigo:'falha_envio'}`. Nunca ecoa dados.
- Resumo sem nada liberado nem vencendo: 202 sem enviar. `valor` do resumo é número (o flow formata em R$); data/prazo chegam já formatados.

## Roteiro
1. Testes: `node --test packages/deploy/flows/portal-cliente-emails.test.mjs` (ou `pnpm --dir packages/deploy test`). O teste executa as expressões do próprio flow num mini-interpretador: renderiza os 3 e-mails, confere escape de HTML (`<script>`, aspas, `{{`), campos obrigatórios por tipo, destinatários inválidos e assuntos.
2. Visual: `PORTAL_EMAILS_EXEMPLOS=<pasta-temporária> node --test packages/deploy/flows/portal-cliente-emails.test.mjs` grava `codigo.html`, `resumo_diario.html`, `resposta_betinhos.html`. Sirva a pasta por HTTP (o painel do navegador não abre arquivo fora do projeto; ex.: entrada temporária no `.claude/launch.json` com `python -m http.server`, removida depois) e confira em 700 px (cartão de 640 px) e 375 px (`document.documentElement.scrollWidth === innerWidth`, nenhuma `<img>`, CTA "Abrir o portal" com 44 px).
3. Simulação no DEV (só leitura): `powershell -File packages/deploy/provision-flow-portal-cliente-emails.ps1 -CaixaCompartilhada <caixa>` → termina em `DRY RUN OK; use -Apply`. Connection reference padrão `new_sharedoffice365_f87d5`.
4. Aplicar (`-Apply`) só da `main` no checkout principal. Inclui o flow na AppBetinhos e na BetinhosAutomacao, ativa e imprime a URL do gatilho (SAS) para o secret do Worker. Não cole a URL no chat nem no repo.
5. Depois de aplicar: POST de teste com `tipo: 'codigo'` e `para` = caixa de teste interna → 202 e e-mail recebido com remetente da caixa compartilhada; POST com `tipo: 'x'` → 400 `tipo_invalido`.

## Evidência
- Saída do `node --test` (pass/fail), screenshots 700/375 px dos três e-mails, saída do dry run.
