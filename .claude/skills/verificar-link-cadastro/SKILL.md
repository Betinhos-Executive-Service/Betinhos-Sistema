---
name: verificar-link-cadastro
description: "Verifica o link público de cadastro do passageiro: tabela cr40f_linkcadastro, Custom API new_GerarLinkCadastro (Cr40f.Cadastro.Plugin) e flow HTTP cadastro-passageiro-link. Use após mudar esses arquivos ou quando pedirem para testar o link de cadastro, foto do passageiro ou o flow do link."
---
# Verificar link de cadastro do passageiro

## Cobre
- `packages/plugins/Cr40f.Cadastro.Plugin/**`, `Cr40f.Cadastro.Plugin.Tests/**`, `tools/Cr40f.Cadastro.Registrar/**` e `scripts/push-cadastro-plugin.ps1`.
- `packages/deploy/provision-link-cadastro.ps1`, `provision-flow-cadastro-passageiro.ps1` e `flows/cadastro-passageiro-link.{json,test.mjs}`.
- Regras: validade de 36 h; só o SHA-256 (hex minúsculo, UTF-8) do token é gravado; gerar revoga os links ativos do mesmo escopo; serviço cancelado (202410002/202410010) não gera link. No flow, o escopo do link por passageiro é cruzado com os passageiros atuais do serviço; respostas 200/400/404/410/429/500 com corpo genérico.
- Link da foto (`new_linkdafoto`): sempre URL com caminho, `https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/<DEV|PROD>/<id>.<ext>`, montada do `Path` devolvido pelo CreateFile (`replace(uriComponent(Path), '%2F', '/')`). Nunca link de compartilhamento (`/:i:/s/<token>`, CreateSharingLink): o Formulário Geral (`passengerPhotoPathUrl`) só exibe `/:x:/r/`. Vale também para o "Flow Salvar Foto BD" (`patch-flow-salvar-foto-sharepoint.ps1`, idempotente) e para os registros antigos (`regravar-links-fotos.ps1 -Ambiente DEV|PROD`, DRY RUN sem `-Apply`; exige login no Graph).

## Roteiro local
1. `dotnet test packages/plugins/Cr40f.Cadastro.Plugin.Tests` → "Com falha: 0" (34 testes em 24/10/2026: 13 do link + 21 da foto).
2. `pnpm --filter ./packages/deploy test` (ou `npm test` em `packages/deploy`) → `fail 0` (127 em 23/10/2026); o teste do flow exige zero CreateSharingLink e o link com `/:i:/r`.
3. Sintaxe dos .ps1: `powershell.exe -NoProfile -Command "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('<arquivo>',[ref]$null,[ref]$e);$e.Count"` → `0`.

## Roteiro no DEV (só da `main`, no checkout principal)
4. `powershell.exe -File packages/deploy/provision-link-cadastro.ps1` (DRY RUN) e depois com `-Apply` → a conferência final lista colunas, a chave do hash e a tabela na solução.
5. `packages/plugins/scripts/push-cadastro-plugin.ps1` → Custom API registrada. Para testar: rodar o registrador com `--testar <reservaId>` → `ok:true`, token oculto; isso cria um link real e revoga os anteriores.
6. `provision-flow-cadastro-passageiro.ps1 -SiteUrl … -BibliotecaId … -Pasta …` (DRY RUN, depois `-Apply`). Chamar o gatilho com `{op:"ler",hash}` → 200; hash inexistente → 404; forçar `cr40f_expiraem` no passado → 410; `salvar` com foto → arquivo `<passageiroId>.jpg` no SharePoint e `new_linkdafoto` preenchido com `/:i:/r/sites/...` (abrir no Formulário Geral e ver a foto).

