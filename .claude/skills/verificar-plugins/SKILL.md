---
name: verificar-plugins
description: "Verifica os plugins C# do Dataverse (Cr40f.Financeiro.Plugin, incluindo ValorOpPlugin, Cr40f.Documentos.Plugin, Cr40f.Frota.Plugin e Cr40f.Portal.Plugin, Cr40f.Protecao.Plugin, Cr40f.Prontuario.Plugin, Cr40f.Cadastro.Plugin com a foto do passageiro) e seus registradores. Use após mudar packages/plugins/** ou quando pedirem para testar plugin, valor da OP ou sincronização financeira."
---
# Verificar plugins do Dataverse

## Cobre
- Código: `packages/plugins/Cr40f.Financeiro.Plugin/**`, `packages/plugins/Cr40f.Documentos.Plugin/**`, `packages/plugins/Cr40f.Frota.Plugin/**`, `packages/plugins/Cr40f.Portal.Plugin/**`, `packages/plugins/Cr40f.Protecao.Plugin/**`, registradores em `packages/plugins/tools/**`, scripts `packages/plugins/scripts/*.ps1`.
- Comportamento: valor da OP (`cr40f_financeiro.cr40f_valor`) = soma de `new_valortotal` das composições das reservas (`reserva.new_composicaodepreco`), a mesma soma do `SyncEngine`; sincronização financeira (pagantes → OP → reservas).

## Preparar ambiente
- .NET SDK 8+ (`dotnet --list-sdks`); chave de assinatura em `%USERPROFILE%\.codex\keys\Cr40f.Financeiro.Plugin.snk`.
- DEV: `https://org23b93544.crm2.dynamics.com/`. Token em cache do registrador (`%TEMP%\Betinhos\Dataverse\financeiro.msalcache.bin`); na primeira vez abre login no navegador — quem entra é o Renan.

## Roteiro
1. `dotnet test packages/plugins/Cr40f.Financeiro.Plugin.Tests/Cr40f.Financeiro.Plugin.Tests.csproj` → "Com falha: 0" (34 testes em 19/10/2026, 7 de `ValorOpTests`).
2. `dotnet build packages/plugins/tools/Cr40f.Financeiro.Registrar/Cr40f.Financeiro.Registrar.csproj` → "0 Erro(s)".
3. Simulação no DEV (só leitura): `dotnet run --project packages/plugins/tools/Cr40f.Financeiro.Registrar/Cr40f.Financeiro.Registrar.csproj -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --simularValorOp` → linha `valor da OP: N OPs, M com reservas, K mudariam, 0 gravadas (simulação)`.
4. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:financeiro:dev` → steps `Cr40f.ValorOp: …` criados/reconciliados e "plugin publicado com sucesso".
5. Carga inicial no DEV: mesmo comando do passo 3 com `--recalcularValorOp` → `K gravadas`; repetir `--simularValorOp` → `0 mudariam`.
6. Comportamento: no Sistema Betinhos (DEV) › Ordens de Pagamento, o valor de cada OP aparece sem o título "Soma dos serviços" (agora vem de `cr40f_valor`); alterar um campo de origem (ex.: `new_valorpedagios`) de uma composição de teste — `new_valortotal` é calculada e não aceita escrita — ligada a uma reserva com OP e conferir a OP atualizada na hora.

## Frota (Custom API `cr40f_FrotaPendencias`)
1. `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests` → "Com falha: 0" (5 em 20/10/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Frota.Plugin.snk` (o script de push cria se faltar).
2. Paridade com o shell: `Fixtures/paridade.json` é lido também por `apps/shell/src/pages/frota/domain/paridade.test.ts` (`npx vitest run src/pages/frota/domain/paridade` em `apps/shell`). Mudou regra ou limiar (`alertas.ts` `LIMIARES` ↔ `Modelo.cs` `Limiares`)? Atualize os dois lados e o `esperado` do fixture. `Catalogo.cs` é gerado de `manutencaoCatalogo.json` (teste `Catalogo_igual_ao_json_do_shell`).
3. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:frota:dev`.
4. Testar no DEV (só leitura): `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --testar` → JSON `{hoje,total,pendencias}`; os totais por tipo batem com a aba Pendências do shell no DEV (prioridade, reincidência, preventiva, custo, hodômetro; "agendada" só as vencidas).

## Portal (reabrir validação quando o preço muda, `ReabrirValidacaoPlugin`)
1. `dotnet test packages/plugins/Cr40f.Portal.Plugin.Tests` → "Com falha: 0" (11 em 28/10/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Portal.Plugin.snk` (o script de push cria se faltar).
2. Cenários cobertos: aprovado + preço novo → Liberado com valor anterior, prazo novo e aprovado em/por limpos; mesmo valor (com e sem imagem) e segunda execução → nada; Retirado, validação inativa ou reserva sem validação → nada; duas reservas na mesma composição → as duas; `Depth` > 1 → sai sem ler nem gravar.
3. Dias úteis (`DiasUteis.cs`): mesma regra de `prazoTacita` em `apps/shell/src/pages/geral/domain/portal.ts` (fixos + Sexta-feira Santa, UTC-3). Mudou um lado? Mude o outro e o teste `Feriados_nacionais`.
4. `dotnet build packages/plugins/Cr40f.Portal.Plugin -c Release` e conferir o public key token da DLL (não vazio).
5. Publicar no DEV (só da `main`, checkout principal, **depois** de `packages/deploy/provision-portal-cliente.ps1 -Apply`): `pnpm push:plugin:portal:dev`. O registrador falha se `cr40f_validacaoservico` não existir. Step: `Cr40f.Portal: preço alterado reabre validação` (Update de `cr40f_composicaodeprecos`, pós, síncrono, **sem filtro** porque `new_valortotal` é calculada, imagem `pre` com `new_valortotal`).
6. Comportamento no DEV: numa reserva de teste com validação Aprovada, alterar um campo de origem da composição (ex.: `new_valorpedagios`) → a validação volta para Liberado, `cr40f_valoranterior` = valor antigo, `cr40f_prazotacita` = hoje + 5 úteis; repetir o mesmo valor → nada muda. Desfazer o valor depois.

