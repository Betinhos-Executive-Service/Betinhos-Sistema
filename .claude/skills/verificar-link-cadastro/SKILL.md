---
name: verificar-link-cadastro
description: "Verifica o link público de cadastro do passageiro: tabela cr40f_linkcadastro, Custom API new_GerarLinkCadastro (Cr40f.Cadastro.Plugin) e flow HTTP cadastro-passageiro-link. Use após mudar esses arquivos ou quando pedirem para testar o link de cadastro, foto do passageiro ou o flow do link."
---
# Verificar link de cadastro do passageiro

## Cobre
- `packages/plugins/Cr40f.Cadastro.Plugin/**`, `Cr40f.Cadastro.Plugin.Tests/**`, `tools/Cr40f.Cadastro.Registrar/**` e `scripts/push-cadastro-plugin.ps1`.
- `packages/deploy/provision-link-cadastro.ps1`, `provision-flow-cadastro-passageiro.ps1` e `flows/cadastro-passageiro-link.{json,test.mjs}`.
- Regras: validade de 36 h; só o SHA-256 (hex minúsculo, UTF-8) do token é gravado; gerar revoga os links ativos do mesmo escopo; serviço cancelado (202410002/202410010) não gera link. No flow, o escopo do link por passageiro é cruzado com os passageiros atuais do serviço; respostas 200/400/404/410/429/500 com corpo genérico.

## Roteiro local
1. `dotnet test packages/plugins/Cr40f.Cadastro.Plugin.Tests` → "Com falha: 0" (13 testes em 22/10/2026).
2. `pnpm --filter ./packages/deploy test` (ou `npm test` em `packages/deploy`) → `fail 0` (126 em 22/10/2026, sendo 11 do flow).
3. Sintaxe dos .ps1: `powershell.exe -NoProfile -Command "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('<arquivo>',[ref]$null,[ref]$e);$e.Count"` → `0`.

## Roteiro no DEV (só da `main`, no checkout principal)
4. `powershell.exe -File packages/deploy/provision-link-cadastro.ps1` (DRY RUN) e depois com `-Apply` → a conferência final lista colunas, a chave do hash e a tabela na solução.
5. `packages/plugins/scripts/push-cadastro-plugin.ps1` → Custom API registrada. Para testar: rodar o registrador com `--testar <reservaId>` → `ok:true`, token oculto; isso cria um link real e revoga os anteriores.
6. `provision-flow-cadastro-passageiro.ps1 -SiteUrl … -BibliotecaId … -Pasta …` (DRY RUN, depois `-Apply`). Chamar o gatilho com `{op:"ler",hash}` → 200; hash inexistente → 404; forçar `cr40f_expiraem` no passado → 410; `salvar` com foto → arquivo `<passageiroId>.jpg` no SharePoint e `new_linkdafoto` preenchido.

## Não verificável sem DEV
Dados reais do Dataverse e escrita no SharePoint (a sobrescrita foi confirmada no DEV em 23/10/2026).

## Página pública (`apps/cadastro-passageiro`, Worker Cloudflare)
1. `node --test apps/cadastro-passageiro/test/api.test.mjs` → `fail 0` (13 em 23/10/2026).
2. `cd apps/cadastro-passageiro && npx wrangler deploy --dry-run` → bindings `RATE_LIMITER` e `ASSETS`, sem publicar.
3. `pnpm dev` (porta 52418, `MODO_LOCAL=1` ativa o mock) → abrir `http://127.0.0.1:52418/#t=` + 43 caracteres `A` em 375 px. Esperado: nome acima de uma foto de 168 px que é o próprio botão; e-mail `abc` bloqueia com "Confira o e-mail"; foto (injetar arquivo no `.foto-input` via DataTransfer) vira prévia; Salvar → "Dados salvos. Obrigado!"; console sem erros.
4. Deploy (só da `main`, checkout principal): `pnpm --filter @betinhos/cadastro-passageiro push` com o `wrangler` logado na conta Betinhos (OAuth) e o secret `FLOW_URL` = URL do gatilho do flow "Cadastro do passageiro | Link".