## Custom API `new_ObterFotoPassageiro` (foto para o App Motoristas)
- Código: `ObterFotoPassageiroHandler.cs`, `ObterFotoPassageiroPlugin.cs`, `ConsultaArquivoFlow.cs` (HTTP atrás de `IConsultaArquivo`) e `PassageirosDoServico.cs` (rotina de ids compartilhada com o link de cadastro).
- Regras, a cada chamada (serviço do sistema): reserva `cr40f_status = 202410005` (Programado); `cr40f_funcionarios.cr40f_emailmicrosoft` do `_cr40f_motorista_value` igual (minúsculo) ao `domainname` ou `internalemailaddress` do iniciador; passageiro nos filhos `cr40f_servicosporpassageiro` (fallback `passageiro1..4`); `new_linkdafoto` começa com `https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/`, sem `..`, `\` ou segmento vazio. Qualquer negação → `{"ok":false,"motivo":"indisponivel"}`; o detalhe só no trace do plugin.
- Leitura: POST no gatilho do "Flow - Consultar Arquivos Sharepoint" com `{id, fileLocator:"", caminhoSharePoint, nomeArquivo}`; `caminhoSharePoint` = `/Documentos Compartilhados/<resto decodificado>` (o flow usa `GetFileContentByPath` com dataset = site BetinhosGestoInterna). Timeout 20 s, resposta até 5 MB, só `image/*`.
- Registro: Custom API sem plugintype (`allowedcustomprocessingsteptype = 2`) + step síncrono stage 40 `Cadastro | new_ObterFotoPassageiro | PostOperation`. A URL do flow vai na configuração segura do step: `push-cadastro-plugin.ps1 -FotoFlowUrl '<url>'` ou `$env:CADASTRO_FOTO_FLOW_URL` antes do `pnpm push:plugin:cadastro:dev`. Sem ela, mantém a já gravada (primeira vez: "ATENCAO: step sem configuracao segura"). Nunca versionar nem imprimir a URL.
- DEV: `dotnet run --project packages/plugins/tools/Cr40f.Cadastro.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com --testarFoto <reservaId> --passageiroId <id>` → como usuário que não é o motorista: `ok:false`. Como o motorista (App Motoristas, serviço Programado, passageiro com foto): `ok:true`, `mimeType image/*`. Mudar o status para Em Execução (202410006) → `ok:false` na chamada seguinte. Trace em Plug-in Trace Log mostra o motivo.

## Não verificável sem DEV
Dados reais do Dataverse e escrita no SharePoint (a sobrescrita foi confirmada no DEV em 23/10/2026).

## Página pública (`apps/cadastro-passageiro`, Worker Cloudflare)
1. `node --test apps/cadastro-passageiro/test/api.test.mjs` → `fail 0` (13 em 23/10/2026).
2. `cd apps/cadastro-passageiro && npx wrangler deploy --dry-run` → bindings `RATE_LIMITER` e `ASSETS`, sem publicar.
3. `pnpm dev` (porta 52418, `MODO_LOCAL=1` ativa o mock) → abrir `http://127.0.0.1:52418/#t=` + 43 caracteres `A` em 375 px. Esperado: nome acima de uma foto de 168 px que é o próprio botão; e-mail `abc` bloqueia com "Confira o e-mail"; foto (injetar arquivo no `.foto-input` via DataTransfer) vira prévia; Salvar → "Dados salvos. Obrigado!"; console sem erros.
4. Deploy (só da `main`, checkout principal): `pnpm --filter @betinhos/cadastro-passageiro push` com o `wrangler` logado na conta Betinhos (OAuth) e o secret `FLOW_URL` = URL do gatilho do flow "Cadastro do passageiro | Link".

## Lista Geral do shell (`apps/shell/src/pages/geral`)
- `npx vitest run src/pages/geral/domain/linkCadastro.test.ts` (em `apps/shell`) → 18 testes com `link.test.ts` (23/10/2026).
- Mock (`pnpm --filter ./apps/shell dev`, porta 36472): selecione 1 serviço, abra o menu Ações e escolha "Link de cadastro". O painel (Drawer no desktop, Sheet no mobile) mostra o link, "vale até dd/mm HH:mm", o aviso de substituição e 2 passageiros (Ana com foto, Bruno "Sem telefone · Sem e-mail"). "Copiar link" mostra o toast "Link copiado"; o clique fora fecha.
