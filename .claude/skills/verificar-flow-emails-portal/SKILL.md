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
2. Visual: `PORTAL_EMAILS_EXEMPLOS=<pasta-temporária> node --test packages/deploy/flows/portal-cliente-emails.test.mjs` grava `codigo.html`, `resumo_diario.html`, `resposta_betinhos.html`. Sirva a pasta por HTTP (o painel do navegador não abre arquivo fora do projeto; ex.: entrada temporária no `.claude/launch.json` com `python -m http.server`, removida depois) e confira em 700 px (cartão de 640 px) e 375 px (`document.documentElement.scrollWidth === innerWidth`, só a `<img>` da logo (`{{logoUrl}}`, 143×80, alt "Betinhos Executive Service"; nos exemplos aponta para `cliente.betinhos.com.br`, então troque pelo PNG local `apps/portal-cliente/public/email/logo-betinhos.png` para ver), CTA "Abrir o portal" com 44 px).
3. Simulação no DEV (só leitura): `powershell -File packages/deploy/provision-flow-portal-cliente-emails.ps1 -CaixaCompartilhada <caixa>` → termina em `DRY RUN OK; use -Apply`. Connection reference padrão `new_sharedoffice365_f87d5`.
4. Aplicar (`-Apply`) só da `main` no checkout principal. Inclui o flow na AppBetinhos e na BetinhosAutomacao, ativa e imprime a URL do gatilho (SAS) para o secret do Worker. Não cole a URL no chat nem no repo.
5. Depois de aplicar: POST de teste com `tipo: 'codigo'` e `para` = caixa de teste interna → 202 e e-mail recebido com remetente da caixa compartilhada; POST com `tipo: 'x'` → 400 `tipo_invalido`.
6. Contrato com o Worker: `worker.test.ts` confere os campos que o flow exige (`codigo`: nome, codigo, validadeMinutos; `resumo_diario`: nome, cliente, linkPortal, `liberadosHoje[{numero,data,trajeto,valor}]`, `vencendo[{numero,prazo}]`). O Worker manda `logoUrl` = `PORTAL_URL` + `email/logo-betinhos.png`; confira `curl -sI <PORTAL_URL>email/logo-betinhos.png` → 200 `image/png` (sem o arquivo, o fallback de SPA devolve HTML com 200). Prova real: run do flow no DEV com `Enviar_*` Succeeded e o e-mail na caixa.

## Evidência
- Saída do `node --test` (pass/fail), screenshots 700/375 px dos três e-mails, saída do dry run.

## Tipos de aviso e aprovação (25/11/2026)
- Cinco casos novos no Switch: `Confirmado`, `AprovacaoPendente`, `AprovacaoLembrete`, `AprovacaoResultado` e `AvisoOperacao`, com modelos HTML em `packages/deploy/flows/portal-cliente-emails/`. `AvisoOperacao` vai com `para: []` e o flow envia à caixa compartilhada (`__CAIXA_COMPARTILHADA__`); para inválido ainda responde 400.
- Teste: `node --test packages/deploy/flows/portal-cliente-emails.test.mjs` (19 testes); com `PORTAL_EMAILS_EXEMPLOS=<pasta>` grava o HTML de exemplo de cada modelo. O flow existente publica pelo Deploy; o e-mail real não foi enviado.

## Cancelamento pelo cliente (25/11/2026)
- Caso `CancelamentoOperacao` (`tipo: cancelamento_operacao`, modelo `cancelamento-operacao.html`, assunto "Pedido do portal cancelado pelo cliente: <numero>"). `Para_ok` aceita `para` vazio para `aviso_operacao` e `cancelamento_operacao`; o campo opcional `situacao` (Confirmado/Programado) entra no gatilho. Teste: 20 testes em `portal-cliente-emails.test.mjs`. E-mail real não enviado.