## Proteção de campos da Tenaris (`ProtegerCamposPlugin`)
1. `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests` → "Com falha: 0" (15 em 03/11/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Protecao.Plugin.snk`.
2. Regra: Update de `cr40f_reservadeveculos` sem `new_snapshotsharepoint` no Target, em reserva com snapshot → campo monitorado diferente da planilha entra em `new_camposprotegidos` (tipo de veículo, fora do snapshot, compara com o valor anterior). Update com snapshot (sincronização da Tenaris) → campos protegidos saem do Target. Proteção nunca é removida pelo plugin.
3. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:protecao:dev`. Step `Cr40f.Protecao: protege campos editados da Tenaris` (pré-operação 20, rank 1, filtro nos 10 campos + snapshot, imagem `pre`).
4. Prova no DEV: `dotnet run --project packages/plugins/tools/Cr40f.Protecao.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --testar <id>` (só prova o plugin já publicado, não envia DLL; reserva antiga da Tenaris em Solicitado ou Confirmado, com status igual ao da planilha e sem passageiros com contatos reais) → `edicao: ... lista=...cr40f_status`, `sincronizacao simulada: ... BARRADA (ok)`, `reserva restaurada`. Cerca de 1 minuto depois, confira `new_camposprotegidos` da reserva: o Flow Campos Protegidos antigo (assíncrono) pode ter acrescentado `cr40f_status`; se tiver, volte o campo ao valor de antes.
5. Não rode o flow da Tenaris no DEV de ponta a ponta (grava na planilha real).
6. PROD: só pelo workflow "Publicar soluções". Depois, prova pela auditoria: nenhuma troca de `cr40f_status` pelo noreply em reserva com `cr40f_status` em `new_camposprotegidos`.

## Casos de borda
- Reserva sem composição conta 0 (como o `SyncEngine`); OP sem reserva fica sem valor (null).
- Excluir composição: o step pré-Delete guarda as OPs (o vínculo some antes do pós-Delete).
- Mover reserva de OP: a imagem `pre` recalcula a OP antiga e a nova.

## Evidência obrigatória
- Saída do `dotnet test`, linha da simulação antes/depois da carga e print da lista de OPs no DEV.

## Limites
- PROD só com aprovação explícita (carga inicial grava em todas as OPs).
- Fluxos do Power Automate que escutam alteração de OP podem disparar quando `cr40f_valor` muda: conferir no DEV antes do PROD.

## Prontuário (anexo pelo Claude: `cr40f_PrepararAnexoProntuario` e `cr40f_ConsumirAnexoProntuario`)
1. `dotnet test packages/plugins/Cr40f.Prontuario.Plugin.Tests` → "Com falha: 0" (38 em 05/11/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Prontuario.Plugin.snk`.
2. Flow e script: `node --test flows/prontuario-anexar-claude.test.mjs` em `packages/deploy` (9) e `python -m unittest test_anexar_prontuario` em `packages/prontuario-anexo` (13).
3. Regras: preparo só para quem tem `prvCreateNote` + `prvAppendNote` + AppendTo no funcionário; liberação de uso único (10 min, só o hash do token gravado, RowVersion contra corrida); só JPG/PNG/HEIC/PDF, ≤ 10 MB cada, ≤ 10 arquivos, ≤ 50 MB no total.
4. Publicar no DEV (só da `main`, checkout principal), nesta ordem: `packages/deploy/provision-anexo-prontuario.ps1 -Apply` → `pnpm push:plugin:prontuario:dev` → `packages/deploy/provision-flow-prontuario-anexo.ps1 -SiteUrl https://betinhos.sharepoint.com/sites/BetinhosGestoInterna -Apply` → `packages/deploy/solucoes/distribuir-apos-push.ps1`.
5. Comportamento no DEV: com um usuário comum (papel por equipe também), chamar o preparo num funcionário de teste e rodar o script com uma foto e um PDF → uma anotação com os 2 links e "Anexado por <nome> via Claude"; repetir com o mesmo token → 403; usuário sem permissão de anotação → erro de permissão.

## Segredos (tabela `cr40f_segredo`, `SecretReader` e `PluginSettings`)
- Testes: `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false` (`SecretReaderTests` e os de chave em `QrChargePluginTests`, 689 no total em 11/11/2026) e `dotnet test packages/plugins/Cr40f.GerarPagantes.Plugin.Tests -p:SignAssembly=false` (5 de `PluginSettingsTests`) → "Com falha: 0". Cobrem: tabela vence (inclusive a configuração segura do step), linha vazia/ausente cai na configuração segura e, sem ela, na variável de ambiente, tabela ilegível (schema ainda ausente) não derruba e o trace nunca contém o valor. Para `infleet.token`, `link-acompanhamento.worker` e `stripe.cobranca-qr` (sem variável legada): tabela → configuração segura → "não configurado" de sempre (gateway Infleet recusa token vazio, link responde "Link de acompanhamento não configurado.", QR recusa no criar sem gravar); o trace mostra `Segredo <nome>: fonte tabela|config segura|ausente`.
- Schema no DEV (só leitura): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-tabela-segredos.ps1 -SomenteValidar` → "VALIDAR OK"; depois de criado, rodar sem a opção confere IsSecured, auditoria desligada em `cr40f_valor`, chave Active, perfil e tabela na AppBetinhos e nenhum papel além do Administrador com privilégio.
- Comportamento no DEV: com o segredo gravado (`gravar-segredo.ps1`, "gravado e conferido por hash") e a variável legada vazia, `cr40f_InsightsCombustivel` e o organizador de observação respondem com IA e o Gerar Pagantes gera link Cielo/envia e-mail; o Log de rastreamento do plugin mostra só nomes de segredo, nunca valor.
- Limite: nunca imprimir, colar em chat ou commitar valor de segredo; PROD só leitura sem pedido explícito.

## Foto do passageiro (Custom API `new_ObterFotoPassageiro`, `Cr40f.Cadastro.Plugin`)
1. `dotnet test packages/plugins/Cr40f.Cadastro.Plugin.Tests` → "Com falha: 0" (44 em 10/11/2026; 9 de `UrlFlowConsultaTests`).
2. URL do flow "Flow - Consultar Arquivos Sharepoint": variável `new_URLFlowConsultarArquivosSharePoint` (valor atual, senão padrão) primeiro; configuração segura do step só como fallback (ela não viaja na solução, por isso TEST/PROD ficavam sem foto). Sem as duas → `{"ok":false,"motivo":"indisponivel"}` e o trace diz "URL do flow ausente".
3. Trace nunca leva a URL nem `sig=`: só a origem ("variável de ambiente"/"configuração segura") e o motivo da negação (HTTP N, tempo esgotado, falha de rede).
4. Comportamento (DEV depois do Deploy; PROD depois do caminho plugin): no App Motoristas, abrir um serviço Programado do próprio motorista com passageiro que tem foto → aparece a foto, não a inicial. Log de rastreamento só aparece com exceção no PROD.

## Compartilhamento concorrente (`ServiceDriverSharePlugin`, `PluginErrorMessage.ToPluginException`)
1. Testes de `PluginErrorMessageTests` (`Betinhos.DriverRecordSharing.Tests`) → "Com falha: 0". Cobrem 0x80048105 no topo, dentro de `InnerException`/`InnerFault` e o `[SHARE_CONCURRENT]` de uma execução aninhada: todos viram 503 (`PluginHttpStatusCode.ServiceUnavailable`, lido pela propriedade não pública `HttpStatus`). Qualquer outro erro mantém o status padrão e a mensagem de `ForUser`. No Linux o projeto de testes não compila por causa de `ExchangePossessionFinalizerTests` (net462), então quem roda os testes é o CI (job `plugins`).
2. Por que 503: dois Updates em paralelo do `Loop_Servicos` do "Flow Novo Sistema Tenaris -> Dataverse" (concorrência 7) compartilham o mesmo cadastro do solicitante. A transação já está abortada, então o plugin não pode repetir; quem repete o 503 sozinho é o conector do Power Automate.
3. Prova (PROD depois do caminho plugin): sync com várias trocas de solicitante. `plugintracelog` com `messageblock LIKE '%concurrent%' OR exceptiondetails LIKE '%oncurrent%'` deve mostrar `[SHARE_CONCURRENT]` em vez de `[EXCHANGE_INTERNAL_ERROR]`, e a execução do flow fica verde, com a ação `Upsert_Geral` repetida. Sem colisão no período, a prova continua pendente; não force a colisão no PROD.
