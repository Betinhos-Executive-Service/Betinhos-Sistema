# Multas, fase 1: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhuma multa nova fica sem dono nem passa do prazo sem resposta: passo a passo com regras no servidor, prazo vencido obrigatório, tarefa no Planner por multa, e-mail diário "Multas de hoje", dossiê para o WhatsApp e rotina do SNE ajustada.

**Architecture:** As regras ficam numa classe pura `MultaEtapas` no `Cr40f.Frota.Plugin` (C#) com espelho em TypeScript no shell e um fixture JSON de paridade lido pelos dois lados. O servidor grava os passos pela Custom API `cr40f_PassoMulta`, protege os campos de passo com uma trava pre-operation (modo `observar`/`travar`), mantém a tarefa do Planner num step assíncrono e monta o e-mail pela Custom API `cr40f_MultasDoDia`. O dossiê (`new_DossieMulta`) fica no `Betinhos.DriverRecordSharing` porque reaproveita a coleta do InFleet do termo. O shell troca os botões de Flow por um drawer passo a passo.

**Tech Stack:** C# net462 (plugins Dataverse, xUnit em net48), .NET 8 (registrador), React + TypeScript + Vitest (`apps/shell`), Power Automate (JSON de definição + PowerShell 5.1), migrations PowerShell (`packages/deploy/migrations`), Node `node:test` (`packages/deploy`).

**Spec:** `docs/superpowers/specs/2026-11-17-multas-fase1-design.md` (aprovada; o plano não muda decisões). Documento do processo: https://claude.ai/artifact/PGwNyU3MAXTZ6oFgnsi7j8

## Global Constraints

- Valores de `cr40f_multas.cr40f_status` não mudam, só os rótulos: 202410000 "1. Identificar o responsável", 202410004 "2. Indicar no órgão", 202410001 "3. Pagar", 202410006 "4. Acertar", 202410005 "Encerrada", 202410002 "Em recurso", 202410003 "Descontado (antigo)". Opção nova "Cancelada" = **202410007** (decisão do plano: próximo valor livre do publisher `cr40f`). Registros existentes não são migrados.
- Choices novos: `cr40f_responsavel` Motorista 100000000 / Empresa 100000001; `cr40f_motivoempresa` Prazo perdido 100000000 / Culpa da empresa 100000001; `cr40f_canalindicacao` Senatran 100000000 / DSV Digital 100000001 / Prefeitura 100000002; `cr40f_plannertarefa.cr40f_origem` "Multa" = 100000003 (manual 100000000, cotação 100000001 e qualidade 100000002 já existem).
- Variável de ambiente `cr40f_MultasTravaModo`: `observar` (padrão) e `travar`. Só o texto `travar` (sem diferenciar maiúsculas) liga a recusa.
- "Hoje" é o dia de Brasília (`E. South America Standard Time`), calculado por `FrotaPendenciasPlugin.ResolverHoje` no servidor e `todaySP()` no shell. Datas em `yyyy-MM-dd`.
- Prazo vencido = etapa 1 ou 2 e `cr40f_dataparaindicar` anterior a hoje. Enquanto não for respondido, é o único passo aceito.
- Próximo prazo: etapas 1 e 2 → `cr40f_dataparaindicar`; Pagar → `cr40f_vencimento`; Acertar → nenhum.
- Tarefa: `cr40f_codigoorigem = 'MULTA:<id>'`; título `Multa <auto> · <placa> · <próximo passo>`; prazo às 12:00Z; prioridade urgente com 3 dias ou menos (ou vencido), alta com 7 dias ou menos, média nos demais; descrição com o link `#/frota-multas?registro=multa:<id>`; equipe Planner "Frota" com o principal primeiro; eventos 100000000 "Tarefa criada." e 100000003 `notification:assignment`; fecha (100000003) com a multa Encerrada ou Cancelada e reabre se concluída com a multa aberta.
- E-mail: dias úteis às 07:00 de Brasília; um e-mail para cada funcionário ativo com `cr40f_recebeemailmultas = true`; seções nesta ordem: prazo vencido, indicar em até 7 dias, aceite pendente (Senatran há 2 dias ou mais), pagar com 40% em até 5 dias, aguardando acerto (contagem); sem itens não envia; Try/Catch avisa `new_EmailAdminAvisos`.
- Textos de tela, mensagens de recusa e e-mails em pt-BR; a recusa diz o que fazer (ex.: "Avise o motorista antes de registrar a indicação.").
- O termo (`TermoMultaPanel`) fica escondido nesta fase; os botões "Notificar condutor" e "Gerar contrato de indicação" e as leituras de `new_FlowUrlNotificarMotoristaMultas` e `new_FlowUrlGerarContratoMultas` saem do shell.
- **Máquina:** este PC tem 8 GB. Testes (`dotnet test`, `vitest`), builds, `vite dev` e Playwright rodam **só** na máquina linkada Betinhos-Renan (T3 `delegate_task` com `target.environmentId = 0af2203c-6aba-4a53-8896-1d00fe75c6fa`). Os passos "Run" abaixo dizem o comando exato para mandar para lá.
- **Publicação:** só pelo GitHub (PR para a `develop`). Sessão de implementação nunca roda `pnpm push`, `pnpm wr`, `push:plugin:*`, `sitemap:*` nem `packages/deploy/provision-*`. Schema só por migration; migration publicada é imutável; flow novo nasce à mão uma vez no DEV, do checkout principal na `develop` atualizada.
- Migrations e `provision-flow-*.ps1` têm BOM UTF-8 e comentários em ASCII (o Deploy usa Windows PowerShell 5.1).
- Repositório público: fixtures e mocks só com dados fictícios (nomes com "(fictício)", placas `TST`/`ABC`, sem CPF nem e-mail de pessoa).
- Mudança de UI: print antes/depois do drawer, da lista e da tarefa no Planner, tirado na Betinhos-Renan e trazido para o chat.

## Pontos do §11 da spec, resolvidos

1. **Tabela que liga veículo e horário de serviço:** `cr40f_reservadeveculos` (entity set `cr40f_reservadeveculoses`), com `cr40f_veiculo` (lookup para `cr40f_veiculos`), `cr40f_dataehorriodesada` (saída), `cr40f_horrioprevistoderetorno` (retorno previsto), `cr40f_cliente`, `cr40f_motorista`, `cr40f_status`, `cr40f_idnovo`/`cr40f_id`. Evidência: `apps/shell/src/pages/operacional/data/queries.ts:8-56` (agenda do dia lê exatamente essas colunas) e `packages/deploy/provision-flow-resumo-diario.ps1:135-146` (escalados de hoje por `_cr40f_veiculo_value` e janela de `cr40f_dataehorriodesada`); o dump `apps/motoristas/dataverse-metadata-prefix-2026-06-01T11-28-09-842Z.json` confirma os tipos. Mesmo assim, a Task 9 começa conferindo as colunas no DEV; se faltar alguma, o dossiê sai sem serviço (`servicos: []`) e o resto segue.
2. **Tarefa síncrona ou assíncrona:** **assíncrona**, post-operation (stage 40, mode 1, `asyncautodelete = true`). O registrador já sabe registrar steps (`packages/plugins/tools/Cr40f.Protecao.Registrar/Program.cs:113-147`) e o repo já usa step assíncrono (`packages/planner/scripts/register-planner-notification-plugin.ps1:160`, `mode = 1`); assim uma falha do Planner nunca desfaz nem bloqueia a gravação da multa, o job com falha fica em "Trabalhos do sistema" com o trace, e o próximo Update tenta de novo.
3. **"Flow Notificação Email Multa não Indicada" nas soluções:** a conferência é só leitura com `packages/deploy/solucoes/foto-ambiente.ps1` (DEV, as 4 soluções) e com a foto `fotos-prod` do último "Publicar soluções" (PROD, sem tocar no ambiente). A remoção pelas soluções usa o mecanismo de `fluxos-aposentados.json` (desliga sem contar como perda, `solucoes.ps1:422-431`) estendido com `"removido": true` para o comparador (`comparar-fotos.mjs`) tratar o sumiço como informativo. Task 19.

## File Structure

**Servidor (`packages/plugins/Cr40f.Frota.Plugin`)**
- Create `MultaEtapas.cs`: códigos, `MultaEstado`, `DadosPasso`, `MultaSituacao`, `Passos` e as regras puras (etapa, pendentes, prazo, validação, aplicação, diferenças).
- Create `MultaRepository.cs`: `MultaMapper` (Entity ↔ `MultaEstado`, gravação), `MultaRepository.Abertas`, paginação.
- Create `Variaveis.cs`: leitura de variável de ambiente.
- Create `PassoMultaPlugin.cs`: Custom API `cr40f_PassoMulta`.
- Create `MultaTravaPlugin.cs`: trava pre-operation.
- Create `MultaTarefa.cs`: criação e sincronia da tarefa do Planner; `MultaTarefaPlugin.cs`: step assíncrono.
- Create `MultasDoDia.cs`: seções do e-mail; `MultasDoDiaPlugin.cs`: Custom API.
- Tests: `Cr40f.Frota.Plugin.Tests/{FakeMundo.cs, Contexto.cs, ParidadeMultaTests.cs, PassoMultaTests.cs, MultaTravaTests.cs, MultaTarefaTests.cs, MultasDoDiaTests.cs}` e `Fixtures/multa-etapas.json`.
- Modify `tools/Cr40f.Frota.Registrar/Program.cs`: vários tipos, 3 Custom APIs, 4 steps.

**Dossiê (`packages/plugins/Betinhos.DriverRecordSharing`)**
- Create `DossieMultaPlugin.cs`; Test `Betinhos.DriverRecordSharing.Tests/DossieMultaPluginTests.cs`.
- Create `packages/plugins/scripts/register-dossiemulta-customapi.ps1`.

**Schema e flows (`packages/deploy`)**
- Create `migrations/20261117-1200-multas-fase1.ps1`.
- Create `flows/multas-do-dia.json`, `flows/multas-do-dia.test.mjs`, `provision-flow-multas-do-dia.ps1`; Modify `flows-dev.mjs`, `flows-dev.test.mjs`, `package.json`.
- Modify `provision-flow-resumo-diario.ps1` (sai a multa).
- Modify `solucoes/comparar-fotos.mjs`, `solucoes/comparar-fotos.test.mjs`, `solucoes/fluxos-aposentados.json`.

**Shell (`apps/shell/src/pages`)**
- Create `frota/domain/multaEtapas.ts` (espelho), `frota/domain/multaEtapas.test.ts` (paridade), `frota/domain/multaEstado.ts` (Multa ↔ estado), `frota/domain/multaMensagem.ts` (+ test), `frota/components/MultaPassoAPasso.tsx` (+ test), `planner/domain/multaTaskFlow.ts` (+ test).
- Modify `frota/data/{schema.ts, types.ts, mappers.ts, source.ts, dataverse.ts, mock.ts}`, `frota/domain/{transitions.ts, linhas.ts, listas.ts}`, `frota/components/RegistroDrawer.tsx`, `frota/views/Registros.tsx`, `frota/frota.css`, `planner/components/TaskDrawer.tsx`, `planner/data/{dataverse.ts, mock.ts}`, `planner/domain/types.ts`, `funcionarios/{data/schema.ts, data/types.ts, data/dataverse.ts, data/mock.ts, components/RelatedTabs.tsx}`, `dashboard/{domain/codes.ts, domain/abas/multas.ts, domain/detalhes.ts, components/abas/MultasTab.tsx}` e os testes que citam os rótulos antigos ou os Flows de multa.

**Documentos e skills**
- Create `docs/multas/rotina-sne.md`, `.claude/skills/verificar-multas/SKILL.md`; Modify `.claude/skills/verificar-termo-multa/SKILL.md`, `apps/motoristas/.claude/skills/verificar-app-termo-multa/SKILL.md`, `.claude/skills/verificar-index.md`.

---

### Task 1: Migration do schema da fase 1

**Files:**
- Create: `packages/deploy/migrations/20261117-1200-multas-fase1.ps1`

**Interfaces:**
- Produces (DEV, depois do Deploy): colunas de `cr40f_multas` `cr40f_responsavel`, `cr40f_motivoempresa`, `cr40f_canalindicacao` (choices), `cr40f_aceiteem`, `cr40f_vencimento`, `cr40f_pagaem`, `cr40f_competenciadesconto`, `cr40f_acertoem`, `cr40f_encerradaem`, `cr40f_canceladaem` (data, DateOnly), `cr40f_valorcomdesconto`, `cr40f_valorpago` (moeda), `cr40f_comprovantepagamento`, `cr40f_pdfpenalidade` (arquivo), `cr40f_motivocancelamento` (texto 2000); opção `cr40f_status` = 202410007 e rótulos novos; `cr40f_funcionarios.cr40f_recebeemailmultas` (sim/não); `cr40f_plannertarefa.cr40f_multa` (lookup) e `cr40f_origem` = 100000003; variável `cr40f_MultasTravaModo` = `observar`.

- [ ] **Step 1: Escrever a migration (salvar com BOM UTF-8)**

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Multas, fase 1 (docs/superpowers/specs/2026-11-17-multas-fase1-design.md, secao 4).
# - cr40f_multas.cr40f_status: rotulos novos das etapas (os valores nao mudam) e a opcao nova Cancelada (202410007).
# - cr40f_multas: responsavel, motivo da empresa, canal da indicacao, datas dos passos, valores, competencia, PDFs e motivo
#   do cancelamento. cr40f_autodainfracao continua sendo o PDF da notificacao de autuacao.
# - cr40f_funcionarios.cr40f_recebeemailmultas: quem recebe o e-mail "Multas de hoje".
# - cr40f_plannertarefa: lookup cr40f_multa (cr40f_multas) e a opcao Multa (100000003) em cr40f_origem.
# - Variavel de ambiente cr40f_MultasTravaModo (texto, nao secreta), padrao "observar"; "travar" recusa gravacao fora do passo.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }
function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = "None" } }
}
function Escolha([string] $Schema, [string] $Nome, [string] $Desc, $Opcoes) {
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = @($Opcoes | ForEach-Object { @{ Value = $_[0]; Label = (Label (U $_[1])) } }) }
  return $c
}
function Dia([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
}
function Moeda([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "MoneyAttributeMetadata" $Schema $Nome $Desc; $c.Precision = 2; $c.PrecisionSource = 2; $c.MinValue = 0; $c.MaxValue = 1000000; return $c
}
function Arquivo([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "FileAttributeMetadata" $Schema $Nome $Desc; $c.MaxSizeInKB = 10240; return $c
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}

$multas = "cr40f_multas"
$colunas = @(
  @{ Tabela = $multas; Meta = (Escolha "cr40f_responsavel" "Responsável" "Quem responde pela multa. Vazio nas antigas: vale o motorista." @(@(100000000, "Motorista"), @(100000001, "Empresa"))) },
  @{ Tabela = $multas; Meta = (Escolha "cr40f_motivoempresa" "Motivo da empresa" "Por que a empresa assume a multa." @(@(100000000, "Prazo perdido"), @(100000001, "Culpa da empresa"))) },
  @{ Tabela = $multas; Meta = (Escolha "cr40f_canalindicacao" "Canal da indicação" "Onde a indicação do condutor foi feita." @(@(100000000, "Senatran"), @(100000001, "DSV Digital"), @(100000002, "Prefeitura"))) },
  @{ Tabela = $multas; Meta = (Dia "cr40f_aceiteem" "Aceite em" "Aceite do condutor na CNH Digital (só Senatran).") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_vencimento" "Vencimento da guia" "Vencimento da penalidade (gravado pela rotina do SNE).") },
  @{ Tabela = $multas; Meta = (Moeda "cr40f_valorcomdesconto" "Valor com desconto" "Valor da guia com os 40% do SNE.") },
  @{ Tabela = $multas; Meta = (Moeda "cr40f_valorpago" "Valor pago" "Valor efetivamente pago.") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_pagaem" "Paga em" "Data do pagamento da guia.") },
  @{ Tabela = $multas; Meta = (Arquivo "cr40f_comprovantepagamento" "Comprovante de pagamento" "PDF ou imagem do comprovante.") },
  @{ Tabela = $multas; Meta = (Arquivo "cr40f_pdfpenalidade" "PDF da penalidade" "Notificação de penalidade baixada do portal.") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_competenciadesconto" "Competência do desconto" "Mês da folha (1º dia do mês).") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_acertoem" "Acerto em" "Data do acerto (folha ou empresa assume).") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_encerradaem" "Encerrada em" "Data em que a multa encerrou.") },
  @{ Tabela = $multas; Meta = (Dia "cr40f_canceladaem" "Cancelada em" "Data do cancelamento.") },
  @{ Tabela = $multas; Meta = (Texto "cr40f_motivocancelamento" "Motivo do cancelamento" "Por que a multa foi cancelada." 2000) },
  @{ Tabela = "cr40f_funcionarios"; Meta = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = "cr40f_recebeemailmultas"; RequiredLevel = @{ Value = "None" }; DefaultValue = $false
      DisplayName = (Label (U "E-mail diário de multas")); Description = (Label (U "Recebe o e-mail Multas de hoje (dias úteis, 07:00)."))
      OptionSet = @{ TrueOption = @{ Value = 1; Label = (Label "Sim") }; FalseOption = @{ Value = 0; Label = (Label (U "Não")) } } } }
)

# ---------- colunas ----------
$novas = @()
foreach ($c in $colunas) {
  $logical = $c.Meta.SchemaName.ToLowerInvariant()
  $found = Get-Coluna $c.Tabela $logical
  if (-not $found) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $($c.Tabela).$logical."; continue }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$($c.Tabela)')/Attributes" $c.Meta | Out-Null
    $found = Get-Coluna $c.Tabela $logical
    if (-not $found) { throw "Coluna $($c.Tabela).$logical nao foi criada." }
    Write-Step "criada $($c.Tabela).$logical"
  }
  $novas += $found.MetadataId
}

# ---------- opcoes (rotulo novo ou opcao nova) ----------
# Opcoes de choice local ou global: o caminho do InsertOptionValue/UpdateOptionValue muda.
function Get-Opcoes([string] $Tabela, [string] $Coluna) {
  $m = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$Tabela')/Attributes(LogicalName='$Coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Name,IsGlobal,Options),GlobalOptionSet(`$select=Name,Options)"
  $global = $null -ne $m.GlobalOptionSet
  $set = if ($global) { $m.GlobalOptionSet } else { $m.OptionSet }
  return @{ Global = $global; Nome = [string] $set.Name; Opcoes = @($set.Options) }
}
function Rotulo($Opcao) {
  $todos = @($Opcao.Label.LocalizedLabels)
  $pt = @($todos | Where-Object { $_.LanguageCode -eq 1046 })
  if ($pt.Count) { return [string] $pt[0].Label }
  if ($todos.Count) { return [string] $todos[0].Label }
  return ""
}
function Set-Opcao([string] $Tabela, [string] $Coluna, [int] $Valor, [string] $Texto) {
  $o = Get-Opcoes $Tabela $Coluna
  $atual = @($o.Opcoes | Where-Object { [int] $_.Value -eq $Valor })
  $alvo = if ($o.Global) { @{ OptionSetName = $o.Nome } } else { @{ EntityLogicalName = $Tabela; AttributeLogicalName = $Coluna } }
  if ($atual.Count -and (Rotulo $atual[0]) -ceq $Texto) { return $false }
  if (-not $Apply) { Write-Step "DRY RUN $(if ($atual.Count) { 'trocaria o rotulo de' } else { 'criaria' }) $Tabela.$Coluna = $Valor."; return $false }
  $corpo = $alvo + @{ Value = $Valor; Label = (Label $Texto); SolutionUniqueName = $script:SolucaoDev }
  if ($atual.Count) { $corpo.MergeLabels = $true; Invoke-Dv "POST" "UpdateOptionValue" $corpo | Out-Null }
  else { Invoke-Dv "POST" "InsertOptionValue" $corpo | Out-Null }
  Write-Step "opcao $Tabela.$Coluna = $Valor"
  if ($o.Global) { Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><optionsets><optionset>$($o.Nome)</optionset></optionsets></importexportxml>" } | Out-Null }
  return $true
}

$status = @(
  @(202410000, "1. Identificar o responsável"), @(202410004, "2. Indicar no órgão"), @(202410001, "3. Pagar"),
  @(202410006, "4. Acertar"), @(202410005, "Encerrada"), @(202410002, "Em recurso"), @(202410003, "Descontado (antigo)"), @(202410007, "Cancelada")
)
foreach ($s in $status) { Set-Opcao $multas "cr40f_status" $s[0] (U $s[1]) | Out-Null }

$origem = Get-Opcoes "cr40f_plannertarefa" "cr40f_origem"
$ocupada = @($origem.Opcoes | Where-Object { [int] $_.Value -eq 100000003 -and (Rotulo $_) -cne "Multa" })
if ($ocupada.Count) { throw "cr40f_plannertarefa.cr40f_origem 100000003 ja existe com outro rotulo: $(Rotulo $ocupada[0])." }
Set-Opcao "cr40f_plannertarefa" "cr40f_origem" 100000003 "Multa" | Out-Null

# ---------- lookup da tarefa para a multa ----------
$rel = "cr40f_multas_cr40f_plannertarefa_multa"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup cr40f_plannertarefa.cr40f_multa." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = $multas; ReferencedAttribute = "cr40f_multasid"; ReferencingEntity = "cr40f_plannertarefa"
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_Multa"; DisplayName = (Label "Multa"); Description = (Label (U "Multa que gerou a tarefa (plugin da frota).")); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup cr40f_plannertarefa.cr40f_multa"
  }
}

# ---------- variavel de ambiente ----------
$variavel = "cr40f_MultasTravaModo"
$def = @(Get-Rows "environmentvariabledefinitions" "environmentvariabledefinitionid" "schemaname eq '$variavel'")
if ($def.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a variavel $variavel = observar." }
  else {
    Invoke-Dv "POST" "environmentvariabledefinitions" @{
      schemaname = $variavel; displayname = "Multas: modo da trava"
      description = (U "observar: só registra no trace o que recusaria. travar: recusa gravação de campo de passo fora do passo a passo.")
      type = 100000000; defaultvalue = "observar"; isrequired = $false
    } | Out-Null
    $def = @(Get-Rows "environmentvariabledefinitions" "environmentvariabledefinitionid" "schemaname eq '$variavel'")
    if ($def.Count -ne 1) { throw "Variavel $variavel nao foi criada." }
    Write-Step "criada a variavel $variavel = observar"
  }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

$lookup = Get-Coluna "cr40f_plannertarefa" "cr40f_multa"
if (-not $lookup) { throw "Lookup cr40f_plannertarefa.cr40f_multa nao encontrado." }
foreach ($id in @($novas + $lookup.MetadataId)) { Add-ComponenteNaSolucao $id 2 }
Add-ComponenteNaSolucao $def[0].environmentvariabledefinitionid 380
foreach ($t in $multas, "cr40f_funcionarios", "cr40f_plannertarefa") { Publish-Tabela $t }
Write-Step "OK: fase 1 das multas ($($novas.Count + 1) colunas, rotulos de cr40f_status, origem Multa e $variavel) na solucao $script:SolucaoDev."
```

- [ ] **Step 2: Conferir BOM, sintaxe e as regras do CI das migrations**

Run (na Betinhos-Renan):
```
head -c 3 packages/deploy/migrations/20261117-1200-multas-fase1.ps1 | xxd -p
pwsh -NoProfile -Command '$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path packages/deploy/migrations/20261117-1200-multas-fase1.ps1).Path,[ref]$null,[ref]$e); $e.Count'
pnpm --filter @betinhos/deploy test
```
Expected: `efbbbf`; `0`; `fail 0` (inclui `migrations-ci.test.mjs` e `migrations-dev.test.mjs`).

- [ ] **Step 3: Dry-run no DEV (só leitura)**

Run (na Betinhos-Renan, com `az login` no DEV): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/migrations/20261117-1200-multas-fase1.ps1`
Expected: linhas `DRY RUN criaria cr40f_multas.cr40f_responsavel.` … `DRY RUN trocaria o rotulo de cr40f_multas.cr40f_status = 202410000.` … `DRY RUN criaria cr40f_multas.cr40f_status = 202410007.`, `DRY RUN criaria cr40f_plannertarefa.cr40f_origem = 100000003.` e `dry-run: nada gravado.`; nenhuma exceção. O `-Apply` fica para o Deploy.

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/migrations/20261117-1200-multas-fase1.ps1
git commit -m "feat(multas): migration da fase 1 (etapas, colunas, trava e lookup da tarefa)"
```

---

### Task 2: Regras da multa no servidor (`MultaEtapas`) e fixture de paridade

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeMultaTests.cs`

**Interfaces:**
- Produces: `MultaCodigos` (constantes da Global Constraints), `Passos` (nomes e `Todos`), `MultaEstado` (DataContract, `Copia()`), `DadosPasso` (DataContract), `MultaSituacao { Etapa, Pendentes, ProximoPasso, ProximoPrazo, PrazoVencido, AguardandoPenalidade }`, e `MultaEtapas`:
  - `string Etapa(int? status)` → `identificar|indicar|pagar|acertar|encerrada|recurso|cancelada`
  - `bool Aberta(string etapa)`, `int? ResponsavelEfetivo(MultaEstado)`, `bool PrazoVencido(MultaEstado, string hoje)`
  - `MultaSituacao Avaliar(MultaEstado, string hoje)`
  - `string? Validar(MultaEstado, string passo, DadosPasso, string hoje)` (null = válido)
  - `MultaEstado Aplicar(MultaEstado, string passo, DadosPasso, string hoje)` (só depois de `Validar` = null)
  - `List<KeyValuePair<string, object?>> Mudancas(MultaEstado antes, MultaEstado depois)` (campo do estado → valor novo)
  - `string Formatar(object?)`, `RotuloPasso`, `RotuloEtapa`, `int? CanalDe(string?)`, `int? MotivoDe(string?)`
- O fixture `Fixtures/multa-etapas.json` é lido também pelo shell (Task 3).

- [ ] **Step 1: Escrever o fixture de paridade**

`packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json`:

```json
{
  "hoje": "2026-11-17",
  "avaliacoes": [
    { "nome": "nova sem responsável", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-30" }, "etapa": "identificar", "pendentes": ["DefinirResponsavel"], "proximoPasso": "Definir o responsável", "proximoPrazo": "2026-11-30", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "prazo vencido na etapa 1", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-16" }, "etapa": "identificar", "pendentes": ["PrazoVencido"], "proximoPasso": "Prazo vencido: responder", "proximoPrazo": "2026-11-16", "prazoVencido": true, "aguardandoPenalidade": false },
    { "nome": "prazo que vence hoje não está vencido", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-17" }, "etapa": "indicar", "pendentes": ["AvisarMotorista", "RegistrarIndicacao"], "proximoPasso": "Avisar o motorista", "proximoPrazo": "2026-11-17", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "avisado, falta indicar", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataParaIndicar": "2026-11-25" }, "etapa": "indicar", "pendentes": ["RegistrarIndicacao"], "proximoPasso": "Indicar no órgão", "proximoPrazo": "2026-11-25", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "Senatran sem aceite", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataIndicacao": "2026-11-12", "canal": 100000000, "dataParaIndicar": "2026-11-25" }, "etapa": "indicar", "pendentes": ["RegistrarAceite"], "proximoPasso": "Conferir o aceite na CNH Digital", "proximoPrazo": "2026-11-25", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "indicação antiga sem canal pede o canal", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataIndicacao": "2026-11-12", "dataParaIndicar": "2026-11-25" }, "etapa": "indicar", "pendentes": ["RegistrarIndicacao"], "proximoPasso": "Indicar no órgão", "proximoPrazo": "2026-11-25", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "pagar sem vencimento aguarda a penalidade", "multa": { "status": 202410001 }, "etapa": "pagar", "pendentes": [], "proximoPasso": "Aguardando penalidade", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": true },
    { "nome": "pagar com vencimento", "multa": { "status": 202410001, "vencimento": "2026-11-20" }, "etapa": "pagar", "pendentes": ["RegistrarPagamento"], "proximoPasso": "Pagar a guia", "proximoPrazo": "2026-11-20", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "prazo de indicação passado não conta em Pagar", "multa": { "status": 202410001, "dataParaIndicar": "2026-10-01", "vencimento": "2026-11-20" }, "etapa": "pagar", "pendentes": ["RegistrarPagamento"], "proximoPasso": "Pagar a guia", "proximoPrazo": "2026-11-20", "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "acertar não tem prazo", "multa": { "status": 202410006 }, "etapa": "acertar", "pendentes": ["RegistrarAcerto"], "proximoPasso": "Acertar", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "encerrada", "multa": { "status": 202410005 }, "etapa": "encerrada", "pendentes": [], "proximoPasso": "Encerrada", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "Descontado antigo vale como encerrada", "multa": { "status": 202410003 }, "etapa": "encerrada", "pendentes": [], "proximoPasso": "Encerrada", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "em recurso", "multa": { "status": 202410002 }, "etapa": "recurso", "pendentes": ["ResultadoRecurso"], "proximoPasso": "Registrar o resultado do recurso", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false },
    { "nome": "cancelada", "multa": { "status": 202410007 }, "etapa": "cancelada", "pendentes": [], "proximoPasso": "Cancelada", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false }
  ],
  "validacoes": [
    { "nome": "indicar antes de avisar", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-30" }, "passo": "RegistrarIndicacao", "dados": { "canal": "dsv", "data": "2026-11-15" }, "erro": "Avise o motorista antes de registrar a indicação." },
    { "nome": "prazo vencido bloqueia outro passo", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-01" }, "passo": "DefinirResponsavel", "dados": { "responsavel": "empresa" }, "erro": "O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir." },
    { "nome": "prazo vencido bloqueia cancelar", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-01" }, "passo": "Cancelar", "dados": { "motivoTexto": "Duplicada no portal" }, "erro": "O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir." },
    { "nome": "responsável sem escolha", "multa": { "status": 202410000 }, "passo": "DefinirResponsavel", "dados": {}, "erro": "Escolha o responsável: motorista ou empresa." },
    { "nome": "motorista sem id", "multa": { "status": 202410000 }, "passo": "DefinirResponsavel", "dados": { "responsavel": "motorista" }, "erro": "Escolha o motorista." },
    { "nome": "motorista válido", "multa": { "status": 202410000 }, "passo": "DefinirResponsavel", "dados": { "responsavel": "motorista", "motoristaId": "f1" }, "erro": null },
    { "nome": "indicação sem canal", "multa": { "status": 202410004, "dataAviso": "2026-11-10" }, "passo": "RegistrarIndicacao", "dados": { "data": "2026-11-15" }, "erro": "Escolha o canal da indicação." },
    { "nome": "indicação com data no futuro", "multa": { "status": 202410004, "dataAviso": "2026-11-10" }, "passo": "RegistrarIndicacao", "dados": { "canal": "senatran", "data": "2026-11-18" }, "erro": "A data não pode ser no futuro." },
    { "nome": "pagamento sem vencimento", "multa": { "status": 202410001 }, "passo": "RegistrarPagamento", "dados": { "data": "2026-11-15", "valorPago": 100 }, "erro": "A penalidade ainda não chegou: grave o vencimento antes de registrar o pagamento." },
    { "nome": "pagamento sem valor", "multa": { "status": 202410001, "vencimento": "2026-11-20" }, "passo": "RegistrarPagamento", "dados": { "data": "2026-11-15" }, "erro": "Informe o valor pago." },
    { "nome": "acerto na folha sem mês", "multa": { "status": 202410006 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha" }, "erro": "Informe o mês do desconto." },
    { "nome": "prazo vencido sem resposta", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-01" }, "passo": "PrazoVencido", "dados": {}, "erro": "Responda se a multa foi indicada." },
    { "nome": "prazo vencido antes do prazo", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-30" }, "passo": "PrazoVencido", "dados": { "indicou": false }, "erro": "O prazo de indicação ainda não venceu." },
    { "nome": "recurso depois de pagar", "multa": { "status": 202410006 }, "passo": "Recorrer", "dados": {}, "erro": "Só dá para entrar com recurso antes do pagamento." },
    { "nome": "cancelar encerrada", "multa": { "status": 202410005 }, "passo": "Cancelar", "dados": { "motivoTexto": "Duplicada no portal" }, "erro": "Esta multa já está encerrada." },
    { "nome": "passo de outra etapa", "multa": { "status": 202410001, "vencimento": "2026-11-20" }, "passo": "DefinirResponsavel", "dados": { "responsavel": "empresa" }, "erro": "Este passo não vale para a etapa atual da multa. Recarregue a tela." },
    { "nome": "passo desconhecido", "multa": { "status": 202410000 }, "passo": "Pular", "dados": {}, "erro": "Passo desconhecido: Pular." }
  ],
  "aplicacoes": [
    { "nome": "motorista segue para indicar", "multa": { "status": 202410000 }, "passo": "DefinirResponsavel", "dados": { "responsavel": "motorista", "motoristaId": "f1" }, "mudancas": ["motoristaId=f1", "responsavel=100000000", "status=202410004"] },
    { "nome": "empresa pula a etapa 2", "multa": { "status": 202410000 }, "passo": "DefinirResponsavel", "dados": { "responsavel": "empresa" }, "mudancas": ["motivoEmpresa=100000001", "responsavel=100000001", "status=202410001"] },
    { "nome": "aviso sem data usa hoje", "multa": { "status": 202410004 }, "passo": "AvisarMotorista", "dados": {}, "mudancas": ["dataAviso=2026-11-17"] },
    { "nome": "indicação DSV vai para Pagar", "multa": { "status": 202410004, "dataAviso": "2026-11-10" }, "passo": "RegistrarIndicacao", "dados": { "canal": "dsv", "data": "2026-11-15" }, "mudancas": ["canal=100000001", "dataIndicacao=2026-11-15", "indicado=true", "status=202410001"] },
    { "nome": "indicação Senatran espera o aceite", "multa": { "status": 202410004, "dataAviso": "2026-11-10" }, "passo": "RegistrarIndicacao", "dados": { "canal": "senatran", "data": "2026-11-15" }, "mudancas": ["canal=100000000", "dataIndicacao=2026-11-15", "indicado=true"] },
    { "nome": "aceite vai para Pagar", "multa": { "status": 202410004, "dataAviso": "2026-11-10", "dataIndicacao": "2026-11-12", "canal": 100000000, "indicado": true }, "passo": "RegistrarAceite", "dados": { "data": "2026-11-14" }, "mudancas": ["aceiteEm=2026-11-14", "status=202410001"] },
    { "nome": "pagamento do motorista vai para Acertar", "multa": { "status": 202410001, "responsavel": 100000000, "vencimento": "2026-11-20" }, "passo": "RegistrarPagamento", "dados": { "data": "2026-11-16", "valorPago": 175.88 }, "mudancas": ["pagaEm=2026-11-16", "status=202410006", "valorPago=175.88"] },
    { "nome": "pagamento da empresa encerra com o acerto automático", "multa": { "status": 202410001, "responsavel": 100000001, "motivoEmpresa": 100000000, "vencimento": "2026-11-20" }, "passo": "RegistrarPagamento", "dados": { "data": "2026-11-16", "valorPago": 175.88 }, "mudancas": ["acertoEm=2026-11-16", "encerradaEm=2026-11-16", "pagaEm=2026-11-16", "status=202410005", "valorPago=175.88"] },
    { "nome": "acerto na folha", "multa": { "status": 202410006 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12" }, "mudancas": ["acertoEm=2026-11-17", "competencia=2026-12-01", "encerradaEm=2026-11-17", "status=202410005"] },
    { "nome": "empresa assume no acerto grava o motivo", "multa": { "status": 202410006 }, "passo": "RegistrarAcerto", "dados": { "acerto": "empresa", "motivo": "culpa-empresa" }, "mudancas": ["acertoEm=2026-11-17", "encerradaEm=2026-11-17", "motivoEmpresa=100000001", "status=202410005"] },
    { "nome": "prazo vencido e indicada segue para Pagar", "multa": { "status": 202410004, "dataParaIndicar": "2026-11-01", "dataAviso": "2026-10-20" }, "passo": "PrazoVencido", "dados": { "indicou": true, "canal": "prefeitura", "data": "2026-10-30" }, "mudancas": ["canal=100000002", "dataIndicacao=2026-10-30", "indicado=true", "status=202410001"] },
    { "nome": "prazo vencido e não indicada: empresa paga", "multa": { "status": 202410000, "dataParaIndicar": "2026-11-01" }, "passo": "PrazoVencido", "dados": { "indicou": false }, "mudancas": ["motivoEmpresa=100000000", "responsavel=100000001", "status=202410001"] },
    { "nome": "cancelar", "multa": { "status": 202410001 }, "passo": "Cancelar", "dados": { "motivoTexto": "Multa duplicada no portal" }, "mudancas": ["canceladaEm=2026-11-17", "motivoCancelamento=Multa duplicada no portal", "status=202410007"] },
    { "nome": "entrar com recurso", "multa": { "status": 202410001, "vencimento": "2026-11-20" }, "passo": "Recorrer", "dados": {}, "mudancas": ["recursoPendente=true", "status=202410002"] },
    { "nome": "recurso indeferido volta para Pagar", "multa": { "status": 202410002, "recursoPendente": true }, "passo": "ResultadoRecurso", "dados": { "resultado": "indeferido" }, "mudancas": ["recursoPendente=false", "status=202410001"] },
    { "nome": "recurso deferido encerra", "multa": { "status": 202410002, "recursoPendente": true }, "passo": "ResultadoRecurso", "dados": { "resultado": "deferido" }, "mudancas": ["encerradaEm=2026-11-17", "recursoPendente=false", "status=202410005"] }
  ]
}
```

- [ ] **Step 2: Escrever o teste de paridade (falha: `MultaEtapas` não existe)**

`packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeMultaTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

[DataContract]
public sealed class FixtureMultas
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "avaliacoes")] public List<CasoAvaliacao> Avaliacoes { get; set; } = new();
    [DataMember(Name = "validacoes")] public List<CasoValidacao> Validacoes { get; set; } = new();
    [DataMember(Name = "aplicacoes")] public List<CasoAplicacao> Aplicacoes { get; set; } = new();

    public static FixtureMultas Carregar() => Json.Ler<FixtureMultas>(File.ReadAllText(FixtureParidade.Caminho("Fixtures", "multa-etapas.json")));
}

[DataContract]
public sealed class CasoAvaliacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "etapa")] public string Etapa { get; set; } = "";
    [DataMember(Name = "pendentes")] public List<string> Pendentes { get; set; } = new();
    [DataMember(Name = "proximoPasso")] public string ProximoPasso { get; set; } = "";
    [DataMember(Name = "proximoPrazo")] public string? ProximoPrazo { get; set; }
    [DataMember(Name = "prazoVencido")] public bool PrazoVencido { get; set; }
    [DataMember(Name = "aguardandoPenalidade")] public bool AguardandoPenalidade { get; set; }
}

[DataContract]
public sealed class CasoValidacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "erro")] public string? Erro { get; set; }
}

[DataContract]
public sealed class CasoAplicacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "mudancas")] public List<string> Mudancas { get; set; } = new();
}

public class ParidadeMultaTests
{
    private static string Linha(string nome, string etapa, IEnumerable<string> pendentes, string passo, string? prazo, bool vencido, bool penalidade)
        => $"{nome} | {etapa} | {string.Join(",", pendentes)} | {passo} | {prazo ?? "null"} | {vencido} | {penalidade}";

    [Fact]
    public void Avalia_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Avaliacoes);
        foreach (var c in f.Avaliacoes)
        {
            var s = MultaEtapas.Avaliar(c.Multa, f.Hoje);
            Assert.Equal(Linha(c.Nome, c.Etapa, c.Pendentes, c.ProximoPasso, c.ProximoPrazo, c.PrazoVencido, c.AguardandoPenalidade),
                Linha(c.Nome, s.Etapa, s.Pendentes, s.ProximoPasso, s.ProximoPrazo, s.PrazoVencido, s.AguardandoPenalidade));
        }
    }

    [Fact]
    public void Valida_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Validacoes);
        foreach (var c in f.Validacoes)
            Assert.Equal($"{c.Nome}: {c.Erro ?? "ok"}", $"{c.Nome}: {MultaEtapas.Validar(c.Multa, c.Passo, c.Dados ?? new DadosPasso(), f.Hoje) ?? "ok"}");
    }

    [Fact]
    public void Aplica_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Aplicacoes);
        foreach (var c in f.Aplicacoes)
        {
            var dados = c.Dados ?? new DadosPasso();
            Assert.Null(MultaEtapas.Validar(c.Multa, c.Passo, dados, f.Hoje));
            var depois = MultaEtapas.Aplicar(c.Multa, c.Passo, dados, f.Hoje);
            var mudancas = MultaEtapas.Mudancas(c.Multa, depois).Select(m => $"{m.Key}={MultaEtapas.Formatar(m.Value)}").OrderBy(x => x, StringComparer.Ordinal);
            Assert.Equal($"{c.Nome}: {string.Join(" ", c.Mudancas)}", $"{c.Nome}: {string.Join(" ", mudancas)}");
        }
    }

    [Fact]
    public void Todo_passo_tem_rotulo()
    {
        Assert.All(Passos.Todos, p => Assert.True(MultaEtapas.RotuloPasso.ContainsKey(p), p));
    }

    [Fact]
    public void Aplicar_nao_muda_o_estado_de_entrada()
    {
        var antes = new MultaEstado { Status = MultaCodigos.Identificar };
        MultaEtapas.Aplicar(antes, Passos.DefinirResponsavel, new DadosPasso { Responsavel = "empresa" }, "2026-11-17");
        Assert.Equal(MultaCodigos.Identificar, antes.Status);
        Assert.Null(antes.Responsavel);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~ParidadeMultaTests`
Expected: FAIL na compilação ("The type or namespace name 'MultaEtapas' could not be found").

- [ ] **Step 4: Implementar `MultaEtapas.cs`**

`packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;
using System.Text.RegularExpressions;

namespace Cr40f.Frota.Plugin;

/// <summary>Códigos de cr40f_multas, iguais a apps/shell/src/pages/frota/data/schema.ts (MULTA, RESPONSAVEL, MOTIVO_EMPRESA, CANAL).</summary>
public static class MultaCodigos
{
    public const int Identificar = 202410000, Indicar = 202410004, Pagar = 202410001, Acertar = 202410006;
    public const int Encerrada = 202410005, Recurso = 202410002, Descontado = 202410003, Cancelada = 202410007;
    public const int Motorista = 100000000, Empresa = 100000001;
    public const int PrazoPerdido = 100000000, CulpaDaEmpresa = 100000001;
    public const int Senatran = 100000000, DsvDigital = 100000001, Prefeitura = 100000002;
}

public static class Passos
{
    public const string DefinirResponsavel = "DefinirResponsavel";
    public const string AvisarMotorista = "AvisarMotorista";
    public const string RegistrarIndicacao = "RegistrarIndicacao";
    public const string RegistrarAceite = "RegistrarAceite";
    public const string RegistrarPagamento = "RegistrarPagamento";
    public const string RegistrarAcerto = "RegistrarAcerto";
    public const string PrazoVencido = "PrazoVencido";
    public const string Cancelar = "Cancelar";
    public const string Recorrer = "Recorrer";
    public const string ResultadoRecurso = "ResultadoRecurso";
    public static readonly string[] Todos = { DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer, ResultadoRecurso };
}

/// <summary>O que as regras leem e o passo muda. Datas em yyyy-MM-dd (dia de São Paulo). Espelho: MultaEstado de multaEtapas.ts.</summary>
[DataContract]
public sealed class MultaEstado
{
    [DataMember(Name = "status")] public int? Status { get; set; }
    [DataMember(Name = "responsavel")] public int? Responsavel { get; set; }
    [DataMember(Name = "motoristaId")] public string? MotoristaId { get; set; }
    [DataMember(Name = "motivoEmpresa")] public int? MotivoEmpresa { get; set; }
    [DataMember(Name = "dataParaIndicar")] public string? DataParaIndicar { get; set; }
    [DataMember(Name = "dataAviso")] public string? DataAviso { get; set; }
    [DataMember(Name = "canal")] public int? Canal { get; set; }
    [DataMember(Name = "dataIndicacao")] public string? DataIndicacao { get; set; }
    [DataMember(Name = "indicado")] public bool? Indicado { get; set; }
    [DataMember(Name = "aceiteEm")] public string? AceiteEm { get; set; }
    [DataMember(Name = "vencimento")] public string? Vencimento { get; set; }
    [DataMember(Name = "pagaEm")] public string? PagaEm { get; set; }
    [DataMember(Name = "valorPago")] public decimal? ValorPago { get; set; }
    [DataMember(Name = "competencia")] public string? Competencia { get; set; }
    [DataMember(Name = "acertoEm")] public string? AcertoEm { get; set; }
    [DataMember(Name = "encerradaEm")] public string? EncerradaEm { get; set; }
    [DataMember(Name = "canceladaEm")] public string? CanceladaEm { get; set; }
    [DataMember(Name = "motivoCancelamento")] public string? MotivoCancelamento { get; set; }
    [DataMember(Name = "recursoPendente")] public bool? RecursoPendente { get; set; }

    public MultaEstado Copia() => (MultaEstado)MemberwiseClone();
}

/// <summary>DadosJson da cr40f_PassoMulta. Textos fixos: responsavel motorista|empresa, motivo prazo-perdido|culpa-empresa,
/// canal senatran|dsv|prefeitura, acerto folha|empresa, resultado deferido|indeferido, competencia yyyy-MM.</summary>
[DataContract]
public sealed class DadosPasso
{
    [DataMember(Name = "responsavel")] public string? Responsavel { get; set; }
    [DataMember(Name = "motoristaId")] public string? MotoristaId { get; set; }
    [DataMember(Name = "motivo")] public string? Motivo { get; set; }
    [DataMember(Name = "canal")] public string? Canal { get; set; }
    [DataMember(Name = "data")] public string? Data { get; set; }
    [DataMember(Name = "valorPago")] public decimal? ValorPago { get; set; }
    [DataMember(Name = "competencia")] public string? Competencia { get; set; }
    [DataMember(Name = "acerto")] public string? Acerto { get; set; }
    [DataMember(Name = "indicou")] public bool? Indicou { get; set; }
    [DataMember(Name = "resultado")] public string? Resultado { get; set; }
    [DataMember(Name = "motivoTexto")] public string? MotivoTexto { get; set; }
}

/// <summary>Saída MultaJson da cr40f_PassoMulta; também usada pela tarefa e pelo e-mail.</summary>
[DataContract]
public sealed class MultaSituacao
{
    [DataMember(Name = "etapa", Order = 1)] public string Etapa { get; set; } = "";
    [DataMember(Name = "pendentes", Order = 2)] public List<string> Pendentes { get; set; } = new();
    [DataMember(Name = "proximoPasso", Order = 3)] public string ProximoPasso { get; set; } = "";
    [DataMember(Name = "proximoPrazo", Order = 4)] public string? ProximoPrazo { get; set; }
    [DataMember(Name = "prazoVencido", Order = 5)] public bool PrazoVencido { get; set; }
    [DataMember(Name = "aguardandoPenalidade", Order = 6)] public bool AguardandoPenalidade { get; set; }
}

/// <summary>
/// Regras da multa (spec §3 e §5.1). Espelho em apps/shell/src/pages/frota/domain/multaEtapas.ts; a paridade é conferida por
/// Fixtures/multa-etapas.json, lido pelos dois lados. Mudou aqui, mude lá e no fixture.
/// </summary>
public static class MultaEtapas
{
    public const string Identificar = "identificar", Indicar = "indicar", Pagar = "pagar", Acertar = "acertar";
    public const string Encerrada = "encerrada", Recurso = "recurso", Cancelada = "cancelada";
    private static readonly Regex DiaIso = new(@"^\d{4}-\d{2}-\d{2}$");
    private static readonly Regex MesIso = new(@"^\d{4}-\d{2}(-01)?$");

    public static readonly IReadOnlyDictionary<string, string> RotuloPasso = new Dictionary<string, string>
    {
        [Passos.DefinirResponsavel] = "Definir o responsável",
        [Passos.AvisarMotorista] = "Avisar o motorista",
        [Passos.RegistrarIndicacao] = "Indicar no órgão",
        [Passos.RegistrarAceite] = "Conferir o aceite na CNH Digital",
        [Passos.RegistrarPagamento] = "Pagar a guia",
        [Passos.RegistrarAcerto] = "Acertar",
        [Passos.PrazoVencido] = "Prazo vencido: responder",
        [Passos.Cancelar] = "Cancelar",
        [Passos.Recorrer] = "Entrar com recurso",
        [Passos.ResultadoRecurso] = "Registrar o resultado do recurso",
    };

    public static readonly IReadOnlyDictionary<string, string> RotuloEtapa = new Dictionary<string, string>
    {
        [Identificar] = "1. Identificar o responsável", [Indicar] = "2. Indicar no órgão", [Pagar] = "3. Pagar", [Acertar] = "4. Acertar",
        [Encerrada] = "Encerrada", [Recurso] = "Em recurso", [Cancelada] = "Cancelada",
    };

    private static readonly IReadOnlyDictionary<string, string> Antes = new Dictionary<string, string>
    {
        [Passos.AvisarMotorista] = "Avise o motorista antes de registrar a indicação.",
        [Passos.RegistrarIndicacao] = "Registre a indicação antes do aceite.",
    };

    public static string Etapa(int? status) => status switch
    {
        MultaCodigos.Indicar => Indicar,
        MultaCodigos.Pagar => Pagar,
        MultaCodigos.Acertar => Acertar,
        MultaCodigos.Encerrada or MultaCodigos.Descontado => Encerrada,
        MultaCodigos.Recurso => Recurso,
        MultaCodigos.Cancelada => Cancelada,
        _ => Identificar,
    };

    public static bool Aberta(string etapa) => etapa != Encerrada && etapa != Cancelada;

    /// <summary>Responsável vazio (multas antigas) vale o motorista do lookup, inclusive os funcionários "Empresa" e "Locatário".</summary>
    public static int? ResponsavelEfetivo(MultaEstado m) => m.Responsavel ?? (string.IsNullOrEmpty(m.MotoristaId) ? null : MultaCodigos.Motorista);

    public static bool PrazoVencido(MultaEstado m, string hoje)
    {
        var etapa = Etapa(m.Status);
        return (etapa == Identificar || etapa == Indicar) && m.DataParaIndicar != null && string.CompareOrdinal(m.DataParaIndicar, hoje) < 0;
    }

    public static MultaSituacao Avaliar(MultaEstado m, string hoje)
    {
        var etapa = Etapa(m.Status);
        var s = new MultaSituacao
        {
            Etapa = etapa,
            PrazoVencido = PrazoVencido(m, hoje),
            ProximoPrazo = etapa == Identificar || etapa == Indicar ? m.DataParaIndicar : etapa == Pagar ? m.Vencimento : null,
        };
        if (s.PrazoVencido) s.Pendentes.Add(Passos.PrazoVencido);
        else switch (etapa)
        {
            case Identificar: s.Pendentes.Add(Passos.DefinirResponsavel); break;
            case Indicar:
                if (m.DataAviso == null) s.Pendentes.Add(Passos.AvisarMotorista);
                if (m.DataIndicacao == null || m.Canal == null) s.Pendentes.Add(Passos.RegistrarIndicacao);
                else if (m.Canal == MultaCodigos.Senatran && m.AceiteEm == null) s.Pendentes.Add(Passos.RegistrarAceite);
                break;
            case Pagar:
                if (m.Vencimento == null) s.AguardandoPenalidade = true;
                else s.Pendentes.Add(Passos.RegistrarPagamento);
                break;
            case Acertar: s.Pendentes.Add(Passos.RegistrarAcerto); break;
            case Recurso: s.Pendentes.Add(Passos.ResultadoRecurso); break;
        }
        s.ProximoPasso = s.Pendentes.Count > 0 ? RotuloPasso[s.Pendentes[0]]
            : s.AguardandoPenalidade ? "Aguardando penalidade"
            : etapa == Cancelada ? "Cancelada" : etapa == Encerrada ? "Encerrada" : "";
        return s;
    }

    public static string? Validar(MultaEstado m, string passo, DadosPasso d, string hoje)
    {
        if (!Passos.Todos.Contains(passo)) return $"Passo desconhecido: {passo}.";
        var s = Avaliar(m, hoje);
        if (s.PrazoVencido && passo != Passos.PrazoVencido) return "O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir.";
        switch (passo)
        {
            case Passos.PrazoVencido:
                if (!s.PrazoVencido) return "O prazo de indicação ainda não venceu.";
                if (d.Indicou is not bool indicou) return "Responda se a multa foi indicada.";
                if (!indicou) return null;
                return CanalDe(d.Canal) == null ? "Escolha o canal da indicação." : DataRuim(d.Data, hoje, "Informe a data da indicação.");
            case Passos.Cancelar:
                if (!Aberta(s.Etapa)) return "Esta multa já está encerrada.";
                var motivo = d.MotivoTexto?.Trim() ?? "";
                if (motivo.Length < 5) return "Escreva o motivo do cancelamento.";
                return motivo.Length > 2000 ? "O motivo do cancelamento passa de 2.000 caracteres." : null;
            case Passos.Recorrer:
                return s.Etapa == Identificar || s.Etapa == Indicar || s.Etapa == Pagar ? null : "Só dá para entrar com recurso antes do pagamento.";
        }
        if (s.Pendentes.Count == 0)
            return s.AguardandoPenalidade && passo == Passos.RegistrarPagamento
                ? "A penalidade ainda não chegou: grave o vencimento antes de registrar o pagamento."
                : "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
        if (!s.Pendentes.Contains(passo)) return "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
        if (s.Pendentes[0] != passo) return Antes.TryGetValue(s.Pendentes[0], out var antes) ? antes : "Siga a ordem dos passos.";
        switch (passo)
        {
            case Passos.DefinirResponsavel:
                if (d.Responsavel == "empresa") return null;
                if (d.Responsavel != "motorista") return "Escolha o responsável: motorista ou empresa.";
                return string.IsNullOrWhiteSpace(d.MotoristaId) ? "Escolha o motorista." : null;
            case Passos.AvisarMotorista:
                return string.IsNullOrWhiteSpace(d.Data) ? null : DataRuim(d.Data, hoje, "");
            case Passos.RegistrarIndicacao:
                return CanalDe(d.Canal) == null ? "Escolha o canal da indicação." : DataRuim(d.Data, hoje, "Informe a data da indicação.");
            case Passos.RegistrarAceite:
                return DataRuim(d.Data, hoje, "Informe a data do aceite.");
            case Passos.RegistrarPagamento:
                return DataRuim(d.Data, hoje, "Informe a data do pagamento.") ?? (d.ValorPago is decimal v && v > 0 ? null : "Informe o valor pago.");
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") return d.Competencia != null && MesIso.IsMatch(d.Competencia) ? null : "Informe o mês do desconto.";
                if (d.Acerto == "empresa") return MotivoDe(d.Motivo) == null ? "Escolha o motivo de a empresa assumir." : null;
                return "Escolha: lancei na folha ou empresa assume.";
            case Passos.ResultadoRecurso:
                return d.Resultado == "deferido" || d.Resultado == "indeferido" ? null : "Escolha o resultado do recurso: deferido ou indeferido.";
        }
        return null;
    }

    public static MultaEstado Aplicar(MultaEstado m, string passo, DadosPasso d, string hoje)
    {
        var n = m.Copia();
        switch (passo)
        {
            case Passos.DefinirResponsavel:
                if (d.Responsavel == "empresa") { n.Responsavel = MultaCodigos.Empresa; n.MotivoEmpresa = MultaCodigos.CulpaDaEmpresa; n.Status = MultaCodigos.Pagar; }
                else { n.Responsavel = MultaCodigos.Motorista; n.MotoristaId = d.MotoristaId; n.Status = MultaCodigos.Indicar; }
                break;
            case Passos.AvisarMotorista:
                n.DataAviso = string.IsNullOrWhiteSpace(d.Data) ? hoje : d.Data;
                break;
            case Passos.RegistrarIndicacao:
                n.Canal = CanalDe(d.Canal); n.DataIndicacao = d.Data; n.Indicado = true;
                if (n.Canal != MultaCodigos.Senatran || n.AceiteEm != null) n.Status = MultaCodigos.Pagar;
                break;
            case Passos.RegistrarAceite:
                n.AceiteEm = d.Data; n.Status = MultaCodigos.Pagar;
                break;
            case Passos.RegistrarPagamento:
                n.PagaEm = d.Data; n.ValorPago = d.ValorPago;
                // Multa da Empresa: o acerto "empresa assume" (com o motivo já gravado) sai junto e a multa encerra.
                if (ResponsavelEfetivo(m) == MultaCodigos.Empresa) { n.AcertoEm = d.Data; n.EncerradaEm = d.Data; n.Status = MultaCodigos.Encerrada; }
                else n.Status = MultaCodigos.Acertar;
                break;
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") n.Competencia = d.Competencia!.Length == 7 ? d.Competencia + "-01" : d.Competencia;
                else n.MotivoEmpresa = MotivoDe(d.Motivo);
                n.AcertoEm = hoje; n.EncerradaEm = hoje; n.Status = MultaCodigos.Encerrada;
                break;
            case Passos.PrazoVencido:
                if (d.Indicou == true)
                {
                    n.Canal = CanalDe(d.Canal); n.DataIndicacao = d.Data; n.Indicado = true;
                    if (!string.IsNullOrWhiteSpace(d.MotoristaId)) { n.MotoristaId = d.MotoristaId; n.Responsavel = MultaCodigos.Motorista; }
                }
                else { n.Responsavel = MultaCodigos.Empresa; n.MotivoEmpresa = MultaCodigos.PrazoPerdido; }
                n.Status = MultaCodigos.Pagar;
                break;
            case Passos.Cancelar:
                n.MotivoCancelamento = d.MotivoTexto!.Trim(); n.CanceladaEm = hoje; n.Status = MultaCodigos.Cancelada;
                break;
            case Passos.Recorrer:
                n.RecursoPendente = true; n.Status = MultaCodigos.Recurso;
                break;
            case Passos.ResultadoRecurso:
                n.RecursoPendente = false;
                if (d.Resultado == "deferido") { n.EncerradaEm = hoje; n.Status = MultaCodigos.Encerrada; }
                else n.Status = MultaCodigos.Pagar;
                break;
        }
        return n;
    }

    private static readonly (string Campo, Func<MultaEstado, object?> Ler)[] Campos =
    {
        ("status", m => m.Status), ("responsavel", m => m.Responsavel), ("motoristaId", m => m.MotoristaId), ("motivoEmpresa", m => m.MotivoEmpresa),
        ("dataAviso", m => m.DataAviso), ("canal", m => m.Canal), ("dataIndicacao", m => m.DataIndicacao), ("indicado", m => m.Indicado),
        ("aceiteEm", m => m.AceiteEm), ("pagaEm", m => m.PagaEm), ("valorPago", m => m.ValorPago), ("competencia", m => m.Competencia),
        ("acertoEm", m => m.AcertoEm), ("encerradaEm", m => m.EncerradaEm), ("canceladaEm", m => m.CanceladaEm),
        ("motivoCancelamento", m => m.MotivoCancelamento), ("recursoPendente", m => m.RecursoPendente),
    };

    public static List<KeyValuePair<string, object?>> Mudancas(MultaEstado antes, MultaEstado depois) =>
        Campos.Where(c => !Equals(c.Ler(antes), c.Ler(depois))).Select(c => new KeyValuePair<string, object?>(c.Campo, c.Ler(depois))).ToList();

    public static string Formatar(object? valor) => valor switch
    {
        null => "null",
        bool b => b ? "true" : "false",
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => valor.ToString() ?? "",
    };

    public static int? CanalDe(string? canal) => canal switch
    {
        "senatran" => MultaCodigos.Senatran, "dsv" => MultaCodigos.DsvDigital, "prefeitura" => MultaCodigos.Prefeitura, _ => null,
    };

    public static int? MotivoDe(string? motivo) => motivo switch
    {
        "prazo-perdido" => MultaCodigos.PrazoPerdido, "culpa-empresa" => MultaCodigos.CulpaDaEmpresa, _ => null,
    };

    private static string? DataRuim(string? data, string hoje, string vazio)
    {
        if (string.IsNullOrWhiteSpace(data)) return vazio;
        if (!DiaIso.IsMatch(data) || !DateTime.TryParseExact(data, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return "Data inválida.";
        return string.CompareOrdinal(data, hoje) > 0 ? "A data não pode ser no futuro." : null;
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~ParidadeMultaTests`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeMultaTests.cs packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json
git commit -m "feat(multas): regras das etapas no plugin da frota com fixture de paridade"
```

---

### Task 3: Espelho das regras no shell (`multaEtapas.ts`) e paridade

**Files:**
- Modify: `apps/shell/src/pages/frota/data/schema.ts` (linha do `MULTA` e constantes novas)
- Create: `apps/shell/src/pages/frota/domain/multaEtapas.ts`
- Test: `apps/shell/src/pages/frota/domain/multaEtapas.test.ts`

**Interfaces:**
- Consumes: `Fixtures/multa-etapas.json` (Task 2).
- Produces (`frota/data/schema.ts`): `MULTA.CANCELADA = 202410007`, `RESPONSAVEL`, `MOTIVO_EMPRESA`, `CANAL`.
- Produces (`frota/domain/multaEtapas.ts`): `type Etapa`, `type Passo`, `PASSOS`, `type MultaEstado`, `type DadosPasso`, `type Situacao`, `ROTULO_PASSO`, `ROTULO_ETAPA`, `etapaDe(status)`, `aberta(etapa)`, `responsavelEfetivo(m)`, `prazoVencido(m, hoje)`, `avaliar(m, hoje): Situacao`, `validarPasso(m, passo, dados, hoje): string | null`, `aplicarPasso(m, passo, dados, hoje): MultaEstado`, `mudancas(antes, depois): string[]` (formato `campo=valor`).

- [ ] **Step 1: Escrever o teste de paridade (falha: módulo não existe)**

`apps/shell/src/pages/frota/domain/multaEtapas.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { aplicarPasso, avaliar, mudancas, PASSOS, ROTULO_PASSO, validarPasso, type DadosPasso, type MultaEstado } from './multaEtapas'

type F = {
  hoje: string
  avaliacoes: { nome: string; multa: MultaEstado; etapa: string; pendentes: string[]; proximoPasso: string; proximoPrazo: string | null; prazoVencido: boolean; aguardandoPenalidade: boolean }[]
  validacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; erro: string | null }[]
  aplicacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; mudancas: string[] }[]
}

// Mesmo arquivo dos testes do plugin C# (MultaEtapas.cs).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json', import.meta.url))
const f = JSON.parse(readFileSync(caminho, 'utf8')) as F

describe('paridade de MultaEtapas com o plugin', () => {
  it.each(f.avaliacoes.map((c) => [c.nome, c] as const))('avalia: %s', (_nome, c) => {
    const s = avaliar(c.multa, f.hoje)
    expect(s).toEqual({ etapa: c.etapa, pendentes: c.pendentes, proximoPasso: c.proximoPasso, proximoPrazo: c.proximoPrazo, prazoVencido: c.prazoVencido, aguardandoPenalidade: c.aguardandoPenalidade })
  })

  it.each(f.validacoes.map((c) => [c.nome, c] as const))('valida: %s', (_nome, c) => {
    expect(validarPasso(c.multa, c.passo, c.dados ?? {}, f.hoje)).toBe(c.erro)
  })

  it.each(f.aplicacoes.map((c) => [c.nome, c] as const))('aplica: %s', (_nome, c) => {
    const dados = c.dados ?? {}
    expect(validarPasso(c.multa, c.passo, dados, f.hoje)).toBeNull()
    expect(mudancas(c.multa, aplicarPasso(c.multa, c.passo as (typeof PASSOS)[number], dados, f.hoje)).sort()).toEqual(c.mudancas)
  })

  it('todo passo tem rótulo e aplicar não muda a entrada', () => {
    expect(PASSOS.every((p) => ROTULO_PASSO[p])).toBe(true)
    const antes: MultaEstado = { status: 202410000 }
    aplicarPasso(antes, 'DefinirResponsavel', { responsavel: 'empresa' }, '2026-11-17')
    expect(antes).toEqual({ status: 202410000 })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/multaEtapas.test.ts`
Expected: FAIL ("Failed to resolve import './multaEtapas'").

- [ ] **Step 3: Acrescentar as constantes ao `schema.ts`**

Em `apps/shell/src/pages/frota/data/schema.ts`, troque a linha `export const MULTA = { ... }` por:

```ts
export const MULTA = { NOTIFICAR: 202410000, INDICADA: 202410001, RECURSO: 202410002, DESCONTADO: 202410003, NOTIFICADO: 202410004, FINALIZADO: 202410005, PAGO: 202410006, CANCELADA: 202410007 } as const
/** Choices novos da multa (fase 1), iguais a MultaCodigos de packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs. */
export const RESPONSAVEL = { MOTORISTA: 100000000, EMPRESA: 100000001 } as const
export const MOTIVO_EMPRESA = { PRAZO_PERDIDO: 100000000, CULPA_EMPRESA: 100000001 } as const
export const CANAL = { SENATRAN: 100000000, DSV: 100000001, PREFEITURA: 100000002 } as const
```

- [ ] **Step 4: Implementar o espelho**

`apps/shell/src/pages/frota/domain/multaEtapas.ts`:

```ts
import { CANAL, MOTIVO_EMPRESA, MULTA, RESPONSAVEL } from '../data/schema'

/**
 * Espelho de packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs (spec §3 e §5.1). A paridade é conferida por
 * packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json (multaEtapas.test.ts e ParidadeMultaTests.cs).
 * O servidor é quem decide: a tela usa isto para mostrar o passo e travar o botão; a gravação passa pela cr40f_PassoMulta.
 */
export type Etapa = 'identificar' | 'indicar' | 'pagar' | 'acertar' | 'encerrada' | 'recurso' | 'cancelada'
export const PASSOS = ['DefinirResponsavel', 'AvisarMotorista', 'RegistrarIndicacao', 'RegistrarAceite', 'RegistrarPagamento', 'RegistrarAcerto', 'PrazoVencido', 'Cancelar', 'Recorrer', 'ResultadoRecurso'] as const
export type Passo = (typeof PASSOS)[number]

export type MultaEstado = {
  status?: number | null; responsavel?: number | null; motoristaId?: string | null; motivoEmpresa?: number | null
  dataParaIndicar?: string | null; dataAviso?: string | null; canal?: number | null; dataIndicacao?: string | null; indicado?: boolean | null
  aceiteEm?: string | null; vencimento?: string | null; pagaEm?: string | null; valorPago?: number | null; competencia?: string | null
  acertoEm?: string | null; encerradaEm?: string | null; canceladaEm?: string | null; motivoCancelamento?: string | null; recursoPendente?: boolean | null
}

export type DadosPasso = {
  responsavel?: 'motorista' | 'empresa'; motoristaId?: string; motivo?: 'prazo-perdido' | 'culpa-empresa'
  canal?: 'senatran' | 'dsv' | 'prefeitura'; data?: string; valorPago?: number; competencia?: string
  acerto?: 'folha' | 'empresa'; indicou?: boolean; resultado?: 'deferido' | 'indeferido'; motivoTexto?: string
}

export type Situacao = { etapa: Etapa; pendentes: Passo[]; proximoPasso: string; proximoPrazo: string | null; prazoVencido: boolean; aguardandoPenalidade: boolean }

export const ROTULO_PASSO: Record<Passo, string> = {
  DefinirResponsavel: 'Definir o responsável',
  AvisarMotorista: 'Avisar o motorista',
  RegistrarIndicacao: 'Indicar no órgão',
  RegistrarAceite: 'Conferir o aceite na CNH Digital',
  RegistrarPagamento: 'Pagar a guia',
  RegistrarAcerto: 'Acertar',
  PrazoVencido: 'Prazo vencido: responder',
  Cancelar: 'Cancelar',
  Recorrer: 'Entrar com recurso',
  ResultadoRecurso: 'Registrar o resultado do recurso',
}

export const ROTULO_ETAPA: Record<Etapa, string> = {
  identificar: '1. Identificar o responsável', indicar: '2. Indicar no órgão', pagar: '3. Pagar', acertar: '4. Acertar',
  encerrada: 'Encerrada', recurso: 'Em recurso', cancelada: 'Cancelada',
}

const ANTES: Partial<Record<Passo, string>> = {
  AvisarMotorista: 'Avise o motorista antes de registrar a indicação.',
  RegistrarIndicacao: 'Registre a indicação antes do aceite.',
}

export function etapaDe(status: number | null | undefined): Etapa {
  switch (status) {
    case MULTA.NOTIFICADO: return 'indicar'
    case MULTA.INDICADA: return 'pagar'
    case MULTA.PAGO: return 'acertar'
    case MULTA.FINALIZADO: case MULTA.DESCONTADO: return 'encerrada'
    case MULTA.RECURSO: return 'recurso'
    case MULTA.CANCELADA: return 'cancelada'
    default: return 'identificar'
  }
}

export const aberta = (etapa: Etapa) => etapa !== 'encerrada' && etapa !== 'cancelada'

/** Responsável vazio (multas antigas) vale o motorista do lookup. */
export const responsavelEfetivo = (m: MultaEstado): number | null => m.responsavel ?? (m.motoristaId ? RESPONSAVEL.MOTORISTA : null)

export function prazoVencido(m: MultaEstado, hoje: string) {
  const etapa = etapaDe(m.status)
  return (etapa === 'identificar' || etapa === 'indicar') && !!m.dataParaIndicar && m.dataParaIndicar < hoje
}

export function avaliar(m: MultaEstado, hoje: string): Situacao {
  const etapa = etapaDe(m.status)
  const vencido = prazoVencido(m, hoje)
  const pendentes: Passo[] = []
  let aguardandoPenalidade = false
  if (vencido) pendentes.push('PrazoVencido')
  else if (etapa === 'identificar') pendentes.push('DefinirResponsavel')
  else if (etapa === 'indicar') {
    if (!m.dataAviso) pendentes.push('AvisarMotorista')
    if (!m.dataIndicacao || m.canal == null) pendentes.push('RegistrarIndicacao')
    else if (m.canal === CANAL.SENATRAN && !m.aceiteEm) pendentes.push('RegistrarAceite')
  } else if (etapa === 'pagar') {
    if (!m.vencimento) aguardandoPenalidade = true
    else pendentes.push('RegistrarPagamento')
  } else if (etapa === 'acertar') pendentes.push('RegistrarAcerto')
  else if (etapa === 'recurso') pendentes.push('ResultadoRecurso')
  const proximoPrazo = (etapa === 'identificar' || etapa === 'indicar' ? m.dataParaIndicar : etapa === 'pagar' ? m.vencimento : null) ?? null
  const proximoPasso = pendentes.length ? ROTULO_PASSO[pendentes[0]] : aguardandoPenalidade ? 'Aguardando penalidade' : etapa === 'cancelada' ? 'Cancelada' : etapa === 'encerrada' ? 'Encerrada' : ''
  return { etapa, pendentes, proximoPasso, proximoPrazo, prazoVencido: vencido, aguardandoPenalidade }
}

const CANAL_DE: Record<string, number> = { senatran: CANAL.SENATRAN, dsv: CANAL.DSV, prefeitura: CANAL.PREFEITURA }
const MOTIVO_DE: Record<string, number> = { 'prazo-perdido': MOTIVO_EMPRESA.PRAZO_PERDIDO, 'culpa-empresa': MOTIVO_EMPRESA.CULPA_EMPRESA }
const canalDe = (c: string | undefined) => (c ? CANAL_DE[c] ?? null : null)
const motivoDe = (c: string | undefined) => (c ? MOTIVO_DE[c] ?? null : null)

function dataRuim(data: string | undefined, hoje: string, vazio: string): string | null {
  if (!data || !data.trim()) return vazio
  const d = new Date(`${data}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return 'Data inválida.'
  return data > hoje ? 'A data não pode ser no futuro.' : null
}

export function validarPasso(m: MultaEstado, passo: string, d: DadosPasso, hoje: string): string | null {
  if (!(PASSOS as readonly string[]).includes(passo)) return `Passo desconhecido: ${passo}.`
  const s = avaliar(m, hoje)
  if (s.prazoVencido && passo !== 'PrazoVencido') return 'O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir.'
  if (passo === 'PrazoVencido') {
    if (!s.prazoVencido) return 'O prazo de indicação ainda não venceu.'
    if (typeof d.indicou !== 'boolean') return 'Responda se a multa foi indicada.'
    if (!d.indicou) return null
    return canalDe(d.canal) === null ? 'Escolha o canal da indicação.' : dataRuim(d.data, hoje, 'Informe a data da indicação.')
  }
  if (passo === 'Cancelar') {
    if (!aberta(s.etapa)) return 'Esta multa já está encerrada.'
    const motivo = d.motivoTexto?.trim() ?? ''
    if (motivo.length < 5) return 'Escreva o motivo do cancelamento.'
    return motivo.length > 2000 ? 'O motivo do cancelamento passa de 2.000 caracteres.' : null
  }
  if (passo === 'Recorrer') return s.etapa === 'identificar' || s.etapa === 'indicar' || s.etapa === 'pagar' ? null : 'Só dá para entrar com recurso antes do pagamento.'
  if (!s.pendentes.length) {
    return s.aguardandoPenalidade && passo === 'RegistrarPagamento'
      ? 'A penalidade ainda não chegou: grave o vencimento antes de registrar o pagamento.'
      : 'Este passo não vale para a etapa atual da multa. Recarregue a tela.'
  }
  if (!s.pendentes.includes(passo as Passo)) return 'Este passo não vale para a etapa atual da multa. Recarregue a tela.'
  if (s.pendentes[0] !== passo) return ANTES[s.pendentes[0]] ?? 'Siga a ordem dos passos.'
  switch (passo as Passo) {
    case 'DefinirResponsavel':
      if (d.responsavel === 'empresa') return null
      if (d.responsavel !== 'motorista') return 'Escolha o responsável: motorista ou empresa.'
      return d.motoristaId?.trim() ? null : 'Escolha o motorista.'
    case 'AvisarMotorista':
      return d.data?.trim() ? dataRuim(d.data, hoje, '') : null
    case 'RegistrarIndicacao':
      return canalDe(d.canal) === null ? 'Escolha o canal da indicação.' : dataRuim(d.data, hoje, 'Informe a data da indicação.')
    case 'RegistrarAceite':
      return dataRuim(d.data, hoje, 'Informe a data do aceite.')
    case 'RegistrarPagamento':
      return dataRuim(d.data, hoje, 'Informe a data do pagamento.') ?? (typeof d.valorPago === 'number' && d.valorPago > 0 ? null : 'Informe o valor pago.')
    case 'RegistrarAcerto':
      if (d.acerto === 'folha') return d.competencia && /^\d{4}-\d{2}(-01)?$/.test(d.competencia) ? null : 'Informe o mês do desconto.'
      if (d.acerto === 'empresa') return motivoDe(d.motivo) === null ? 'Escolha o motivo de a empresa assumir.' : null
      return 'Escolha: lancei na folha ou empresa assume.'
    case 'ResultadoRecurso':
      return d.resultado === 'deferido' || d.resultado === 'indeferido' ? null : 'Escolha o resultado do recurso: deferido ou indeferido.'
    default:
      return null
  }
}

export function aplicarPasso(m: MultaEstado, passo: Passo, d: DadosPasso, hoje: string): MultaEstado {
  const n: MultaEstado = { ...m }
  switch (passo) {
    case 'DefinirResponsavel':
      if (d.responsavel === 'empresa') Object.assign(n, { responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.CULPA_EMPRESA, status: MULTA.INDICADA })
      else Object.assign(n, { responsavel: RESPONSAVEL.MOTORISTA, motoristaId: d.motoristaId, status: MULTA.NOTIFICADO })
      break
    case 'AvisarMotorista':
      n.dataAviso = d.data?.trim() ? d.data : hoje
      break
    case 'RegistrarIndicacao':
      Object.assign(n, { canal: canalDe(d.canal), dataIndicacao: d.data, indicado: true })
      if (n.canal !== CANAL.SENATRAN || n.aceiteEm) n.status = MULTA.INDICADA
      break
    case 'RegistrarAceite':
      Object.assign(n, { aceiteEm: d.data, status: MULTA.INDICADA })
      break
    case 'RegistrarPagamento':
      Object.assign(n, { pagaEm: d.data, valorPago: d.valorPago })
      if (responsavelEfetivo(m) === RESPONSAVEL.EMPRESA) Object.assign(n, { acertoEm: d.data, encerradaEm: d.data, status: MULTA.FINALIZADO })
      else n.status = MULTA.PAGO
      break
    case 'RegistrarAcerto':
      if (d.acerto === 'folha') n.competencia = d.competencia!.length === 7 ? `${d.competencia}-01` : d.competencia
      else n.motivoEmpresa = motivoDe(d.motivo)
      Object.assign(n, { acertoEm: hoje, encerradaEm: hoje, status: MULTA.FINALIZADO })
      break
    case 'PrazoVencido':
      if (d.indicou === true) {
        Object.assign(n, { canal: canalDe(d.canal), dataIndicacao: d.data, indicado: true })
        if (d.motoristaId?.trim()) Object.assign(n, { motoristaId: d.motoristaId, responsavel: RESPONSAVEL.MOTORISTA })
      } else Object.assign(n, { responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO })
      n.status = MULTA.INDICADA
      break
    case 'Cancelar':
      Object.assign(n, { motivoCancelamento: d.motivoTexto!.trim(), canceladaEm: hoje, status: MULTA.CANCELADA })
      break
    case 'Recorrer':
      Object.assign(n, { recursoPendente: true, status: MULTA.RECURSO })
      break
    case 'ResultadoRecurso':
      n.recursoPendente = false
      if (d.resultado === 'deferido') Object.assign(n, { encerradaEm: hoje, status: MULTA.FINALIZADO })
      else n.status = MULTA.INDICADA
      break
  }
  return n
}

const CAMPOS = ['status', 'responsavel', 'motoristaId', 'motivoEmpresa', 'dataAviso', 'canal', 'dataIndicacao', 'indicado', 'aceiteEm', 'pagaEm', 'valorPago', 'competencia', 'acertoEm', 'encerradaEm', 'canceladaEm', 'motivoCancelamento', 'recursoPendente'] as const

/** Campos que mudaram, no formato `campo=valor` (o mesmo de MultaEtapas.Formatar). */
export function mudancas(antes: MultaEstado, depois: MultaEstado): string[] {
  return CAMPOS.flatMap((campo) => {
    const a = antes[campo] ?? null
    const b = depois[campo] ?? null
    return a === b ? [] : [`${campo}=${b === null ? 'null' : String(b)}`]
  })
}
```

- [ ] **Step 5: Rodar e ver passar; typecheck**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/multaEtapas.test.ts && pnpm --filter @betinhos/shell typecheck`
Expected: PASS (todos os casos do fixture); typecheck sem erro.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota/data/schema.ts apps/shell/src/pages/frota/domain/multaEtapas.ts apps/shell/src/pages/frota/domain/multaEtapas.test.ts
git commit -m "feat(multas): espelho das etapas no shell com a mesma paridade do plugin"
```

---
### Task 4: Custom API `cr40f_PassoMulta` (gravação dos passos)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaRepository.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/PassoMultaPlugin.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin.Tests/FakeMundo.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin.Tests/Contexto.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/PassoMultaTests.cs`

**Interfaces:**
- Consumes: `MultaEtapas`, `MultaEstado`, `DadosPasso`, `Passos` (Task 2); `Mapper.Dia` e `FrotaPendenciasPlugin.ResolverHoje` (já existem).
- Produces:
  - `MultaMapper.Tabela = "cr40f_multas"`, `MultaMapper.Colunas` (string[]), `MultaMapper.Coluna` (campo do estado → coluna), `MultaEstado MultaMapper.Estado(Entity)`, `Entity MultaMapper.Gravacao(Guid id, IEnumerable<KeyValuePair<string, object?>> mudancas)`, `DateTime MultaMapper.DataGravada(string dia)` (12:00Z).
  - `Paginas.Todas(IOrganizationService, QueryExpression)`.
  - `PassoMultaPlugin.Mensagem = "cr40f_PassoMulta"`; entradas `MultaId` (Guid), `Passo` (string), `DadosJson` (string, opcional); saída `MultaJson`; `static string PassoMultaPlugin.Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje)`.
  - Testes: `FakeMundo` (IOrganizationService em memória com filtros Equal/In/NotNull/GreaterEqual/LessEqual, `Criados`, `Atualizados`, `Traces`, `Add`, `Linhas`, `Variavel`), `Provedor` (IServiceProvider), `Contexto.Api(...)`, `Contexto.Gravacao(...)`.

- [ ] **Step 1: Escrever os auxiliares de teste**

`packages/plugins/Cr40f.Frota.Plugin.Tests/FakeMundo.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Tests;

/// <summary>Dataverse em memória para os plugins das multas. Filtros: Equal, In, NotNull, GreaterEqual, LessEqual (só no Criteria raiz).</summary>
public sealed class FakeMundo : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();
    public List<string> Traces { get; } = new();

    public List<Entity> Linhas(string tabela)
    {
        if (!_tabelas.TryGetValue(tabela, out var lista)) _tabelas[tabela] = lista = new List<Entity>();
        return lista;
    }

    public Entity Add(Entity linha)
    {
        if (linha.Id == Guid.Empty) linha.Id = Guid.NewGuid();
        Linhas(linha.LogicalName).Add(linha);
        return linha;
    }

    /// <summary>Definição de variável de ambiente com o valor padrão (como a migration cria).</summary>
    public FakeMundo Variavel(string schema, string valor)
    {
        Add(new Entity("environmentvariabledefinition") { ["schemaname"] = schema, ["defaultvalue"] = valor });
        return this;
    }

    private static Entity Copia(Entity e, Guid id)
    {
        var c = new Entity(e.LogicalName, id);
        foreach (var a in e.Attributes) c[a.Key] = a.Value;
        foreach (var f in e.FormattedValues) c.FormattedValues[f.Key] = f.Value;
        return c;
    }

    public Guid Create(Entity entity)
    {
        var c = Copia(entity, entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id);
        Linhas(c.LogicalName).Add(c);
        Criados.Add(c);
        return c.Id;
    }

    public void Update(Entity entity)
    {
        var atual = Linhas(entity.LogicalName).Single(r => r.Id == entity.Id);
        foreach (var a in entity.Attributes) atual[a.Key] = a.Value;
        Atualizados.Add(Copia(entity, entity.Id));
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) =>
        Copia(Linhas(entityName).SingleOrDefault(r => r.Id == id) ?? throw new InvalidOperationException($"{entityName} {id} não existe."), id);

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        IEnumerable<Entity> linhas = Linhas(q.EntityName);
        foreach (var c in q.Criteria.Conditions) linhas = linhas.Where(r => Casa(r, c)).ToList();
        if (q.TopCount is int top) linhas = linhas.Take(top);
        return new EntityCollection(linhas.Select(r => Copia(r, r.Id)).ToList()) { MoreRecords = false };
    }

    private static object? Norm(object? v) => v switch { OptionSetValue o => o.Value, EntityReference r => r.Id, Money m => m.Value, _ => v };

    private static bool Casa(Entity r, ConditionExpression c)
    {
        var v = Norm(r.Contains(c.AttributeName) ? r[c.AttributeName] : null);
        if (c.AttributeName == "statecode" && v == null) v = 0;
        switch (c.Operator)
        {
            case ConditionOperator.Equal:
                return Equals(v, Norm(c.Values[0])) || (v is string s && string.Equals(s, Convert.ToString(c.Values[0]), StringComparison.OrdinalIgnoreCase));
            case ConditionOperator.In: return c.Values.Select(Norm).Any(x => Equals(x, v));
            case ConditionOperator.NotNull: return v != null;
            case ConditionOperator.Null: return v == null;
            case ConditionOperator.GreaterEqual: return v is DateTime a && a >= (DateTime)c.Values[0];
            case ConditionOperator.LessEqual: return v is DateTime b && b <= (DateTime)c.Values[0];
            default: throw new NotSupportedException(c.Operator.ToString());
        }
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException(request.RequestName);
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
```

`packages/plugins/Cr40f.Frota.Plugin.Tests/Contexto.cs`:

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin.Tests;

public sealed class Provedor : IServiceProvider, IOrganizationServiceFactory, ITracingService
{
    private readonly IPluginExecutionContext _ctx;
    private readonly FakeMundo _mundo;
    public Provedor(IPluginExecutionContext ctx, FakeMundo mundo) { _ctx = ctx; _mundo = mundo; }
    public object? GetService(Type tipo) =>
        tipo == typeof(IPluginExecutionContext) ? _ctx : tipo == typeof(IOrganizationServiceFactory) || tipo == typeof(ITracingService) ? this : null;
    public IOrganizationService CreateOrganizationService(Guid? userId) => _mundo;
    public void Trace(string format, params object[] args) => _mundo.Traces.Add(args.Length == 0 ? format : string.Format(format, args));
}

public static class Contexto
{
    public static RemoteExecutionContext Api(string mensagem, Dictionary<string, object> entradas)
    {
        var ctx = new RemoteExecutionContext { MessageName = mensagem, Depth = 1, UserId = Guid.NewGuid(), InitiatingUserId = Guid.NewGuid() };
        foreach (var e in entradas) ctx.InputParameters[e.Key] = e.Value;
        return ctx;
    }

    public static RemoteExecutionContext Gravacao(string mensagem, Entity alvo, Entity? pre = null, RemoteExecutionContext? pai = null, int stage = 20)
    {
        var ctx = new RemoteExecutionContext
        {
            MessageName = mensagem, PrimaryEntityName = alvo.LogicalName, PrimaryEntityId = alvo.Id, Stage = stage,
            Depth = pai == null ? 1 : 2, ParentContext = pai, UserId = Guid.NewGuid(), InitiatingUserId = Guid.NewGuid(),
        };
        ctx.InputParameters["Target"] = alvo;
        if (pre != null) ctx.PreEntityImages["pre"] = pre;
        return ctx;
    }

    public static void Rodar(IPlugin plugin, RemoteExecutionContext ctx, FakeMundo mundo) => plugin.Execute(new Provedor(ctx, mundo));
}
```

- [ ] **Step 2: Escrever os testes do passo (falham: classes não existem)**

`packages/plugins/Cr40f.Frota.Plugin.Tests/PassoMultaTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class PassoMultaTests
{
    private const string Hoje = "2026-11-17";

    private static Entity Multa(FakeMundo mundo, int status, Action<Entity>? extra = null)
    {
        var m = new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "1A2B3C",
            ["cr40f_status"] = new OptionSetValue(status),
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
        };
        extra?.Invoke(m);
        return mundo.Add(m);
    }

    [Fact]
    public void Grava_o_passo_e_devolve_a_situacao_seguinte()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);

        var json = PassoMultaPlugin.Executar(mundo, multa.Id, Passos.AvisarMotorista, "{}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc), gravado["cr40f_datadeavisoaocondutor"]);
        Assert.Single(gravado.Attributes);
        Assert.Contains("\"pendentes\":[\"RegistrarIndicacao\"]", json);
        Assert.Contains("\"etapa\":\"indicar\"", json);
    }

    [Fact]
    public void Recusa_com_a_mensagem_do_que_fazer_e_nao_grava()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarIndicacao, "{\"canal\":\"dsv\",\"data\":\"2026-11-15\"}", Hoje));

        Assert.Equal("Avise o motorista antes de registrar a indicação.", erro.Message);
        Assert.Empty(mundo.Atualizados);
    }

    [Fact]
    public void Motorista_vira_lookup_e_avanca_para_indicar()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar);
        var motorista = Guid.NewGuid();

        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.DefinirResponsavel, $"{{\"responsavel\":\"motorista\",\"motoristaId\":\"{motorista}\"}}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(motorista, gravado.GetAttributeValue<EntityReference>("cr40f_motorista").Id);
        Assert.Equal("cr40f_funcionarios", gravado.GetAttributeValue<EntityReference>("cr40f_motorista").LogicalName);
        Assert.Equal(MultaCodigos.Motorista, gravado.GetAttributeValue<OptionSetValue>("cr40f_responsavel").Value);
        Assert.Equal(MultaCodigos.Indicar, gravado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void Motorista_que_nao_e_guid_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.DefinirResponsavel, "{\"responsavel\":\"motorista\",\"motoristaId\":\"f1\"}", Hoje));

        Assert.Equal("Motorista inválido.", erro.Message);
    }

    [Fact]
    public void Pagamento_grava_moeda_e_data()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Pagar, m =>
        {
            m["cr40f_responsavel"] = new OptionSetValue(MultaCodigos.Motorista);
            m["cr40f_vencimento"] = new DateTime(2026, 11, 20, 0, 0, 0, DateTimeKind.Utc);
        });

        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarPagamento, "{\"data\":\"2026-11-16\",\"valorPago\":175.88}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(175.88m, gravado.GetAttributeValue<Money>("cr40f_valorpago").Value);
        Assert.Equal(new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc), gravado["cr40f_pagaem"]);
        Assert.Equal(MultaCodigos.Acertar, gravado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void DadosJson_invalido_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => PassoMultaPlugin.Executar(mundo, multa.Id, Passos.AvisarMotorista, "{nao e json", Hoje));
        Assert.Equal("Dados do passo inválidos.", erro.Message);
    }

    [Fact]
    public void Plugin_le_as_entradas_e_preenche_MultaJson()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Acertar);
        var ctx = Contexto.Api(PassoMultaPlugin.Mensagem, new Dictionary<string, object>
        {
            ["MultaId"] = multa.Id, ["Passo"] = Passos.RegistrarAcerto, ["DadosJson"] = "{\"acerto\":\"empresa\",\"motivo\":\"culpa-empresa\"}",
        });

        Contexto.Rodar(new PassoMultaPlugin(), ctx, mundo);

        Assert.Contains("\"etapa\":\"encerrada\"", (string)ctx.OutputParameters["MultaJson"]);
        Assert.Equal(MultaCodigos.Encerrada, mundo.Atualizados.Single().GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void Estado_le_datas_somente_data_e_meio_dia()
    {
        var e = new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
            ["cr40f_datadeavisoaocondutor"] = MultaMapper.DataGravada("2026-11-17"),
            ["cr40f_canalindicacao"] = new OptionSetValue(MultaCodigos.Senatran),
        };
        var estado = MultaMapper.Estado(e);
        Assert.Equal("2026-11-30", estado.DataParaIndicar);
        Assert.Equal("2026-11-17", estado.DataAviso);
        Assert.Equal(MultaCodigos.Senatran, estado.Canal);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~PassoMultaTests`
Expected: FAIL na compilação ("'MultaMapper' could not be found", "'PassoMultaPlugin' could not be found").

- [ ] **Step 4: Implementar `MultaRepository.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>cr40f_multas ↔ MultaEstado. Datas de passo gravadas ao meio-dia UTC: o dia é o mesmo em São Paulo nas colunas
/// "Somente data" (novas) e "Fuso do usuário" (cr40f_datadeavisoaocondutor e cr40f_datadeindicacao, antigas).</summary>
public static class MultaMapper
{
    public const string Tabela = "cr40f_multas";

    public static readonly string[] Colunas =
    {
        "cr40f_novacoluna", "cr40f_placa", "cr40f_status", "cr40f_responsavel", "cr40f_motorista", "cr40f_motivoempresa", "cr40f_dataparaindicar",
        "cr40f_datadeavisoaocondutor", "cr40f_canalindicacao", "cr40f_datadeindicacao", "cr40f_indicado", "cr40f_aceiteem", "cr40f_vencimento",
        "cr40f_pagaem", "cr40f_valorpago", "cr40f_competenciadesconto", "cr40f_acertoem", "cr40f_encerradaem", "cr40f_canceladaem",
        "cr40f_motivocancelamento", "new_recursopendente",
    };

    /// <summary>Campo de MultaEstado (MultaEtapas.Mudancas) → coluna de cr40f_multas.</summary>
    public static readonly IReadOnlyDictionary<string, string> Coluna = new Dictionary<string, string>
    {
        ["status"] = "cr40f_status", ["responsavel"] = "cr40f_responsavel", ["motoristaId"] = "cr40f_motorista", ["motivoEmpresa"] = "cr40f_motivoempresa",
        ["dataAviso"] = "cr40f_datadeavisoaocondutor", ["canal"] = "cr40f_canalindicacao", ["dataIndicacao"] = "cr40f_datadeindicacao",
        ["indicado"] = "cr40f_indicado", ["aceiteEm"] = "cr40f_aceiteem", ["pagaEm"] = "cr40f_pagaem", ["valorPago"] = "cr40f_valorpago",
        ["competencia"] = "cr40f_competenciadesconto", ["acertoEm"] = "cr40f_acertoem", ["encerradaEm"] = "cr40f_encerradaem",
        ["canceladaEm"] = "cr40f_canceladaem", ["motivoCancelamento"] = "cr40f_motivocancelamento", ["recursoPendente"] = "new_recursopendente",
    };

    public static MultaEstado Estado(Entity e) => new()
    {
        Status = Opcao(e, "cr40f_status"),
        Responsavel = Opcao(e, "cr40f_responsavel"),
        MotoristaId = e.GetAttributeValue<EntityReference>("cr40f_motorista")?.Id.ToString(),
        MotivoEmpresa = Opcao(e, "cr40f_motivoempresa"),
        DataParaIndicar = Mapper.Dia(e, "cr40f_dataparaindicar"),
        DataAviso = Mapper.Dia(e, "cr40f_datadeavisoaocondutor"),
        Canal = Opcao(e, "cr40f_canalindicacao"),
        DataIndicacao = Mapper.Dia(e, "cr40f_datadeindicacao"),
        Indicado = e.Contains("cr40f_indicado") ? e.GetAttributeValue<bool>("cr40f_indicado") : null,
        AceiteEm = Mapper.Dia(e, "cr40f_aceiteem"),
        Vencimento = Mapper.Dia(e, "cr40f_vencimento"),
        PagaEm = Mapper.Dia(e, "cr40f_pagaem"),
        ValorPago = e.GetAttributeValue<Money>("cr40f_valorpago")?.Value,
        Competencia = Mapper.Dia(e, "cr40f_competenciadesconto"),
        AcertoEm = Mapper.Dia(e, "cr40f_acertoem"),
        EncerradaEm = Mapper.Dia(e, "cr40f_encerradaem"),
        CanceladaEm = Mapper.Dia(e, "cr40f_canceladaem"),
        MotivoCancelamento = e.GetAttributeValue<string>("cr40f_motivocancelamento"),
        RecursoPendente = e.Contains("new_recursopendente") ? e.GetAttributeValue<bool>("new_recursopendente") : null,
    };

    public static Entity Gravacao(Guid id, IEnumerable<KeyValuePair<string, object?>> mudancas)
    {
        var e = new Entity(Tabela, id);
        foreach (var m in mudancas)
        {
            e[Coluna[m.Key]] = m.Key switch
            {
                "motoristaId" => m.Value is string s && Guid.TryParse(s, out var g) ? new EntityReference("cr40f_funcionarios", g) : null,
                "valorPago" => m.Value is decimal d ? new Money(d) : null,
                "indicado" or "recursoPendente" or "motivoCancelamento" => m.Value,
                _ => m.Value switch { int i => new OptionSetValue(i), string dia => DataGravada(dia), _ => null },
            };
        }
        return e;
    }

    public static DateTime DataGravada(string dia) =>
        DateTime.SpecifyKind(DateTime.ParseExact(dia, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddHours(12), DateTimeKind.Utc);

    private static int? Opcao(Entity e, string coluna) => e.GetAttributeValue<OptionSetValue>(coluna)?.Value;
}

/// <summary>Multa aberta com o que o e-mail e a tarefa mostram.</summary>
public sealed class MultaResumo
{
    public Guid Id { get; set; }
    public string Auto { get; set; } = "";
    public string? Placa { get; set; }
    public string? Motorista { get; set; }
    public MultaEstado Estado { get; set; } = new();

    public static MultaResumo De(Entity e) => new()
    {
        Id = e.Id,
        Auto = e.GetAttributeValue<string>("cr40f_novacoluna") ?? "sem número",
        Placa = e.GetAttributeValue<EntityReference>("cr40f_placa")?.Name,
        Motorista = e.GetAttributeValue<EntityReference>("cr40f_motorista")?.Name,
        Estado = MultaMapper.Estado(e),
    };
}

public sealed class MultaRepository
{
    private readonly IOrganizationService _service;
    public MultaRepository(IOrganizationService service) => _service = service;

    /// <summary>Etapas 1 a 4, ativas (statecode 0), inclusive as antigas sem tarefa.</summary>
    public List<MultaResumo> Abertas()
    {
        var q = new QueryExpression(MultaMapper.Tabela) { ColumnSet = new ColumnSet(MultaMapper.Colunas), PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 } };
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.Criteria.AddCondition("cr40f_status", ConditionOperator.In, MultaCodigos.Identificar, MultaCodigos.Indicar, MultaCodigos.Pagar, MultaCodigos.Acertar);
        return Paginas.Todas(_service, q).Select(MultaResumo.De).ToList();
    }
}

public static class Paginas
{
    public static IEnumerable<Entity> Todas(IOrganizationService service, QueryExpression consulta)
    {
        while (true)
        {
            var pagina = service.RetrieveMultiple(consulta);
            foreach (var linha in pagina.Entities) yield return linha;
            if (!pagina.MoreRecords || consulta.PageInfo == null) yield break;
            consulta.PageInfo.PageNumber++;
            consulta.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}
```

- [ ] **Step 5: Implementar `PassoMultaPlugin.cs`**

```csharp
using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Custom API global cr40f_PassoMulta (spec §5.2). Roda como quem chama (executeprivilegename = gravar cr40f_multas): valida o passo
/// com MultaEtapas, grava só o que mudou e devolve a situação seguinte. A trava (MultaTravaPlugin) reconhece esta mensagem no ParentContext.
/// </summary>
public sealed class PassoMultaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_PassoMulta";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo passo da multa.");
            var multaId = context.InputParameters.Contains("MultaId") && context.InputParameters["MultaId"] is Guid g && g != Guid.Empty
                ? g : throw new InvalidPluginExecutionException("Informe a multa.");
            var passo = context.InputParameters.Contains("Passo") ? Convert.ToString(context.InputParameters["Passo"]) ?? "" : "";
            var dados = context.InputParameters.Contains("DadosJson") ? Convert.ToString(context.InputParameters["DadosJson"]) : null;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            context.OutputParameters["MultaJson"] = Executar(factory.CreateOrganizationService(context.UserId), multaId, passo, dados, hoje);
            tracing.Trace("{0}: {1} gravado na multa {2}", Mensagem, passo, multaId);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw new InvalidPluginExecutionException("Não foi possível gravar o passo da multa. " + error.Message, error);
        }
    }

    public static string Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje)
    {
        DadosPasso dados;
        try { dados = string.IsNullOrWhiteSpace(dadosJson) ? new DadosPasso() : Json.Ler<DadosPasso>(dadosJson!); }
        catch (Exception) { throw new InvalidPluginExecutionException("Dados do passo inválidos."); }
        var antes = MultaMapper.Estado(service.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas)));
        var erro = MultaEtapas.Validar(antes, passo, dados, hoje);
        if (erro != null) throw new InvalidPluginExecutionException(erro);
        var trocaMotorista = (passo == Passos.DefinirResponsavel && dados.Responsavel == "motorista") || !string.IsNullOrWhiteSpace(dados.MotoristaId);
        if (trocaMotorista && !Guid.TryParse(dados.MotoristaId, out _)) throw new InvalidPluginExecutionException("Motorista inválido.");
        var depois = MultaEtapas.Aplicar(antes, passo, dados, hoje);
        var mudancas = MultaEtapas.Mudancas(antes, depois);
        if (mudancas.Count > 0) service.Update(MultaMapper.Gravacao(multaId, mudancas));
        return Json.Serializar(MultaEtapas.Avaliar(depois, hoje));
    }
}
```

- [ ] **Step 6: Rodar e ver passar (com a suíte inteira do projeto)**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: PASS (inclui `ParidadeTests`, `RepositoryTests`, `ParidadeMultaTests`, `PassoMultaTests`).

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/MultaRepository.cs packages/plugins/Cr40f.Frota.Plugin/PassoMultaPlugin.cs packages/plugins/Cr40f.Frota.Plugin.Tests/FakeMundo.cs packages/plugins/Cr40f.Frota.Plugin.Tests/Contexto.cs packages/plugins/Cr40f.Frota.Plugin.Tests/PassoMultaTests.cs
git commit -m "feat(multas): Custom API cr40f_PassoMulta grava os passos validados"
```

---

### Task 5: Trava dos campos de passo (`MultaTravaPlugin`)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/Variaveis.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaTravaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTravaTests.cs`

**Interfaces:**
- Consumes: `PassoMultaPlugin.Mensagem`, `MultaCodigos` (Tasks 2 e 4), `FakeMundo`, `Contexto` (Task 4).
- Produces: `Variaveis.Ler(IOrganizationService, string schema)`; `MultaTravaPlugin.ModoVariavel = "cr40f_MultasTravaModo"`; `MultaTravaPlugin.CamposDePasso` (HashSet usado pelo registrador na Task 8: `cr40f_status, cr40f_responsavel, cr40f_motivoempresa, cr40f_canalindicacao, cr40f_datadeavisoaocondutor, cr40f_datadeindicacao, cr40f_aceiteem, cr40f_pagaem, cr40f_acertoem, cr40f_encerradaem, cr40f_canceladaem, cr40f_valorpago, cr40f_competenciadesconto, cr40f_motivocancelamento`); `static List<string> MultaTravaPlugin.Avaliar(IPluginExecutionContext, Entity alvo, IOrganizationService system)`; `static bool MultaTravaPlugin.VemDoPasso(IPluginExecutionContext)`.
- Steps (registrados na Task 8): pre-operation (20) síncrono em Create e em Update de `cr40f_multas`; o de Update filtra pelos campos de passo e tem a imagem `pre` com os mesmos campos.

- [ ] **Step 1: Escrever os testes (falham: classe não existe)**

`packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTravaTests.cs`:

```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaTravaTests
{
    private static Entity Alvo(Guid id, params (string Coluna, object Valor)[] campos)
    {
        var e = new Entity(MultaMapper.Tabela, id);
        foreach (var (c, v) in campos) e[c] = v;
        return e;
    }

    private static Entity Pre(Guid id, int status) => Alvo(id, ("cr40f_status", new OptionSetValue(status)));

    [Fact]
    public void Observar_nao_recusa_e_registra_a_origem()
    {
        var mundo = new FakeMundo();
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Contains(mundo.Traces, t => t.Contains("Recusaria") && t.Contains("cr40f_status") && t.Contains("gravação direta"));
    }

    [Fact]
    public void Travar_recusa_gravacao_direta_de_campo_de_passo()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Contains("passo a passo", erro.Message);
        Assert.Contains(mundo.Traces, t => t.StartsWith("Recusada"));
    }

    [Fact]
    public void Gravacao_vinda_da_PassoMulta_passa_mesmo_travada()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "TRAVAR");
        var id = Guid.NewGuid();
        var pai = new RemoteExecutionContext { MessageName = PassoMultaPlugin.Mensagem };
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar), pai);

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Variavel_compartilhada_nao_engana_a_trava()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));
        ctx.SharedVariables["origem"] = PassoMultaPlugin.Mensagem;

        Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));
    }

    [Fact]
    public void Campo_livre_e_mesmo_valor_passam()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var livre = Contexto.Gravacao("Update", Alvo(id, ("cr40f_vencimento", new DateTime(2026, 12, 1, 12, 0, 0, DateTimeKind.Utc)), ("cr40f_valorcomdesconto", new Money(105.53m))), Pre(id, MultaCodigos.Pagar));
        var mesmo = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Pagar));

        Contexto.Rodar(new MultaTravaPlugin(), livre, mundo);
        Contexto.Rodar(new MultaTravaPlugin(), mesmo, mundo);

        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Create_exige_o_numero_do_auto()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid()));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Equal("Informe o número do auto de infração.", erro.Message);
    }

    [Fact]
    public void Create_recusa_auto_repetido()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        mundo.Add(Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "1A2B3C")));
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid(), ("cr40f_novacoluna", " 1a2b3c ")));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Equal("Já existe multa com o auto 1a2b3c.", erro.Message);
    }

    [Fact]
    public void Create_comeca_na_etapa_1_e_aceita_o_motorista()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var alvo = Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "9Z8Y7X"), ("cr40f_status", new OptionSetValue(MultaCodigos.Indicar)), ("cr40f_motorista", new EntityReference("cr40f_funcionarios", Guid.NewGuid())));
        var ctx = Contexto.Gravacao("Create", alvo);

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Equal(MultaCodigos.Identificar, alvo.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Create_com_campo_de_passo_e_recusado_quando_travada()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "5W4V3U"), ("cr40f_responsavel", new OptionSetValue(MultaCodigos.Empresa))));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Contains("cr40f_responsavel", erro.Message);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~MultaTravaTests`
Expected: FAIL na compilação ("'MultaTravaPlugin' could not be found").

- [ ] **Step 3: Implementar `Variaveis.cs`**

```csharp
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>Variável de ambiente (não secreta): valor atual; sem ele, o padrão da definição. Igual a EnvironmentVariables do DriverRecordSharing.</summary>
public static class Variaveis
{
    public static string? Ler(IOrganizationService system, string schema)
    {
        var definicao = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 1 };
        definicao.Criteria.AddCondition("schemaname", ConditionOperator.Equal, schema);
        var achadas = system.RetrieveMultiple(definicao).Entities;
        if (achadas.Count == 0) return null;
        var valor = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
        valor.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, achadas[0].Id);
        var atual = system.RetrieveMultiple(valor).Entities;
        var texto = atual.Count > 0 ? atual[0].GetAttributeValue<string>("value") : null;
        return string.IsNullOrWhiteSpace(texto) ? achadas[0].GetAttributeValue<string>("defaultvalue") : texto;
    }
}
```

- [ ] **Step 4: Implementar `MultaTravaPlugin.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Trava das multas (spec §5.3): pre-operation síncrono em Create e Update de cr40f_multas. Campo de passo só muda vindo da
/// cr40f_PassoMulta, conferida no ParentContext (o cliente não monta o contexto pai). Modo pela variável cr40f_MultasTravaModo:
/// "travar" recusa; qualquer outro valor (padrão "observar") só escreve no trace o que recusaria e de onde veio.
/// Correção de dados por administrador: bypass nativo de lógica customizada (BypassCustomPluginExecution).
/// </summary>
public sealed class MultaTravaPlugin : IPlugin
{
    public const string ModoVariavel = "cr40f_MultasTravaModo";

    public static readonly HashSet<string> CamposDePasso = new(StringComparer.OrdinalIgnoreCase)
    {
        "cr40f_status", "cr40f_responsavel", "cr40f_motivoempresa", "cr40f_canalindicacao", "cr40f_datadeavisoaocondutor", "cr40f_datadeindicacao",
        "cr40f_aceiteem", "cr40f_pagaem", "cr40f_acertoem", "cr40f_encerradaem", "cr40f_canceladaem", "cr40f_valorpago",
        "cr40f_competenciadesconto", "cr40f_motivocancelamento",
    };

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity alvo)) return;
        var system = factory.CreateOrganizationService(null);
        var recusas = Avaliar(context, alvo, system);
        if (recusas.Count == 0) return;
        var travar = string.Equals(Variaveis.Ler(system, ModoVariavel)?.Trim(), "travar", StringComparison.OrdinalIgnoreCase);
        tracing.Trace("{0} multa {1} ({2}): {3} | origem: {4}", travar ? "Recusada" : "Recusaria", alvo.Id, context.MessageName, string.Join(" | ", recusas), Origem(context));
        if (travar) throw new InvalidPluginExecutionException(recusas[0]);
    }

    public static List<string> Avaliar(IPluginExecutionContext context, Entity alvo, IOrganizationService system)
    {
        var recusas = new List<string>();
        if (context.MessageName == "Create")
        {
            var auto = alvo.GetAttributeValue<string>("cr40f_novacoluna")?.Trim();
            if (string.IsNullOrEmpty(auto)) recusas.Add("Informe o número do auto de infração.");
            else if (AutoExiste(system, auto!)) recusas.Add($"Já existe multa com o auto {auto}.");
            var passos = alvo.Attributes.Where(a => a.Key != "cr40f_status" && CamposDePasso.Contains(a.Key) && a.Value != null).Select(a => a.Key).OrderBy(k => k, StringComparer.Ordinal).ToList();
            if (passos.Count > 0 && !VemDoPasso(context)) recusas.Add(Mensagem(passos));
            // Toda multa nova começa na etapa 1, nos dois modos (não é recusa: é o ponto de partida do passo a passo).
            alvo["cr40f_status"] = new OptionSetValue(MultaCodigos.Identificar);
            return recusas;
        }
        if (VemDoPasso(context)) return recusas;
        var pre = context.PreEntityImages.Contains("pre") ? context.PreEntityImages["pre"] : null;
        var mudou = alvo.Attributes
            .Where(a => CamposDePasso.Contains(a.Key) && !MesmoValor(a.Value, pre != null && pre.Contains(a.Key) ? pre[a.Key] : null))
            .Select(a => a.Key).OrderBy(k => k, StringComparer.Ordinal).ToList();
        if (mudou.Count > 0) recusas.Add(Mensagem(mudou));
        return recusas;
    }

    public static bool VemDoPasso(IPluginExecutionContext context)
    {
        for (var pai = context.ParentContext; pai != null; pai = pai.ParentContext)
            if (pai.MessageName == PassoMultaPlugin.Mensagem) return true;
        return false;
    }

    private static string Mensagem(IEnumerable<string> campos) =>
        $"Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos ({string.Join(", ", campos)}).";

    private static string Origem(IPluginExecutionContext context)
    {
        var cadeia = new List<string>();
        for (var pai = context.ParentContext; pai != null; pai = pai.ParentContext) cadeia.Add(pai.MessageName);
        return (cadeia.Count == 0 ? "gravação direta" : "dentro de " + string.Join(" < ", cadeia)) + $", usuário {context.InitiatingUserId}";
    }

    private static bool AutoExiste(IOrganizationService system, string auto)
    {
        var q = new QueryExpression(MultaMapper.Tabela) { ColumnSet = new ColumnSet(false), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_novacoluna", ConditionOperator.Equal, auto);
        return system.RetrieveMultiple(q).Entities.Count > 0;
    }

    private static bool MesmoValor(object? novo, object? antigo) => (novo, antigo) switch
    {
        (null, null) => true,
        (OptionSetValue a, OptionSetValue b) => a.Value == b.Value,
        (EntityReference a, EntityReference b) => a.Id == b.Id,
        (Money a, Money b) => a.Value == b.Value,
        _ => Equals(novo, antigo),
    };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~MultaTravaTests`
Expected: PASS (9 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/Variaveis.cs packages/plugins/Cr40f.Frota.Plugin/MultaTravaPlugin.cs packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTravaTests.cs
git commit -m "feat(multas): trava dos campos de passo com modo observar e travar"
```

---

### Task 6: Tarefa da multa no Planner (step assíncrono)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaTarefa.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaTarefaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTarefaTests.cs`

**Interfaces:**
- Consumes: `MultaMapper`, `MultaEtapas`, `Regras.Dias`, `Variaveis.Ler`, `FrotaPendenciasPlugin.ResolverHoje`.
- Produces:
  - `MultaTarefa(IOrganizationService system, string hoje, string? urlSistema)` com `void Sincronizar(Guid multaId, bool criacao, int? statusAnterior)`.
  - Constantes: `MultaTarefa.OrigemMulta = 100000003`, `Afazer = 100000000`, `Concluida = 100000003`, `Cancelada = 100000004`, `Media = 100000001`, `Alta = 100000002`, `Urgente = 100000003`.
  - `static int MultaTarefa.Prioridade(string? prazo, string hoje)`, `static string MultaTarefa.Codigo(Guid multaId)` → `MULTA:<id>`, `static string MultaTarefa.Link(Guid multaId)` → `#/frota-multas?registro=multa:<id>`.
  - `MultaTarefaPlugin`: post-operation assíncrono em Create e Update de `cr40f_multas`; lê a imagem `pre` (`cr40f_status`) no Update; em falha, escreve no trace e lança `InvalidPluginExecutionException` (o job assíncrono fica com falha, a multa já está gravada).
- Colunas do Planner (de `packages/deploy/flows/checklist-planner.json`): `cr40f_plannertarefa` (`cr40f_titulo`, `cr40f_descricao`, `cr40f_checklistjson`, `cr40f_status`, `cr40f_prioridade`, `cr40f_prazo`, `cr40f_origem`, `cr40f_codigoorigem`, `cr40f_multa`, `cr40f_equipeplanner`, `cr40f_cr40f_funcionarioresponsavel`), `cr40f_plannertarearesponsavel` (`cr40f_tarefa`, `cr40f_funcionario`, `cr40f_name`), `cr40f_plannertarefaequipe` (`cr40f_tarefa`, `cr40f_equipe`, `cr40f_name`), `cr40f_plannertarefaevento` (`cr40f_tarefa`, `cr40f_tipo`, `cr40f_descricao`, `cr40f_campo`, `cr40f_valoranterior`, `cr40f_valornovo`, `cr40f_ocorridoem`), `cr40f_plannerequipe` (`cr40f_nome`, `cr40f_responsavelprincipal`), `cr40f_plannerequipemembro` (`cr40f_equipe`, `cr40f_funcionario`).

- [ ] **Step 1: Escrever os testes (falham: classes não existem)**

`packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTarefaTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaTarefaTests
{
    private const string Hoje = "2026-11-17";
    private static readonly Guid Junior = Guid.NewGuid(), Outro = Guid.NewGuid();

    private static (FakeMundo Mundo, Entity Multa) Cenario(int status = MultaCodigos.Identificar)
    {
        var mundo = new FakeMundo();
        var equipe = mundo.Add(new Entity("cr40f_plannerequipe") { ["cr40f_nome"] = "Frota", ["cr40f_responsavelprincipal"] = new EntityReference("cr40f_funcionarios", Junior) });
        mundo.Add(new Entity("cr40f_plannerequipemembro") { ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", Outro) });
        mundo.Add(new Entity("cr40f_plannerequipemembro") { ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", Junior) });
        var multa = mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "1A2B3C",
            ["cr40f_placa"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()) { Name = "ABC1D23" },
            ["cr40f_status"] = new OptionSetValue(status),
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 19, 0, 0, 0, DateTimeKind.Utc),
        });
        return (mundo, multa);
    }

    private static MultaTarefa Tarefa(FakeMundo mundo) => new(mundo, Hoje, "https://exemplo.invalid/sistema/");
    private static Entity UnicaTarefa(FakeMundo mundo) => mundo.Linhas(MultaTarefa.Tarefas).Single();
    private static List<Entity> Eventos(FakeMundo mundo) => mundo.Linhas(MultaTarefa.Eventos);

    [Fact]
    public void Cria_a_tarefa_da_multa_nova_com_a_equipe_Frota()
    {
        var (mundo, multa) = Cenario();

        Tarefa(mundo).Sincronizar(multa.Id, criacao: true, statusAnterior: null);

        var t = UnicaTarefa(mundo);
        Assert.Equal("Multa 1A2B3C · ABC1D23 · Definir o responsável", t["cr40f_titulo"]);
        Assert.Equal(MultaTarefa.Codigo(multa.Id), t["cr40f_codigoorigem"]);
        Assert.Equal(MultaTarefa.OrigemMulta, t.GetAttributeValue<OptionSetValue>("cr40f_origem").Value);
        Assert.Equal(multa.Id, t.GetAttributeValue<EntityReference>("cr40f_multa").Id);
        Assert.Equal(MultaTarefa.Afazer, t.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(MultaTarefa.Urgente, t.GetAttributeValue<OptionSetValue>("cr40f_prioridade").Value);
        Assert.Equal(new DateTime(2026, 11, 19, 12, 0, 0, DateTimeKind.Utc), t["cr40f_prazo"]);
        Assert.Contains("https://exemplo.invalid/sistema/#/frota-multas?registro=multa:" + multa.Id.ToString("D"), (string)t["cr40f_descricao"]);
        Assert.Equal(Junior, t.GetAttributeValue<EntityReference>("cr40f_cr40f_funcionarioresponsavel").Id);
        Assert.Equal(new[] { Junior, Outro }, mundo.Linhas(MultaTarefa.Responsaveis).Select(r => r.GetAttributeValue<EntityReference>("cr40f_funcionario").Id));
        Assert.Single(mundo.Linhas(MultaTarefa.TarefaEquipes));
        Assert.Contains(Eventos(mundo), e => e.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value == 100000000 && (string)e["cr40f_descricao"] == "Tarefa criada.");
        var atribuicao = Eventos(mundo).Single(e => (string)e["cr40f_campo"] == "notification:assignment");
        Assert.Equal(100000003, atribuicao.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value);
        Assert.Contains(Junior.ToString(), (string)atribuicao["cr40f_valornovo"]);
        Assert.Contains("\"sourceType\":\"multa\"", (string)atribuicao["cr40f_valornovo"]);
    }

    [Fact]
    public void Nao_duplica_a_tarefa()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        Assert.Single(mundo.Linhas(MultaTarefa.Tarefas));
    }

    [Fact]
    public void Multa_antiga_sem_tarefa_nao_ganha_tarefa_no_update()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, criacao: false, statusAnterior: MultaCodigos.Identificar);
        Assert.Empty(mundo.Linhas(MultaTarefa.Tarefas));
    }

    [Fact]
    public void Sincroniza_titulo_checklist_e_registra_a_etapa_nova()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Indicar), ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Outro) { Name = "Bruno (fictício)" } });

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Identificar);

        var t = UnicaTarefa(mundo);
        Assert.Equal("Multa 1A2B3C · ABC1D23 · Avisar o motorista", t["cr40f_titulo"]);
        var checklist = Json.Ler<List<ItemChecklist>>((string)t["cr40f_checklistjson"]);
        Assert.Equal(new[] { "multa-definir-responsavel:True", "multa-avisar-motorista:False", "multa-registrar-indicacao:False", "multa-registrar-pagamento:False", "multa-registrar-acerto:False" },
            checklist.Select(i => $"{i.Id}:{i.Done}"));
        Assert.Equal("Definir o responsável", checklist[0].Title);
        var etapa = Eventos(mundo).Single(e => (string)e["cr40f_campo"] == "multa:etapa");
        Assert.Equal(100000002, etapa.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value);
        Assert.Equal("Multa: 1. Identificar o responsável → 2. Indicar no órgão.", etapa["cr40f_descricao"]);
    }

    [Fact]
    public void Fecha_quando_a_multa_encerra_e_reabre_se_concluida_com_a_multa_aberta()
    {
        var (mundo, multa) = Cenario(MultaCodigos.Acertar);
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Encerrada) });

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Acertar);
        Assert.Equal(MultaTarefa.Concluida, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Contains(Eventos(mundo), e => (string)e["cr40f_descricao"] == "Tarefa concluída: a multa foi encerrada.");

        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Recurso) });
        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Encerrada);
        Assert.Equal(MultaTarefa.Afazer, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Contains(Eventos(mundo), e => (string)e["cr40f_descricao"] == "Tarefa reaberta: a multa ainda está aberta.");
    }

    [Theory]
    [InlineData("2026-11-10", MultaTarefa.Urgente)]
    [InlineData("2026-11-20", MultaTarefa.Urgente)]
    [InlineData("2026-11-24", MultaTarefa.Alta)]
    [InlineData("2026-12-01", MultaTarefa.Media)]
    [InlineData(null, MultaTarefa.Media)]
    public void Prioridade_pelo_proximo_prazo(string? prazo, int esperada) => Assert.Equal(esperada, MultaTarefa.Prioridade(prazo, Hoje));

    [Fact]
    public void Plugin_relanca_a_falha_com_trace_para_o_job_assincrono()
    {
        var mundo = new FakeMundo();
        var ctx = Contexto.Gravacao("Create", new Entity(MultaMapper.Tabela, Guid.NewGuid()), stage: 40);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTarefaPlugin(), ctx, mundo));

        Assert.Contains("tarefa da multa", erro.Message);
        Assert.Contains(mundo.Traces, t => t.StartsWith("MultaTarefa"));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~MultaTarefaTests`
Expected: FAIL na compilação ("'MultaTarefa' could not be found").

- [ ] **Step 3: Implementar `MultaTarefa.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class ItemChecklist
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "title", Order = 2)] public string Title { get; set; } = "";
    [DataMember(Name = "done", Order = 3)] public bool Done { get; set; }
}

[DataContract]
public sealed class ContextoAtribuicao
{
    [DataMember(Name = "actorEmployeeId", Order = 1)] public string ActorEmployeeId { get; set; } = "";
    [DataMember(Name = "actorUserId", Order = 2)] public string ActorUserId { get; set; } = "";
    [DataMember(Name = "creatorEmployeeId", Order = 3)] public string CreatorEmployeeId { get; set; } = "";
    [DataMember(Name = "assigneeIds", Order = 4)] public List<string> AssigneeIds { get; set; } = new();
    [DataMember(Name = "previousAssigneeIds", Order = 5)] public List<string> PreviousAssigneeIds { get; set; } = new();
    [DataMember(Name = "sourceType", Order = 6)] public string SourceType { get; set; } = "multa";
    [DataMember(Name = "sourceCode", Order = 7)] public string SourceCode { get; set; } = "";
    [DataMember(Name = "actorName", Order = 8)] public string ActorName { get; set; } = "Multas (Sistema Betinhos)";
}

/// <summary>
/// Tarefa do Planner de cada multa nova (spec §5.4), no modelo do flow checklist-planner.json: equipe "Frota" (principal primeiro),
/// relações de responsável e equipe, eventos "Tarefa criada." e notification:assignment (o PlannerTaskEventNotificationPlugin
/// dispara o sininho). A cobrança de "vence hoje"/"atrasada" continua com a cobrança diária do Planner.
/// </summary>
public sealed class MultaTarefa
{
    public const string Tarefas = "cr40f_plannertarefa", Eventos = "cr40f_plannertarefaevento", Responsaveis = "cr40f_plannertarearesponsavel";
    public const string TarefaEquipes = "cr40f_plannertarefaequipe", Equipes = "cr40f_plannerequipe", Membros = "cr40f_plannerequipemembro";
    public const int OrigemMulta = 100000003;
    public const int Afazer = 100000000, Concluida = 100000003, Cancelada = 100000004;
    public const int Media = 100000001, Alta = 100000002, Urgente = 100000003;
    private static readonly Dictionary<int, string> ChaveStatus = new() { [100000000] = "todo", [100000001] = "doing", [100000002] = "waiting", [100000003] = "done", [100000004] = "cancelled" };

    private readonly IOrganizationService _s;
    private readonly string _hoje;
    private readonly string _url;

    public MultaTarefa(IOrganizationService system, string hoje, string? urlSistema)
    {
        _s = system;
        _hoje = hoje;
        _url = (urlSistema ?? "").Trim().TrimEnd('#');
    }

    public static string Codigo(Guid multaId) => "MULTA:" + multaId.ToString("D");
    public static string Link(Guid multaId) => "#/frota-multas?registro=multa:" + multaId.ToString("D");

    public static int Prioridade(string? prazo, string hoje)
    {
        if (prazo == null) return Media;
        var dias = Regras.Dias(hoje, prazo);
        return dias <= 3 ? Urgente : dias <= 7 ? Alta : Media;
    }

    public void Sincronizar(Guid multaId, bool criacao, int? statusAnterior)
    {
        var linha = _s.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas));
        var resumo = MultaResumo.De(linha);
        var situacao = MultaEtapas.Avaliar(resumo.Estado, _hoje);
        var tarefa = Buscar(multaId);
        if (tarefa == null)
        {
            if (criacao) Criar(resumo, situacao);
            return;
        }
        Atualizar(tarefa, resumo, situacao, statusAnterior);
    }

    private Entity? Buscar(Guid multaId)
    {
        var q = new QueryExpression(Tarefas) { ColumnSet = new ColumnSet("cr40f_status"), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_codigoorigem", ConditionOperator.Equal, Codigo(multaId));
        return _s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    private void Preencher(Entity t, MultaResumo m, MultaSituacao s)
    {
        t["cr40f_titulo"] = Limitar($"Multa {m.Auto} · {m.Placa ?? "sem placa"} · {s.ProximoPasso}", 200);
        t["cr40f_descricao"] = $"Multa {m.Auto} · {m.Placa ?? "sem placa"}.\nAbrir no Sistema Betinhos: {_url}{Link(m.Id)}";
        t["cr40f_checklistjson"] = Json.Serializar(Checklist(m.Estado, s));
        t["cr40f_prioridade"] = new OptionSetValue(Prioridade(s.ProximoPrazo, _hoje));
        t["cr40f_prazo"] = s.ProximoPrazo == null ? null : MultaMapper.DataGravada(s.ProximoPrazo);
    }

    private void Criar(MultaResumo m, MultaSituacao s)
    {
        var equipe = EquipeFrota();
        var responsaveis = equipe == null ? new List<Guid>() : Ordenar(MembrosDa(equipe.Id), equipe.GetAttributeValue<EntityReference>("cr40f_responsavelprincipal")?.Id);
        var t = new Entity(Tarefas)
        {
            ["cr40f_status"] = new OptionSetValue(MultaEtapas.Aberta(s.Etapa) ? Afazer : Concluida),
            ["cr40f_origem"] = new OptionSetValue(OrigemMulta),
            ["cr40f_codigoorigem"] = Codigo(m.Id),
            ["cr40f_multa"] = new EntityReference(MultaMapper.Tabela, m.Id),
        };
        Preencher(t, m, s);
        if (equipe != null) t["cr40f_equipeplanner"] = equipe.ToEntityReference();
        if (responsaveis.Count > 0) t["cr40f_cr40f_funcionarioresponsavel"] = new EntityReference("cr40f_funcionarios", responsaveis[0]);
        var id = _s.Create(t);
        var tarefa = new EntityReference(Tarefas, id);
        foreach (var f in responsaveis)
            _s.Create(new Entity(Responsaveis) { ["cr40f_tarefa"] = tarefa, ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", f), ["cr40f_name"] = $"{id}-{f}" });
        if (equipe != null)
            _s.Create(new Entity(TarefaEquipes) { ["cr40f_tarefa"] = tarefa, ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_name"] = $"{id}-{equipe.Id}" });
        Evento(id, 100000000, "Tarefa criada.", "", "", "");
        if (responsaveis.Count > 0)
        {
            var contexto = new ContextoAtribuicao { AssigneeIds = responsaveis.Select(g => g.ToString("D")).ToList(), SourceCode = Codigo(m.Id) };
            Evento(id, 100000003, "Responsáveis atribuídos.", "notification:assignment", "", Json.Serializar(contexto));
        }
    }

    private void Atualizar(Entity tarefa, MultaResumo m, MultaSituacao s, int? statusAnterior)
    {
        var u = new Entity(Tarefas, tarefa.Id);
        Preencher(u, m, s);
        var atual = tarefa.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value ?? Afazer;
        var aberta = MultaEtapas.Aberta(s.Etapa);
        int? novo = !aberta && atual != Concluida ? Concluida : aberta && (atual == Concluida || atual == Cancelada) ? Afazer : null;
        if (novo is int n) u["cr40f_status"] = new OptionSetValue(n);
        _s.Update(u);
        if (statusAnterior is int antes && MultaEtapas.Etapa(antes) != s.Etapa)
        {
            var de = MultaEtapas.Etapa(antes);
            Evento(tarefa.Id, 100000002, $"Multa: {MultaEtapas.RotuloEtapa[de]} → {MultaEtapas.RotuloEtapa[s.Etapa]}.", "multa:etapa", de, s.Etapa);
        }
        if (novo == Concluida) Evento(tarefa.Id, 100000002, "Tarefa concluída: a multa foi encerrada.", "status", ChaveStatus[atual], "done");
        else if (novo == Afazer) Evento(tarefa.Id, 100000002, "Tarefa reaberta: a multa ainda está aberta.", "status", ChaveStatus[atual], "todo");
    }

    public static List<ItemChecklist> Checklist(MultaEstado m, MultaSituacao s)
    {
        var etapa = s.Etapa;
        var depoisDe = new Func<string, bool>(e => Ordem(etapa) > Ordem(e));
        var itens = new List<ItemChecklist> { Item(Passos.DefinirResponsavel, etapa != MultaEtapas.Identificar) };
        var empresa = MultaEtapas.ResponsavelEfetivo(m) == MultaCodigos.Empresa;
        if (!empresa)
        {
            itens.Add(Item(Passos.AvisarMotorista, m.DataAviso != null || depoisDe(MultaEtapas.Indicar)));
            itens.Add(Item(Passos.RegistrarIndicacao, (m.DataIndicacao != null && m.Canal != null) || depoisDe(MultaEtapas.Indicar)));
            if (m.Canal == MultaCodigos.Senatran) itens.Add(Item(Passos.RegistrarAceite, m.AceiteEm != null || depoisDe(MultaEtapas.Indicar)));
        }
        itens.Add(Item(Passos.RegistrarPagamento, m.PagaEm != null));
        if (!empresa) itens.Add(Item(Passos.RegistrarAcerto, m.AcertoEm != null));
        return itens;
    }

    private static int Ordem(string etapa) => etapa switch
    {
        MultaEtapas.Identificar => 1, MultaEtapas.Indicar => 2, MultaEtapas.Pagar => 3, MultaEtapas.Recurso => 3, MultaEtapas.Acertar => 4, _ => 5,
    };

    private static ItemChecklist Item(string passo, bool feito) => new()
    {
        Id = "multa-" + string.Concat(passo.Select((c, i) => char.IsUpper(c) && i > 0 ? "-" + char.ToLowerInvariant(c) : char.ToLowerInvariant(c).ToString())),
        Title = MultaEtapas.RotuloPasso[passo],
        Done = feito,
    };

    private Entity? EquipeFrota()
    {
        var q = new QueryExpression(Equipes) { ColumnSet = new ColumnSet("cr40f_responsavelprincipal"), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_nome", ConditionOperator.Equal, "Frota");
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.AddOrder("createdon", OrderType.Ascending);
        return _s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    private List<Guid> MembrosDa(Guid equipeId)
    {
        var q = new QueryExpression(Membros) { ColumnSet = new ColumnSet("cr40f_funcionario") };
        q.Criteria.AddCondition("cr40f_equipe", ConditionOperator.Equal, equipeId);
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.Criteria.AddCondition("cr40f_funcionario", ConditionOperator.NotNull);
        return _s.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<EntityReference>("cr40f_funcionario").Id).Distinct().ToList();
    }

    private static List<Guid> Ordenar(List<Guid> membros, Guid? principal) =>
        principal is Guid p && membros.Contains(p) ? new[] { p }.Concat(membros.Where(m => m != p)).ToList() : membros;

    private void Evento(Guid tarefaId, int tipo, string descricao, string campo, string anterior, string novo) =>
        _s.Create(new Entity(Eventos)
        {
            ["cr40f_tarefa"] = new EntityReference(Tarefas, tarefaId), ["cr40f_tipo"] = new OptionSetValue(tipo), ["cr40f_descricao"] = descricao,
            ["cr40f_campo"] = campo, ["cr40f_valoranterior"] = anterior, ["cr40f_valornovo"] = novo, ["cr40f_ocorridoem"] = DateTime.UtcNow,
        });

    private static string Limitar(string texto, int max) => texto.Length <= max ? texto : texto.Substring(0, max);
}
```

- [ ] **Step 4: Implementar `MultaTarefaPlugin.cs`**

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Post-operation ASSÍNCRONO em Create e Update de cr40f_multas (decisão do plano, spec §11): a multa já está gravada quando roda,
/// então uma falha do Planner nunca a bloqueia. A falha vai para o trace e o job fica com erro em "Trabalhos do sistema";
/// o próximo Update da multa tenta de novo. Grava com o serviço do sistema.
/// </summary>
public sealed class MultaTarefaPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var system = factory.CreateOrganizationService(null);
        try
        {
            var pre = context.PreEntityImages.Contains("pre") ? context.PreEntityImages["pre"] : null;
            var anterior = pre?.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            new MultaTarefa(system, hoje, Variaveis.Ler(system, "new_URLSistemaBetinhos")).Sincronizar(context.PrimaryEntityId, context.MessageName == "Create", anterior);
        }
        catch (Exception error)
        {
            tracing.Trace("MultaTarefa {0} {1}: {2}", context.MessageName, context.PrimaryEntityId, error);
            throw new InvalidPluginExecutionException("Não foi possível sincronizar a tarefa da multa no Planner. " + error.Message, error);
        }
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~MultaTarefaTests`
Expected: PASS (11 casos, contando os 5 da Theory).

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/MultaTarefa.cs packages/plugins/Cr40f.Frota.Plugin/MultaTarefaPlugin.cs packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTarefaTests.cs
git commit -m "feat(multas): tarefa da multa no Planner criada e sincronizada por step assíncrono"
```

---

### Task 7: Custom API `cr40f_MultasDoDia` (seções do e-mail)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultasDoDia.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultasDoDiaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/MultasDoDiaTests.cs`

**Interfaces:**
- Consumes: `MultaRepository.Abertas`, `MultaResumo`, `MultaEtapas`, `Regras.Dias`, `FrotaPendenciasPlugin.ResolverHoje`.
- Produces: `MultasDoDiaResultado { Hoje, Total, PrazoVencido, Indicar, Aceite, Pagar, AguardandoAcerto }` com JSON `{"hoje","total","prazoVencido":[…],"indicar":[…],"aceite":[…],"pagar":[…],"aguardandoAcerto":n}`; cada linha `{"id","auto","placa","responsavel","prazo","passo"}`; `static MultasDoDiaResultado MultasDoDia.Montar(IEnumerable<MultaResumo>, string hoje)`; `MultasDoDiaPlugin.Mensagem = "cr40f_MultasDoDia"`, entrada `Hoje` (DateTime, opcional), saída `MultasJson`; `static string MultasDoDiaPlugin.Gerar(IOrganizationService, string hoje)`.

- [ ] **Step 1: Escrever os testes (falham)**

`packages/plugins/Cr40f.Frota.Plugin.Tests/MultasDoDiaTests.cs`:

```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultasDoDiaTests
{
    private const string Hoje = "2026-11-17";

    private static MultaResumo M(string auto, MultaEstado estado, string? motorista = "Ana (fictício)") =>
        new() { Id = Guid.NewGuid(), Auto = auto, Placa = "ABC1D23", Motorista = motorista, Estado = estado };

    [Fact]
    public void Monta_as_secoes_na_ordem_do_email()
    {
        var multas = new[]
        {
            M("A1", new MultaEstado { Status = MultaCodigos.Indicar, DataParaIndicar = "2026-11-10" }),
            M("A2", new MultaEstado { Status = MultaCodigos.Identificar, DataParaIndicar = "2026-11-21" }),
            M("A3", new MultaEstado { Status = MultaCodigos.Identificar, DataParaIndicar = "2026-12-20" }),
            M("A4", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-14", Canal = MultaCodigos.Senatran, DataParaIndicar = "2026-11-20" }),
            M("A5", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-16", Canal = MultaCodigos.Senatran, DataParaIndicar = "2026-12-20" }),
            M("A6", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-22", Responsavel = MultaCodigos.Empresa }),
            M("A7", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-23" }),
            M("A8", new MultaEstado { Status = MultaCodigos.Pagar }),
            M("A9", new MultaEstado { Status = MultaCodigos.Acertar }),
            M("A10", new MultaEstado { Status = MultaCodigos.Acertar }),
        };

        var r = MultasDoDia.Montar(multas, Hoje);

        Assert.Equal(new[] { "A1" }, r.PrazoVencido.Select(l => l.Auto));
        Assert.Equal(new[] { "A2" }, r.Indicar.Select(l => l.Auto));
        Assert.Equal("Definir o responsável", r.Indicar[0].Passo);
        Assert.Equal(new[] { "A4" }, r.Aceite.Select(l => l.Auto));
        Assert.Equal(new[] { "A6" }, r.Pagar.Select(l => l.Auto));
        Assert.Equal("Empresa", r.Pagar[0].Responsavel);
        Assert.Equal(2, r.AguardandoAcerto);
        Assert.Equal(6, r.Total);
    }

    [Fact]
    public void Plugin_le_as_abertas_inclusive_antigas_sem_tarefa()
    {
        var mundo = new FakeMundo();
        mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid()) { ["cr40f_novacoluna"] = "B1", ["cr40f_status"] = new OptionSetValue(MultaCodigos.Acertar) });
        mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid()) { ["cr40f_novacoluna"] = "B2", ["cr40f_status"] = new OptionSetValue(MultaCodigos.Encerrada) });

        var json = MultasDoDiaPlugin.Gerar(mundo, Hoje);

        Assert.Contains("\"aguardandoAcerto\":1", json);
        Assert.Contains("\"total\":1", json);
        Assert.Contains("\"hoje\":\"2026-11-17\"", json);
    }

    [Fact]
    public void Sem_itens_total_zero()
    {
        Assert.Equal(0, MultasDoDia.Montar(Array.Empty<MultaResumo>(), Hoje).Total);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~MultasDoDiaTests`
Expected: FAIL na compilação ("'MultasDoDia' could not be found").

- [ ] **Step 3: Implementar `MultasDoDia.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class LinhaMultaDia
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "auto", Order = 2)] public string Auto { get; set; } = "";
    [DataMember(Name = "placa", Order = 3)] public string? Placa { get; set; }
    [DataMember(Name = "responsavel", Order = 4)] public string Responsavel { get; set; } = "";
    [DataMember(Name = "prazo", Order = 5)] public string? Prazo { get; set; }
    [DataMember(Name = "passo", Order = 6)] public string Passo { get; set; } = "";
}

[DataContract]
public sealed class MultasDoDiaResultado
{
    [DataMember(Name = "hoje", Order = 1)] public string Hoje { get; set; } = "";
    [DataMember(Name = "total", Order = 2)] public int Total { get; set; }
    [DataMember(Name = "prazoVencido", Order = 3)] public List<LinhaMultaDia> PrazoVencido { get; set; } = new();
    [DataMember(Name = "indicar", Order = 4)] public List<LinhaMultaDia> Indicar { get; set; } = new();
    [DataMember(Name = "aceite", Order = 5)] public List<LinhaMultaDia> Aceite { get; set; } = new();
    [DataMember(Name = "pagar", Order = 6)] public List<LinhaMultaDia> Pagar { get; set; } = new();
    [DataMember(Name = "aguardandoAcerto", Order = 7)] public int AguardandoAcerto { get; set; }
}

/// <summary>Seções do e-mail "Multas de hoje" (spec §6), com as regras de MultaEtapas. Cada multa entra numa seção só.</summary>
public static class MultasDoDia
{
    public static MultasDoDiaResultado Montar(IEnumerable<MultaResumo> multas, string hoje)
    {
        var r = new MultasDoDiaResultado { Hoje = hoje };
        foreach (var m in multas)
        {
            var e = m.Estado;
            var s = MultaEtapas.Avaliar(e, hoje);
            if (s.PrazoVencido) r.PrazoVencido.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Indicar && e.Canal == MultaCodigos.Senatran && e.AceiteEm == null && e.DataIndicacao != null && Regras.Dias(e.DataIndicacao, hoje) >= 2)
                r.Aceite.Add(Linha(m, s));
            else if ((s.Etapa == MultaEtapas.Identificar || s.Etapa == MultaEtapas.Indicar) && e.DataParaIndicar != null && Regras.Dias(hoje, e.DataParaIndicar) <= 7)
                r.Indicar.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Pagar && e.Vencimento != null && Regras.Dias(hoje, e.Vencimento) is var d && d >= 0 && d <= 5)
                r.Pagar.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Acertar) r.AguardandoAcerto++;
        }
        foreach (var lista in new[] { r.PrazoVencido, r.Indicar, r.Aceite, r.Pagar })
            lista.Sort((a, b) => string.CompareOrdinal(a.Prazo ?? "9999", b.Prazo ?? "9999") is var c && c != 0 ? c : string.CompareOrdinal(a.Auto, b.Auto));
        r.Total = r.PrazoVencido.Count + r.Indicar.Count + r.Aceite.Count + r.Pagar.Count + r.AguardandoAcerto;
        return r;
    }

    private static LinhaMultaDia Linha(MultaResumo m, MultaSituacao s) => new()
    {
        Id = m.Id.ToString("D"),
        Auto = m.Auto,
        Placa = m.Placa,
        Responsavel = MultaEtapas.ResponsavelEfetivo(m.Estado) == MultaCodigos.Empresa ? "Empresa" : m.Motorista ?? "Sem responsável",
        Prazo = s.ProximoPrazo,
        Passo = s.ProximoPasso,
    };
}
```

- [ ] **Step 4: Implementar `MultasDoDiaPlugin.cs`**

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>Custom API global cr40f_MultasDoDia (spec §5.5): só leitura, no contexto de quem chama (flow "Multas | Multas de hoje").
/// Cobre todas as multas abertas, inclusive as antigas que não têm tarefa.</summary>
public sealed class MultasDoDiaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_MultasDoDia";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelas multas do dia.");
            var entrada = context.InputParameters.Contains("Hoje") ? context.InputParameters["Hoje"] : null;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(entrada, DateTime.UtcNow);
            context.OutputParameters["MultasJson"] = Gerar(factory.CreateOrganizationService(context.UserId), hoje);
            tracing.Trace("{0}: multas de {1} geradas", Mensagem, hoje);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível montar as multas do dia. " + error.Message, error);
        }
    }

    public static string Gerar(IOrganizationService service, string hoje) => Json.Serializar(MultasDoDia.Montar(new MultaRepository(service).Abertas(), hoje));
}
```

- [ ] **Step 5: Rodar e ver passar (suíte inteira)**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/MultasDoDia.cs packages/plugins/Cr40f.Frota.Plugin/MultasDoDiaPlugin.cs packages/plugins/Cr40f.Frota.Plugin.Tests/MultasDoDiaTests.cs
git commit -m "feat(multas): Custom API cr40f_MultasDoDia com as seções do e-mail diário"
```

---

### Task 8: Registrador da frota (tipos, Custom APIs e steps)

**Files:**
- Modify: `packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs` (arquivo inteiro)

**Interfaces:**
- Consumes: nomes de tipo `Cr40f.Frota.Plugin.{FrotaPendenciasPlugin, PassoMultaPlugin, MultasDoDiaPlugin, MultaTravaPlugin, MultaTarefaPlugin}`; `MultaTravaPlugin.CamposDePasso` (copiado como texto no `const`).
- Produces (DEV, pelo Deploy via `push-frota-plugin.ps1`, sem mudança no script): Custom APIs `cr40f_FrotaPendencias`, `cr40f_PassoMulta` (`executeprivilegename` = `prvWritecr40f_Multas`, nome exato lido do Dataverse), `cr40f_MultasDoDia`; steps "Cr40f.Frota: trava da multa (Create|Update)" (stage 20, síncrono; o de Update com filtro e imagem `pre`) e "Cr40f.Frota: tarefa da multa no Planner (Create|Update)" (stage 40, assíncrono, `asyncautodelete`; o de Update com imagem `pre` de `cr40f_status`). Verificação: `--testar-multas [yyyy-MM-dd]`.

- [ ] **Step 1: Reescrever `Program.cs`**

```csharp
using System.Globalization;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o assembly Cr40f.Frota.Plugin: Custom APIs globais cr40f_FrotaPendencias, cr40f_PassoMulta e cr40f_MultasDoDia,
// a trava das multas (pre-operation síncrona em Create e Update de cr40f_multas) e a tarefa no Planner (post-operation assíncrona).
// Verificação: --testar [yyyy-MM-dd] imprime o PendenciasJson; --testar-multas [yyyy-MM-dd] imprime o MultasJson.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var testarPendencias = options.Has("testar");
var testarMultas = options.Has("testar-multas");
var dllPath = testarPendencias || testarMultas ? "" : options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const int PluginAssemblyComponentType = 91;
const int StepComponentType = 92;
const int TipoDateTime = 1, TipoString = 10, TipoGuid = 12;
const string Multas = "cr40f_multas";
// Igual a MultaTravaPlugin.CamposDePasso: filtro do step de Update da trava e colunas da imagem "pre".
const string CamposDePasso = "cr40f_status,cr40f_responsavel,cr40f_motivoempresa,cr40f_canalindicacao,cr40f_datadeavisoaocondutor,cr40f_datadeindicacao,cr40f_aceiteem,cr40f_pagaem,cr40f_acertoem,cr40f_encerradaem,cr40f_canceladaem,cr40f_valorpago,cr40f_competenciadesconto,cr40f_motivocancelamento";
// O que muda título, prazo, prioridade ou checklist da tarefa (MultaTarefa).
const string CamposDaTarefa = CamposDePasso + ",cr40f_novacoluna,cr40f_placa,cr40f_motorista,cr40f_dataparaindicar,cr40f_vencimento";

var apis = new[]
{
    new Api("Cr40f.Frota.Plugin.FrotaPendenciasPlugin", "cr40f_FrotaPendencias", "Frota | Pendências",
        "Calcula as pendências proativas da frota (preventiva, reincidência, prioridade parada, custo, hodômetro). Somente leitura.", null,
        new[] { new Param("Hoje", TipoDateTime, "Data de referência. Ausente: data atual em Brasília.", true) },
        new[] { new Param("PendenciasJson", TipoString, "{hoje, total, pendencias:[{tipo,id,veiculoId,placa,titulo,detalhe,manutencaoId}]}") }),
    new Api("Cr40f.Frota.Plugin.PassoMultaPlugin", "cr40f_PassoMulta", "Multas | Passo",
        "Valida e grava um passo da multa (MultaEtapas). Roda como quem chama; a recusa diz o que fazer.", "prvWritecr40f_multas",
        new[]
        {
            new Param("MultaId", TipoGuid, "Id da multa (cr40f_multas)."),
            new Param("Passo", TipoString, "DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer ou ResultadoRecurso."),
            new Param("DadosJson", TipoString, "Dados do passo (JSON, ver DadosPasso).", true),
        },
        new[] { new Param("MultaJson", TipoString, "{etapa, pendentes, proximoPasso, proximoPrazo, prazoVencido, aguardandoPenalidade} depois do passo.") }),
    new Api("Cr40f.Frota.Plugin.MultasDoDiaPlugin", "cr40f_MultasDoDia", "Multas | Multas de hoje",
        "Seções do e-mail diário de multas (prazo vencido, indicar em 7 dias, aceite pendente, pagar com 40%, aguardando acerto). Somente leitura.", null,
        new[] { new Param("Hoje", TipoDateTime, "Data de referência. Ausente: data atual em Brasília.", true) },
        new[] { new Param("MultasJson", TipoString, "{hoje, total, prazoVencido, indicar, aceite, pagar, aguardandoAcerto}") }),
};

var steps = new[]
{
    new Step("Cr40f.Frota.Plugin.MultaTravaPlugin", "Cr40f.Frota: trava da multa (Create)", "Create", 20, 0, null, null),
    new Step("Cr40f.Frota.Plugin.MultaTravaPlugin", "Cr40f.Frota: trava da multa (Update)", "Update", 20, 0, CamposDePasso, CamposDePasso),
    new Step("Cr40f.Frota.Plugin.MultaTarefaPlugin", "Cr40f.Frota: tarefa da multa no Planner (Create)", "Create", 40, 1, null, null),
    new Step("Cr40f.Frota.Plugin.MultaTarefaPlugin", "Cr40f.Frota: tarefa da multa no Planner (Update)", "Update", 40, 1, CamposDaTarefa, "cr40f_status"),
};

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "frota.msalcache.bin");
// No CI (workflow Deploy) entra a conta de servico do environment dev; local, o login interativo de sempre.
var dvClientSecret = Environment.GetEnvironmentVariable("DV_CLIENT_SECRET");
var connectionString = string.IsNullOrEmpty(dvClientSecret)
    ? $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto"
    : $"AuthType=ClientSecret;Url={environmentUrl.TrimEnd('/')};ClientId={Environment.GetEnvironmentVariable("DV_CLIENT_ID")};ClientSecret={dvClientSecret}";

// A descricao do assembly guarda o commit publicado pelo workflow Deploy; o publicar.yml compara com o commit levado ao PROD.
// Publicacao local grava vazio, e a trava do PROD recusa ate o Deploy da develop publicar de novo.
static string CommitPublicado() =>
    Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" ? Environment.GetEnvironmentVariable("GITHUB_SHA") ?? "" : "";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

if (testarPendencias || testarMultas)
{
    var (api, saida, valor) = testarMultas ? ("cr40f_MultasDoDia", "MultasJson", options.Optional("testar-multas")) : ("cr40f_FrotaPendencias", "PendenciasJson", options.Optional("testar"));
    var request = new OrganizationRequest(api);
    if (valor is not null) request["Hoje"] = DateTime.SpecifyKind(DateTime.ParseExact(valor, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Utc);
    Console.WriteLine(service.Execute(request)[saida]);
    return;
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
foreach (var api in apis)
{
    var privilegio = api.Privilegio is null ? null : NomePrivilegio(service, api.Privilegio);
    EnsureCustomApi(service, api, UpsertPluginType(service, assemblyId, api.TypeName), privilegio, solutionUniqueName);
}
foreach (var step in steps) EnsureStep(service, UpsertPluginType(service, assemblyId, step.TypeName), step, solutionUniqueName);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin da frota registrado (pendencias e multas)");

static void Log(string message) => Console.WriteLine($"[frota:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

// O privilégio nasce com a tabela; o nome exato (cr40f_Multas) vem do Dataverse, que compara sem diferenciar maiúsculas.
static string NomePrivilegio(ServiceClient service, string nome)
{
    var query = new QueryExpression("privilege") { ColumnSet = new ColumnSet("name"), TopCount = 2 };
    query.Criteria.AddCondition("name", ConditionOperator.Equal, nome);
    var rows = service.RetrieveMultiple(query).Entities;
    if (rows.Count != 1) throw new InvalidOperationException($"Privilegio {nome} nao encontrado.");
    return rows[0].GetAttributeValue<string>("name");
}

static Guid UpsertAssembly(ServiceClient service, AssemblyInfo info, string content)
{
    var existing = FindSingleOrNone(service, "pluginassembly", ("name", info.Name));
    if (existing is not null)
    {
        Log($"atualizando assembly {info.Name}");
        service.Update(new Entity("pluginassembly", existing.Id) { ["description"] = CommitPublicado(), ["content"] = content, ["version"] = info.Version });
        return existing.Id;
    }
    Log($"criando assembly {info.Name}");
    return service.Create(new Entity("pluginassembly")
    {
        ["description"] = CommitPublicado(), ["name"] = info.Name, ["content"] = content, ["isolationmode"] = new OptionSetValue(2),
        ["sourcetype"] = new OptionSetValue(0), ["version"] = info.Version, ["culture"] = info.Culture, ["publickeytoken"] = info.PublicKeyToken,
    });
}

static Guid UpsertPluginType(ServiceClient service, Guid assemblyId, string typeName)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", typeName), ("pluginassemblyid", assemblyId));
    if (existing is not null) return existing.Id;
    Log($"criando tipo {typeName}");
    var shortName = typeName[(typeName.LastIndexOf('.') + 1)..];
    return service.Create(new Entity("plugintype") { ["name"] = shortName, ["friendlyname"] = shortName, ["typename"] = typeName, ["pluginassemblyid"] = Ref("pluginassembly", assemblyId) });
}

static void EnsureCustomApi(ServiceClient service, Api api, Guid pluginTypeId, string? privilegio, string solution)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", api.Nome));
    if (existing is not null)
    {
        Log($"reutilizando Custom API {api.Nome}");
        var update = new UpdateRequest { Target = new Entity("customapi", existing.Id) { ["plugintypeid"] = Ref("plugintype", pluginTypeId), ["executeprivilegename"] = privilegio } };
        update["SolutionUniqueName"] = solution;
        service.Execute(update);
        customApiId = existing.Id;
    }
    else
    {
        Log($"criando Custom API {api.Nome}");
        var create = new CreateRequest
        {
            Target = new Entity("customapi")
            {
                ["uniquename"] = api.Nome, ["name"] = api.Nome, ["displayname"] = api.Rotulo, ["description"] = api.Descricao,
                ["bindingtype"] = new OptionSetValue(0), ["isfunction"] = false, ["isprivate"] = false, ["executeprivilegename"] = privilegio,
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(0), ["plugintypeid"] = Ref("plugintype", pluginTypeId),
                ["iscustomizable"] = new BooleanManagedProperty(false),
            },
        };
        create["SolutionUniqueName"] = solution;
        customApiId = ((CreateResponse)service.Execute(create)).id;
    }

    foreach (var p in api.Entradas)
    {
        if (ChildExists(service, "customapirequestparameter", customApiId, p.Nome)) continue;
        Log($"criando parametro {api.Nome}.{p.Nome}");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = p.Nome, ["name"] = $"{api.Nome}.{p.Nome}", ["displayname"] = p.Nome,
            ["description"] = p.Descricao, ["type"] = new OptionSetValue(p.Tipo), ["isoptional"] = p.Opcional, ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
    foreach (var p in api.Saidas)
    {
        if (ChildExists(service, "customapiresponseproperty", customApiId, p.Nome)) continue;
        Log($"criando resposta {api.Nome}.{p.Nome}");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = p.Nome, ["name"] = $"{api.Nome}.{p.Nome}", ["displayname"] = p.Nome,
            ["description"] = p.Descricao, ["type"] = new OptionSetValue(p.Tipo), ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
}

/// <summary>Step idempotente por nome; assíncrono (mode 1) apaga o job que deu certo e guarda o que falhou.</summary>
static void EnsureStep(ServiceClient service, Guid pluginTypeId, Step step, string solution)
{
    var dados = new Entity("sdkmessageprocessingstep")
    {
        ["stage"] = new OptionSetValue(step.Stage), ["mode"] = new OptionSetValue(step.Mode), ["rank"] = 1, ["filteringattributes"] = step.Filtro,
        ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = step.Mode == 1,
    };
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", step.Nome)) is { } existing)
    {
        stepId = existing.Id;
        dados.Id = stepId;
        service.Update(dados);
        Log($"step reconciliado: {step.Nome}");
    }
    else
    {
        var message = FindSingleOrNone(service, "sdkmessage", ("name", step.Mensagem)) ?? throw new InvalidOperationException($"sdkmessage {step.Mensagem} nao encontrada.");
        var filtro = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid"),
            Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, Multas) } },
        }).Entities.Single();
        dados["name"] = step.Nome;
        dados["supporteddeployment"] = new OptionSetValue(0);
        dados["sdkmessageid"] = Ref("sdkmessage", message.Id);
        dados["sdkmessagefilterid"] = Ref("sdkmessagefilter", filtro.Id);
        stepId = service.Create(dados);
        Log($"step criado: {step.Nome}");
    }
    EnsureSolutionComponent(service, stepId, solution, StepComponentType);
    if (step.Imagem is null) return;
    var imagem = new Entity("sdkmessageprocessingstepimage")
    {
        ["name"] = "pre", ["entityalias"] = "pre", ["imagetype"] = new OptionSetValue(0), ["messagepropertyname"] = "Target",
        ["attributes"] = step.Imagem, ["sdkmessageprocessingstepid"] = Ref("sdkmessageprocessingstep", stepId),
    };
    if (FindSingleOrNone(service, "sdkmessageprocessingstepimage", ("sdkmessageprocessingstepid", stepId), ("entityalias", "pre")) is { } atual)
    {
        imagem.Id = atual.Id;
        service.Update(imagem);
    }
    else service.Create(imagem);
}

static bool ChildExists(ServiceClient service, string logicalName, Guid customApiId, string uniqueName)
{
    var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet(false), TopCount = 1 };
    query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, customApiId);
    query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
    return service.RetrieveMultiple(query).Entities.Count > 0;
}

static void CreateInSolution(ServiceClient service, Entity entity, string solution)
{
    var request = new CreateRequest { Target = entity };
    request["SolutionUniqueName"] = solution;
    service.Execute(request);
}

static void EnsureSolutionComponent(ServiceClient service, Guid componentId, string solution, int componentType)
{
    try
    {
        service.Execute(new OrganizationRequest("AddSolutionComponent")
        {
            ["ComponentId"] = componentId, ["ComponentType"] = componentType, ["SolutionUniqueName"] = solution, ["AddRequiredComponents"] = true,
        });
        Log($"componente {componentType} incluido na solucao {solution}");
    }
    catch (Exception error) when (error.Message.Contains("already", StringComparison.OrdinalIgnoreCase) || error.Message.Contains("ja existe", StringComparison.OrdinalIgnoreCase))
    {
        Log($"componente {componentType} ja pertence a solucao {solution}");
    }
}

static Entity? FindSingleOrNone(ServiceClient service, string logicalName, params (string Attribute, object Value)[] conditions)
{
    var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet($"{logicalName}id"), TopCount = 2 };
    foreach (var (attribute, value) in conditions) query.Criteria.AddCondition(attribute, ConditionOperator.Equal, value);
    var rows = service.RetrieveMultiple(query).Entities;
    if (rows.Count > 1) throw new InvalidOperationException($"Mais de um registro encontrado: {logicalName}.");
    return rows.SingleOrDefault();
}

internal sealed record Param(string Nome, int Tipo, string Descricao, bool Opcional = false);
internal sealed record Api(string TypeName, string Nome, string Rotulo, string Descricao, string? Privilegio, Param[] Entradas, Param[] Saidas);
internal sealed record Step(string TypeName, string Nome, string Mensagem, int Stage, int Mode, string? Filtro, string? Imagem);

internal sealed record AssemblyInfo(string Name, string Version, string Culture, string PublicKeyToken)
{
    public static AssemblyInfo Read(string dllPath)
    {
        var name = AssemblyName.GetAssemblyName(dllPath);
        var token = name.GetPublicKeyToken();
        var publicKeyToken = token is null || token.Length == 0 ? string.Empty : string.Concat(token.Select(b => b.ToString("x2")));
        return new AssemblyInfo(name.Name ?? throw new InvalidOperationException("Assembly sem nome."), name.Version?.ToString() ?? "1.0.0.0", string.IsNullOrWhiteSpace(name.CultureName) ? "neutral" : name.CultureName, publicKeyToken);
    }
}

internal sealed class Arguments
{
    private readonly Dictionary<string, string?> _values;
    private Arguments(Dictionary<string, string?> values) => _values = values;

    public static Arguments Parse(string[] args)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal)) throw new InvalidOperationException($"Argumento invalido: {key}");
            var value = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal) ? args[++index] : null;
            values[key[2..]] = value;
        }
        return new Arguments(values);
    }

    public string Require(string name) => Optional(name) ?? throw new InvalidOperationException($"Argumento obrigatorio: --{name}");
    public string? Optional(string name) => _values.TryGetValue(name, out var value) ? value : null;
    public bool Has(string name) => _values.ContainsKey(name);
}
```

- [ ] **Step 2: Conferir que `CamposDePasso` do registrador é igual ao do plugin**

Acrescente em `packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTravaTests.cs` (dentro da classe):

```csharp
    [Fact]
    public void Registrador_filtra_pelos_mesmos_campos_de_passo()
    {
        var fonte = System.IO.File.ReadAllText(FixtureParidade.Caminho("..", "..", "..", "..", "tools", "Cr40f.Frota.Registrar", "Program.cs"));
        var linha = fonte.Split('\n').Single(l => l.StartsWith("const string CamposDePasso = "));
        var campos = linha.Split('"')[1].Split(',');
        Assert.Equal(MultaTravaPlugin.CamposDePasso.OrderBy(c => c, StringComparer.Ordinal), campos.OrderBy(c => c, StringComparer.Ordinal));
    }
```

- [ ] **Step 3: Compilar o registrador e rodar os testes**

Run (na Betinhos-Renan): `dotnet build packages/plugins/tools/Cr40f.Frota.Registrar && dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: build sem erro; PASS (inclui `Registrador_filtra_pelos_mesmos_campos_de_passo`).

- [ ] **Step 4: Commit**

```bash
git add packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs packages/plugins/Cr40f.Frota.Plugin.Tests/MultaTravaTests.cs
git commit -m "feat(multas): registrador da frota com as APIs das multas, a trava e a tarefa assíncrona"
```

---
### Task 9: Dossiê para o WhatsApp (`new_DossieMulta`)

**Files:**
- Create: `packages/plugins/Betinhos.DriverRecordSharing/DossieMultaPlugin.cs`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/DossieMultaPluginTests.cs`
- Create: `packages/plugins/scripts/register-dossiemulta-customapi.ps1`

**Interfaces:**
- Consumes: `ITermoInfleet` e `TermoInfleetGateway` (`TermoMultaCommandPlugin.cs:13-48`; na spec chamado de `EvidenciaInfleet.Coletar`), token `infleet.token` via `InfleetGraphQlGateway.ReadToken`.
- Produces: Custom API `new_DossieMulta` (unbound), entrada `new_MultaId` (Guid), saída `new_DossieJson` (string):
  `{"multa":{"id","auto","placa","dataHora","local","orgao","dataParaIndicar","infracao":{"codigo","descricao","valor"}|null},"servicos":[{"id","codigo","cliente","saida","retorno","motorista","status","noHorario"}],"infleet":{"veiculoId","janela","viagens":[{"inicio","fim","motoristaInfleet","motorista"}]}|{"erro"}}`.
  `static string DossieMultaPlugin.Montar(IOrganizationService system, Guid multaId, ITermoInfleet infleet)`; `static List<Dictionary<string, object>> DossieMultaPlugin.Servicos(IOrganizationService, Guid veiculoId, DateTime infracaoUtc)`.

- [ ] **Step 1: Conferir as colunas da agenda no DEV (só leitura)**

Run (na Betinhos-Renan, com `az login` no DEV):
```powershell
$t = az account get-access-token --resource https://org23b93544.crm2.dynamics.com/ --query accessToken -o tsv
$h = @{ Authorization = "Bearer $t"; Accept = 'application/json' }
(Invoke-RestMethod -Headers $h -Uri "https://org23b93544.crm2.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?`$select=LogicalName,AttributeType&`$filter=LogicalName eq 'cr40f_veiculo' or LogicalName eq 'cr40f_dataehorriodesada' or LogicalName eq 'cr40f_horrioprevistoderetorno' or LogicalName eq 'cr40f_cliente' or LogicalName eq 'cr40f_motorista' or LogicalName eq 'cr40f_status' or LogicalName eq 'cr40f_idnovo'").value | Format-Table
(Invoke-RestMethod -Headers $h -Uri "https://org23b93544.crm2.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes?`$select=LogicalName&`$filter=LogicalName eq 'new_infleetdriverid'").value.Count
```
Expected: 7 linhas (Lookup, DateTime, DateTime, Lookup, Lookup, Picklist, String) e `1`. **Se faltar alguma coluna da agenda:** troque o corpo de `Servicos` por `return new List<Dictionary<string, object>>();` e registre no PR "dossiê sem serviço: coluna X ausente"; o resto da task segue igual.

- [ ] **Step 2: Escrever os testes (falham: classe não existe)**

`packages/plugins/Betinhos.DriverRecordSharing.Tests/DossieMultaPluginTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class DossieMultaPluginTests
    {
        private static readonly DateTime Infracao = new DateTime(2026, 11, 10, 16, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void JuntaNotificacaoServicoNoHorarioEViagensComMotorista()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(-1), Infracao.AddHours(2), "S-100", "Cliente Alfa (fictício)", "Concluído");
            s.Reserva(Infracao.AddHours(-20), Infracao.AddHours(-18), "S-099", "Cliente Beta (fictício)", "Concluído");

            var d = Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s));

            var multa = (Dictionary<string, object>)d["multa"];
            Assert.Equal("1A2B3C", multa["auto"]);
            Assert.Equal("ABC1D23", multa["placa"]);
            Assert.Equal("2026-11-10T16:00:00Z", multa["dataHora"]);
            Assert.Equal("2026-11-30", multa["dataParaIndicar"]);
            Assert.Equal("605-03", ((Dictionary<string, object>)multa["infracao"])["codigo"]);
            var servico = (Dictionary<string, object>)((object[])d["servicos"]).Single();
            Assert.Equal("S-100", servico["codigo"]);
            Assert.Equal("Cliente Alfa (fictício)", servico["cliente"]);
            Assert.Equal(true, servico["noHorario"]);
            var viagem = (Dictionary<string, object>)((object[])((Dictionary<string, object>)d["infleet"])["viagens"]).Single();
            Assert.Equal("Ana", viagem["motorista"]);
        }

        [Fact]
        public void SemServicoNoHorarioMostraOMaisProximo()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(3), null, "S-200", "Cliente Gama (fictício)", "Programado");

            var servico = (Dictionary<string, object>)((object[])Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s))["servicos"]).Single();

            Assert.Equal("S-200", servico["codigo"]);
            Assert.Equal(false, servico["noHorario"]);
        }

        [Fact]
        public void InfleetForaDoArViraErroEODossieSai()
        {
            var s = Cenario();
            s.InfleetFalha = true;

            var d = Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s));

            Assert.Equal("Infleet fora do ar.", ((Dictionary<string, object>)d["infleet"])["erro"]);
            Assert.Empty((object[])d["servicos"]);
        }

        [Fact]
        public void PluginDevolveODossieNaSaida()
        {
            var s = Cenario();
            var ctx = new RemoteExecutionContext { MessageName = DossieMultaPlugin.MessageName, InitiatingUserId = Guid.NewGuid(), UserId = Guid.NewGuid(), Depth = 1 };
            ctx.InputParameters["new_MultaId"] = s.Multa.Id;

            new DossieMultaPlugin((system, tracing) => s).Execute(new Provider(ctx, s));

            Assert.Contains("\"auto\":\"1A2B3C\"", (string)ctx.OutputParameters["new_DossieJson"]);
        }

        private static Dictionary<string, object> Ler(string json) => (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(json);

        private static Mundo Cenario()
        {
            var s = new Mundo();
            s.Veiculo = s.Add(new Entity("cr40f_veiculos") { ["cr40f_placa"] = "ABC1D23" });
            var infracao = s.Add(new Entity("cr40f_infracaodetransito") { ["cr40f_codigodainfracao"] = "605-03", ["cr40f_descricaodainfracao"] = "Avançar sinal vermelho", ["cr40f_valordamulta"] = new Money(293.47m) });
            s.Add(new Entity("cr40f_funcionarios") { ["new_infleetdriverid"] = "drv-1", ["new_apelido"] = "Ana", ["cr40f_nomecompleto"] = "Ana Souza (fictício)" });
            s.Multa = s.Add(new Entity("cr40f_multas")
            {
                ["cr40f_novacoluna"] = "1A2B3C", ["cr40f_dataehorario"] = Infracao, ["cr40f_localdainfracao"] = "Av. de Teste, 100",
                ["cr40f_placa"] = s.Veiculo.ToEntityReference(), ["cr40f_codigodainfracao"] = infracao.ToEntityReference(),
                ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
            });
            return s;
        }

        private sealed class Provider : IServiceProvider, IOrganizationServiceFactory, ITracingService
        {
            private readonly IPluginExecutionContext ctx; private readonly Mundo mundo;
            public Provider(IPluginExecutionContext ctx, Mundo mundo) { this.ctx = ctx; this.mundo = mundo; }
            public object GetService(Type type) => type == typeof(IPluginExecutionContext) ? (object)ctx : type == typeof(IOrganizationServiceFactory) || type == typeof(ITracingService) ? this : null;
            public IOrganizationService CreateOrganizationService(Guid? userId) => mundo;
            public void Trace(string format, params object[] args) { }
        }

        private sealed class Mundo : IOrganizationService, ITermoInfleet
        {
            private readonly Dictionary<string, List<Entity>> tabelas = new Dictionary<string, List<Entity>>();
            public Entity Veiculo, Multa;
            public bool InfleetFalha;

            public Entity Add(Entity e)
            {
                if (e.Id == Guid.Empty) e.Id = Guid.NewGuid();
                if (!tabelas.TryGetValue(e.LogicalName, out var lista)) tabelas[e.LogicalName] = lista = new List<Entity>();
                lista.Add(e);
                return e;
            }

            public void Reserva(DateTime saida, DateTime? retorno, string codigo, string cliente, string status)
            {
                var r = Add(new Entity("cr40f_reservadeveculos")
                {
                    ["cr40f_veiculo"] = Veiculo.ToEntityReference(), ["cr40f_dataehorriodesada"] = saida, ["cr40f_horrioprevistoderetorno"] = retorno,
                    ["cr40f_idnovo"] = codigo, ["cr40f_cliente"] = new EntityReference("cr40f_clientes1", Guid.NewGuid()) { Name = cliente },
                    ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()) { Name = "Ana Souza (fictício)" }, ["cr40f_status"] = new OptionSetValue(202410008),
                });
                r.FormattedValues["cr40f_status"] = status;
            }

            public Dictionary<string, object> Coletar(string placa, DateTime infracaoUtc)
            {
                if (InfleetFalha) throw new InfleetUnavailableException("Infleet fora do ar.");
                return new Dictionary<string, object>
                {
                    ["veiculoId"] = "vf-1",
                    ["viagens"] = new[] { new Dictionary<string, object> { ["inicio"] = "2026-11-10T15:40:00Z", ["fim"] = "2026-11-10T16:20:00Z", ["motoristaInfleet"] = "drv-1" } },
                };
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => tabelas[entityName].Single(e => e.Id == id);

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var q = (QueryExpression)query;
                IEnumerable<Entity> linhas = tabelas.TryGetValue(q.EntityName, out var lista) ? lista : new List<Entity>();
                foreach (var c in q.Criteria.Conditions) linhas = linhas.Where(e => Casa(e, c)).ToList();
                return new EntityCollection(linhas.ToList());
            }

            private static bool Casa(Entity e, ConditionExpression c)
            {
                object valor = e.Contains(c.AttributeName) ? e[c.AttributeName] : null;
                if (valor is EntityReference r) valor = r.Id;
                if (c.AttributeName == "statecode" && valor == null) valor = 0;
                switch (c.Operator)
                {
                    case ConditionOperator.Equal: return Equals(valor, c.Values[0]);
                    case ConditionOperator.In: return c.Values.Contains(valor);
                    case ConditionOperator.GreaterEqual: return valor is DateTime a && a >= (DateTime)c.Values[0];
                    case ConditionOperator.LessEqual: return valor is DateTime b && b <= (DateTime)c.Values[0];
                    default: throw new NotSupportedException(c.Operator.ToString());
                }
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter FullyQualifiedName~DossieMultaPluginTests`
Expected: FAIL na compilação ("The type or namespace name 'DossieMultaPlugin' could not be found").

- [ ] **Step 4: Implementar `DossieMultaPlugin.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_DossieMulta (unbound, só leitura; spec §5.6): o que o gestor manda ao motorista no WhatsApp.
    // Entrada new_MultaId (Guid); saída new_DossieJson: dados da notificação, serviços da agenda (cr40f_reservadeveculos) daquela
    // placa no horário da infração e viagens do InFleet em ±30 min (TermoInfleetGateway, token infleet.token) com o nome do motorista.
    // Falha do InFleet vira {"erro": "..."} e o dossiê sai mesmo assim. Só quem lê a multa recebe o dossiê.
    public sealed class DossieMultaPlugin : IPlugin
    {
        public const string MessageName = "new_DossieMulta";
        private readonly Func<IOrganizationService, ITracingService, ITermoInfleet> infleet;

        public DossieMultaPlugin() : this((string)null, (string)null) { }

        public DossieMultaPlugin(string unsecureConfig, string secureConfig)
            : this((system, tracing) => new TermoInfleetGateway(system, secureConfig, tracing)) { }

        public DossieMultaPlugin(Func<IOrganizationService, ITracingService, ITermoInfleet> infleet)
        {
            this.infleet = infleet ?? throw new ArgumentNullException(nameof(infleet));
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            try
            {
                if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada pelo dossiê da multa.");
                if (!context.InputParameters.Contains("new_MultaId") || !(context.InputParameters["new_MultaId"] is Guid id) || id == Guid.Empty)
                    throw new InvalidPluginExecutionException("Informe a multa.");
                factory.CreateOrganizationService(context.InitiatingUserId).Retrieve("cr40f_multas", id, new ColumnSet("cr40f_multasid"));
                var system = factory.CreateOrganizationService(null);
                context.OutputParameters["new_DossieJson"] = Montar(system, id, infleet(system, tracing));
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("DossieMulta falhou: {0}", error);
                throw new InvalidPluginExecutionException("Não foi possível montar o dossiê da multa.", error);
            }
        }

        public static string Montar(IOrganizationService system, Guid multaId, ITermoInfleet infleet)
        {
            var multa = system.Retrieve("cr40f_multas", multaId, new ColumnSet("cr40f_novacoluna", "cr40f_dataehorario", "cr40f_localdainfracao", "cr40f_placa", "cr40f_codigodainfracao", "cr40f_dataparaindicar", "cr40f_nomedoorgaoautuador"));
            var placaRef = multa.GetAttributeValue<EntityReference>("cr40f_placa");
            var placa = placaRef == null ? null : system.Retrieve(placaRef.LogicalName, placaRef.Id, new ColumnSet("cr40f_placa")).GetAttributeValue<string>("cr40f_placa");
            var utc = Utc(multa, "cr40f_dataehorario");
            var infracaoRef = multa.GetAttributeValue<EntityReference>("cr40f_codigodainfracao");
            var infracao = infracaoRef == null ? null : system.Retrieve(infracaoRef.LogicalName, infracaoRef.Id, new ColumnSet("cr40f_codigodainfracao", "cr40f_descricaodainfracao", "cr40f_valordamulta"));

            Dictionary<string, object> viagens;
            if (placa == null || !utc.HasValue) viagens = new Dictionary<string, object> { ["erro"] = "Multa sem placa ou sem data e hora." };
            else
            {
                try { viagens = infleet.Coletar(placa, utc.Value); NomearMotoristas(system, viagens); }
                catch (Exception error) { viagens = new Dictionary<string, object> { ["erro"] = error.Message }; }
            }

            var dossie = new Dictionary<string, object>
            {
                ["multa"] = new Dictionary<string, object>
                {
                    ["id"] = multaId.ToString("D"),
                    ["auto"] = multa.GetAttributeValue<string>("cr40f_novacoluna"),
                    ["placa"] = placa,
                    ["dataHora"] = utc.HasValue ? Iso(utc.Value) : null,
                    ["local"] = multa.GetAttributeValue<string>("cr40f_localdainfracao"),
                    ["orgao"] = multa.GetAttributeValue<string>("cr40f_nomedoorgaoautuador"),
                    ["dataParaIndicar"] = Dia(multa, "cr40f_dataparaindicar"),
                    ["infracao"] = infracao == null ? null : new Dictionary<string, object>
                    {
                        ["codigo"] = infracao.GetAttributeValue<string>("cr40f_codigodainfracao"),
                        ["descricao"] = infracao.GetAttributeValue<string>("cr40f_descricaodainfracao"),
                        ["valor"] = infracao.GetAttributeValue<Money>("cr40f_valordamulta")?.Value,
                    },
                },
                ["servicos"] = placaRef != null && utc.HasValue ? Servicos(system, placaRef.Id, utc.Value).Cast<object>().ToArray() : new object[0],
                ["infleet"] = viagens,
            };
            return new JavaScriptSerializer { MaxJsonLength = 1000000 }.Serialize(dossie);
        }

        // Serviço que cobre o horário (saída <= infração <= retorno; sem retorno, 12 h depois da saída). Sem nenhum, os que saíram
        // até 6 h antes ou depois, marcados com noHorario = false.
        public static List<Dictionary<string, object>> Servicos(IOrganizationService system, Guid veiculoId, DateTime infracaoUtc)
        {
            var q = new QueryExpression("cr40f_reservadeveculos")
            {
                ColumnSet = new ColumnSet("cr40f_idnovo", "cr40f_id", "cr40f_dataehorriodesada", "cr40f_horrioprevistoderetorno", "cr40f_cliente", "cr40f_motorista", "cr40f_status"),
                TopCount = 50,
            };
            q.Criteria.AddCondition("cr40f_veiculo", ConditionOperator.Equal, veiculoId);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            q.Criteria.AddCondition("cr40f_dataehorriodesada", ConditionOperator.GreaterEqual, infracaoUtc.AddHours(-24));
            q.Criteria.AddCondition("cr40f_dataehorriodesada", ConditionOperator.LessEqual, infracaoUtc.AddHours(6));
            q.AddOrder("cr40f_dataehorriodesada", OrderType.Ascending);
            var linhas = system.RetrieveMultiple(q).Entities.Where(l => Utc(l, "cr40f_dataehorriodesada").HasValue).ToList();
            var durante = linhas.Where(l =>
            {
                var saida = Utc(l, "cr40f_dataehorriodesada").Value;
                var retorno = Utc(l, "cr40f_horrioprevistoderetorno") ?? saida.AddHours(12);
                return saida <= infracaoUtc && infracaoUtc <= retorno;
            }).ToList();
            var escolhidas = durante.Count > 0 ? durante : linhas.Where(l => Math.Abs((Utc(l, "cr40f_dataehorriodesada").Value - infracaoUtc).TotalHours) <= 6).ToList();
            return escolhidas.Select(l => new Dictionary<string, object>
            {
                ["id"] = l.Id.ToString("D"),
                ["codigo"] = l.GetAttributeValue<string>("cr40f_idnovo") ?? l.GetAttributeValue<string>("cr40f_id"),
                ["cliente"] = l.GetAttributeValue<EntityReference>("cr40f_cliente")?.Name,
                ["saida"] = Iso(Utc(l, "cr40f_dataehorriodesada").Value),
                ["retorno"] = Utc(l, "cr40f_horrioprevistoderetorno") is DateTime r ? Iso(r) : null,
                ["motorista"] = l.GetAttributeValue<EntityReference>("cr40f_motorista")?.Name,
                ["status"] = l.FormattedValues.Contains("cr40f_status") ? l.FormattedValues["cr40f_status"] : null,
                ["noHorario"] = durante.Count > 0,
            }).ToList();
        }

        private static void NomearMotoristas(IOrganizationService system, Dictionary<string, object> dados)
        {
            if (!dados.TryGetValue("viagens", out var valor) || !(valor is IEnumerable<object> lista)) return;
            var viagens = lista.OfType<Dictionary<string, object>>().ToList();
            var ids = viagens.Select(v => v.TryGetValue("motoristaInfleet", out var id) ? id as string : null).Where(id => !string.IsNullOrEmpty(id)).Distinct().Cast<object>().ToArray();
            if (ids.Length == 0) return;
            var q = new QueryExpression("cr40f_funcionarios") { ColumnSet = new ColumnSet("new_infleetdriverid", "new_apelido", "cr40f_nomecompleto") };
            q.Criteria.AddCondition("new_infleetdriverid", ConditionOperator.In, ids);
            var nomes = system.RetrieveMultiple(q).Entities
                .GroupBy(e => e.GetAttributeValue<string>("new_infleetdriverid"))
                .ToDictionary(g => g.Key, g => g.First().GetAttributeValue<string>("new_apelido") ?? g.First().GetAttributeValue<string>("cr40f_nomecompleto"));
            foreach (var v in viagens) v["motorista"] = v.TryGetValue("motoristaInfleet", out var id) && id is string s && nomes.TryGetValue(s, out var nome) ? nome : null;
        }

        private static DateTime? Utc(Entity e, string coluna)
        {
            var valor = e.GetAttributeValue<DateTime?>(coluna);
            if (!valor.HasValue) return null;
            return valor.Value.Kind == DateTimeKind.Local ? valor.Value.ToUniversalTime() : DateTime.SpecifyKind(valor.Value, DateTimeKind.Utc);
        }

        // Dia em São Paulo: "Somente data" (meia-noite UTC) fica como está; data e hora volta 3 h (sem horário de verão desde 2019).
        private static string Dia(Entity e, string coluna)
        {
            var utc = Utc(e, coluna);
            if (!utc.HasValue) return null;
            var dia = utc.Value.TimeOfDay == TimeSpan.Zero ? utc.Value : utc.Value.AddHours(-3);
            return dia.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        private static string Iso(DateTime d) => d.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run (na Betinhos-Renan): `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter FullyQualifiedName~DossieMultaPluginTests`
Expected: PASS (4 testes). Depois `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests` inteiro: PASS.

- [ ] **Step 6: Script de registro da Custom API (à mão, depois do Deploy)**

`packages/plugins/scripts/register-dossiemulta-customapi.ps1` (BOM UTF-8):

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV a Custom API new_DossieMulta (unbound, new_MultaId Guid -> new_DossieJson string, sem step customizado)
# apontando para o plugin type Betinhos.DriverRecordSharing.DossieMultaPlugin, e coloca API, parametro e resposta na AppBetinhos.
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); tipo de plugin e Custom API novos deste
# assembly continuam a mao, como a new_ProvaMidia. O PROD recebe pelas solucoes.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar o assembly com a classe nova.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-dossiemulta-customapi.ps1 [-Apply]

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.DossieMultaPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Api = [pscustomobject]@{ Id = "d0edc9b5-8387-4e82-9b72-67cd48ce0b54"; Name = "new_DossieMulta" }
$Request = [pscustomobject]@{ Id = "09947544-efe3-4219-a662-bcf2ed2ee2d0"; Name = "new_MultaId" }
$Response = [pscustomobject]@{ Id = "145eec65-d3aa-4804-bb09-65becb61ab80"; Name = "new_DossieJson" }

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "DossieMultaPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
}
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

$apiAtual = @(Get-Rows "customapis" "customapiid,allowedcustomprocessingsteptype,bindingtype,_plugintypeid_value" "uniquename eq '$($Api.Name)'")
if ($apiAtual.Count -eq 1 -and [string]$apiAtual[0].customapiid -ne $Api.Id) { throw "$($Api.Name) existe com id $($apiAtual[0].customapiid), diferente do fixo $($Api.Id)." }
if ($apiAtual.Count -eq 1 -and ([int]$apiAtual[0].allowedcustomprocessingsteptype -ne 0 -or [int]$apiAtual[0].bindingtype -ne 0)) { throw "$($Api.Name) existe fora do desenho (tipo de step ou binding)." }
if (-not $Apply) {
  Write-Step $(if ($apiAtual.Count -eq 1) { "DRY RUN $($Api.Name) ja existe; conferiria plugin type, parametro e resposta." } else { "DRY RUN criaria $($Api.Name) com $($Request.Name) (Guid) e $($Response.Name) (string)." })
  Write-Step "dry-run: nada gravado."
  return
}
if ($apiAtual.Count -eq 0) {
  Invoke-Dv "POST" "customapis" @{
    customapiid = $Api.Id; uniquename = $Api.Name; name = $Api.Name; displayname = "Multas | Dossi$([char]0xEA) para o WhatsApp"
    description = "Servico da agenda, viagens do InFleet e dados da notificacao da multa. Somente leitura."; bindingtype = 0; isfunction = $false; isprivate = $false
    allowedcustomprocessingsteptype = 0; workflowsdkstepenabled = $false; "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
  } | Out-Null
  Write-Step "criada $($Api.Name)"
} elseif ([string]$apiAtual[0]._plugintypeid_value -ne $typeId) {
  Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
  Write-Step "$($Api.Name) apontada para $TypeName"
}
if (@(Get-Rows "customapirequestparameters" "customapirequestparameterid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Request.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapirequestparameters" @{
    customapirequestparameterid = $Request.Id; uniquename = $Request.Name; name = "$($Api.Name).$($Request.Name)"; displayname = $Request.Name
    description = "Id da multa (cr40f_multas)"; type = 12; isoptional = $false; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criado o parametro $($Request.Name)"
}
if (@(Get-Rows "customapiresponseproperties" "customapiresponsepropertyid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Response.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapiresponseproperties" @{
    customapiresponsepropertyid = $Response.Id; uniquename = $Response.Name; name = "$($Api.Name).$($Response.Name)"; displayname = $Response.Name
    description = "Dossie JSON: multa, servicos e infleet"; type = 10; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criada a resposta $($Response.Name)"
}

$codigos = @{}
foreach ($logical in "customapi", "customapirequestparameter", "customapiresponseproperty") {
  $codigos[$logical] = [int](Invoke-Dv "GET" "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
}
Add-ComponenteNaSolucao $Api.Id $codigos["customapi"]
Add-ComponenteNaSolucao $Request.Id $codigos["customapirequestparameter"]
Add-ComponenteNaSolucao $Response.Id $codigos["customapiresponseproperty"]
Write-Step "OK: $($Api.Name) -> $TypeName"
```

Run (na Betinhos-Renan): `pwsh -NoProfile -Command '$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path packages/plugins/scripts/register-dossiemulta-customapi.ps1).Path,[ref]$null,[ref]$e); $e.Count'`
Expected: `0`. (Rodar o script com `-Apply` fica para a virada, Task 22.)

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing/DossieMultaPlugin.cs packages/plugins/Betinhos.DriverRecordSharing.Tests/DossieMultaPluginTests.cs packages/plugins/scripts/register-dossiemulta-customapi.ps1
git commit -m "feat(multas): Custom API new_DossieMulta com serviço da agenda e viagens do InFleet"
```

---

### Task 10: Rótulos da multa num lugar só (`frota/data/schema.ts`)

**Files:**
- Modify: `apps/shell/src/pages/frota/data/schema.ts` (`STATUS_OPTIONS.multa`, `TONE.multa`)
- Modify: `apps/shell/src/pages/funcionarios/data/schema.ts:25-33` (`MULTA_STATUS`)
- Modify: `apps/shell/src/pages/dashboard/domain/codes.ts:8`, `apps/shell/src/pages/dashboard/domain/abas/multas.ts:25-33`, `apps/shell/src/pages/dashboard/domain/detalhes.ts:72-77`, `apps/shell/src/pages/dashboard/components/abas/MultasTab.tsx:41`
- Test: `apps/shell/src/pages/dashboard/domain/abas/multas.test.ts:22-38`, `apps/shell/src/pages/frota/data/schema.test.ts` (novo)

**Interfaces:**
- Consumes: `MULTA` (com `CANCELADA`, Task 3).
- Produces: `STATUS_OPTIONS.multa` com os rótulos novos, na ordem das etapas; `MULTA_STATUS` de funcionários = `STATUS_OPTIONS.multa`; `MULTA_RESOLVIDA: ReadonlySet<number>` em `dashboard/domain/codes.ts`.

- [ ] **Step 1: Escrever os testes (falham)**

`apps/shell/src/pages/frota/data/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MULTA_STATUS } from '../../funcionarios/data/schema'
import { MULTA, STATUS_OPTIONS, TONE, label } from './schema'

describe('rótulos da multa', () => {
  it('são os das etapas, na ordem do passo a passo, com a opção Cancelada', () => {
    expect(STATUS_OPTIONS.multa.map((o) => o.label)).toEqual(['1. Identificar o responsável', '2. Indicar no órgão', '3. Pagar', '4. Acertar', 'Encerrada', 'Em recurso', 'Cancelada', 'Descontado (antigo)'])
    expect(label(STATUS_OPTIONS.multa, MULTA.CANCELADA)).toBe('Cancelada')
    expect(TONE.multa[MULTA.CANCELADA]).toBe('neutral')
  })

  it('funcionários usam a mesma lista', () => {
    expect(MULTA_STATUS).toBe(STATUS_OPTIONS.multa)
  })
})
```

Em `apps/shell/src/pages/dashboard/domain/abas/multas.test.ts`, troque o teste `'KPIs pela data da multa no período ...'` (linhas 22-38) por:

```ts
  it('KPIs pela data da multa no período: total, pendentes (etapa 1) e resolvidas pelo valor do status (Encerrada, Descontado e Cancelada)', () => {
    const muls = [
      multa({ status: 202410000, statusLabel: '1. Identificar o responsável' }),
      multa({ status: 202410000, statusLabel: '1. Identificar o responsável' }),
      multa({ status: 202410006, statusLabel: '4. Acertar' }),
      multa({ status: 202410003, statusLabel: 'Descontado (antigo)' }),
      multa({ status: 202410005, statusLabel: 'Encerrada' }),
      multa({ status: 202410007, statusLabel: 'Cancelada' }),
      multa({ status: 202410001, statusLabel: '3. Pagar' }),
      multa({ status: 202410002, statusLabel: 'Em recurso' }),
      multa({ statusLabel: 'Resolvida' }),
      multa({ dia: '2026-08-31', status: 202410000 }),
      multa({ dia: '', status: 202410000 }),
    ]
    // O rótulo não decide mais: "Resolvida" sem valor conta como aberta; Acertar (antigo Pago) ainda pede o acerto.
    expect(calcularMultas(ctx, dadosCom(muls)).kpis).toEqual({ total: 9, pendentes: 2, resolvidas: 3 })
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/data/schema.test.ts src/pages/dashboard/domain/abas/multas.test.ts`
Expected: FAIL (rótulos antigos; `resolvidas` 4 em vez de 3).

- [ ] **Step 3: Atualizar `frota/data/schema.ts`**

Troque o bloco `multa: [ ... ]` de `STATUS_OPTIONS` por:

```ts
  // Rótulos das etapas da fase 1 (spec §3). Os valores são os de sempre; Descontado fica só para as multas antigas.
  multa: [
    { value: MULTA.NOTIFICAR, label: '1. Identificar o responsável' },
    { value: MULTA.NOTIFICADO, label: '2. Indicar no órgão' },
    { value: MULTA.INDICADA, label: '3. Pagar' },
    { value: MULTA.PAGO, label: '4. Acertar' },
    { value: MULTA.FINALIZADO, label: 'Encerrada' },
    { value: MULTA.RECURSO, label: 'Em recurso' },
    { value: MULTA.CANCELADA, label: 'Cancelada' },
    { value: MULTA.DESCONTADO, label: 'Descontado (antigo)' },
  ],
```

e a linha `multa:` de `TONE` por:

```ts
  multa: { [MULTA.NOTIFICAR]: 'warning', [MULTA.NOTIFICADO]: 'info', [MULTA.INDICADA]: 'info', [MULTA.PAGO]: 'info', [MULTA.FINALIZADO]: 'success', [MULTA.RECURSO]: 'warning', [MULTA.CANCELADA]: 'neutral', [MULTA.DESCONTADO]: 'neutral' },
```

- [ ] **Step 4: Funcionários e Dashboard passam a importar de lá**

`apps/shell/src/pages/funcionarios/data/schema.ts`: acrescente na primeira linha `import { STATUS_OPTIONS } from '../../frota/data/schema'` e troque o bloco `export const MULTA_STATUS: Option[] = [ ... ]` por:

```ts
/** Rótulos das etapas da multa: vêm da Frota (um lugar só). */
export const MULTA_STATUS: Option[] = STATUS_OPTIONS.multa
```

`apps/shell/src/pages/dashboard/domain/codes.ts`: troque `export const MULTA_NOTIFICAR = 202410000` por:

```ts
import { MULTA } from '../../frota/data/schema'

export const MULTA_NOTIFICAR = MULTA.NOTIFICAR
/** Multa que não pede mais nada: Encerrada, Descontado (antigo) e Cancelada. Decide pelo valor, não pelo rótulo. */
export const MULTA_RESOLVIDA: ReadonlySet<number> = new Set([MULTA.FINALIZADO, MULTA.DESCONTADO, MULTA.CANCELADA])
```

(o `import` vai na primeira linha do arquivo, antes do comentário existente).

`apps/shell/src/pages/dashboard/domain/abas/multas.ts`: troque `import { int, normL } from '../format'` por `import { int } from '../format'`, acrescente `import { MULTA_RESOLVIDA } from '../codes'` e troque o comentário e a função `resolvida` (linhas 25-33) por:

```ts
/** Multa resolvida pelo valor do status (spec da fase 1 das multas, §7): Encerrada, Descontado (antigo) e Cancelada. */
const resolvida = (m: Multa) => m.status !== null && MULTA_RESOLVIDA.has(m.status)
```

`apps/shell/src/pages/dashboard/domain/detalhes.ts`: troque o comentário da linha 72 por `/** "Multas pendentes": etapa 1 (identificar o responsável), pela data da multa no período. */` e, na linha 77, `descricao: 'Multas com status Notificar o condutor, pela data da multa no período.'` por `descricao: 'Multas na etapa 1. Identificar o responsável, pela data da multa no período.'`.

`apps/shell/src/pages/dashboard/components/abas/MultasTab.tsx`, linha 41: troque `texto: 'Notificar o condutor'` por `texto: 'Identificar o responsável'`.

- [ ] **Step 5: Atualizar os testes que citam os textos antigos de exibição**

Run (na Betinhos-Renan): `grep -rn "Multas com status Notificar o condutor\|texto: 'Notificar o condutor'\|'Notificar o condutor'" apps/shell/src --include=*.test.ts --include=*.test.tsx`
Para cada ocorrência, troque o texto esperado por `'Multas na etapa 1. Identificar o responsável, pela data da multa no período.'` (descrição do detalhe) ou `'Identificar o responsável'` (apoio do KPI). Rótulos que aparecem como **dado de entrada** (`statusLabel: 'Notificar o Condutor'` em `data.test.ts`, `detalhes.test.ts`, `motoristas-manutencoes-multas.test.tsx`) ficam como estão: são o texto que o Dataverse devolvia.

- [ ] **Step 6: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/data src/pages/dashboard src/pages/funcionarios && pnpm --filter @betinhos/shell typecheck`
Expected: PASS; typecheck sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/frota/data/schema.ts apps/shell/src/pages/frota/data/schema.test.ts apps/shell/src/pages/funcionarios/data/schema.ts apps/shell/src/pages/dashboard
git commit -m "feat(multas): rótulos das etapas num lugar só e Dashboard decide resolvida pelo valor"
```

---
### Task 11: Dados da multa no shell (tipos, leitura, fonte e mock) e saída dos Flows antigos

**Files:**
- Modify: `apps/shell/src/pages/frota/data/types.ts`, `apps/shell/src/pages/frota/data/mappers.ts:14,80-99`, `apps/shell/src/pages/frota/data/source.ts`, `apps/shell/src/pages/frota/data/dataverse.ts:38-42,258-286` (+ métodos novos), `apps/shell/src/pages/frota/data/mock.ts`, `apps/shell/src/pages/frota/domain/transitions.ts:1-4,40-68`
- Create: `apps/shell/src/pages/frota/domain/multaEstado.ts`
- Test: `apps/shell/src/pages/frota/domain/multaEstado.test.ts` (novo), `apps/shell/src/pages/frota/data/mappers.test.ts`, `apps/shell/src/pages/frota/data/dataverse.test.ts`, `apps/shell/src/pages/frota/domain/transitions.test.ts`, `apps/shell/src/pages/frota/components/StatusPanel.test.tsx`, `apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx`, `apps/shell/src/pages/frota/FrotaPage.test.tsx`, `apps/shell/src/pages/frota/components/TermoMultaPanel.test.tsx`

**Interfaces:**
- Consumes: `avaliar`, `aplicarPasso`, `validarPasso`, `responsavelEfetivo`, `MultaEstado`, `DadosPasso`, `Passo`, `Situacao` (Task 3); `RESPONSAVEL`, `MOTIVO_EMPRESA`, `CANAL` (Task 3).
- Produces:
  - `types.ts`: `Multa` ganha (opcionais) `responsavel`, `motivoEmpresa`, `canal`, `aceiteEm`, `vencimento`, `valorComDesconto`, `valorPago`, `pagaEm`, `competencia`, `acertoEm`, `encerradaEm`, `canceladaEm`, `motivoCancelamento`, `arquivos: ArquivosMulta`; tipos `ArquivosMulta`, `Dossie`, `DossieServico`, `DossieViagem`.
  - `source.ts`: `FlowId = 'aprovarManutencao'`; `type ArquivoMulta = 'cr40f_comprovantepagamento' | 'cr40f_pdfpenalidade'`; `DataSource.passoMulta(multaId: string, passo: Passo, dados: DadosPasso): Promise<Situacao>`, `DataSource.dossieMulta(multaId: string): Promise<Dossie>`, `DataSource.enviarArquivoMulta(multaId: string, coluna: ArquivoMulta, file: File): Promise<void>`.
  - `multaEstado.ts`: `estadoDaMulta(m: Multa): MultaEstado`, `situacaoDaMulta(m: Multa, hoje: string): Situacao`, `EMPRESA: Ref` (`{ id: 'empresa', label: 'Empresa' }`), `responsavelDaMulta(m: Multa): Ref | null`.
  - Mock: uma multa em cada etapa (u1 identificar, u2 indicar, u3 encerrada, u4 acertar, u5 prazo vencido, u6 aguardando penalidade da Empresa, u7 pagar com vencimento, u8 Senatran sem aceite, u9 cancelada, u10 em recurso).

- [ ] **Step 1: Escrever os testes novos (falham)**

`apps/shell/src/pages/frota/domain/multaEstado.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MULTA, MOTIVO_EMPRESA, RESPONSAVEL } from '../data/schema'
import type { Multa } from '../data/types'
import { EMPRESA, estadoDaMulta, responsavelDaMulta, situacaoDaMulta } from './multaEstado'

const base: Multa = { id: 'u1', titulo: 'AIT 1', status: MULTA.NOTIFICAR, dataHora: '2026-11-10T16:00:00Z', local: null, dataParaIndicar: '2026-11-30', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: { id: 'f1', label: 'Ana (fictício)' }, infracaoId: null, criadoEm: '2026-11-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }

describe('multa → estado das regras', () => {
  it('leva o motorista, as datas e os campos novos', () => {
    expect(estadoDaMulta({ ...base, status: MULTA.INDICADA, vencimento: '2026-12-01', valorPago: null })).toMatchObject({ status: MULTA.INDICADA, motoristaId: 'f1', dataParaIndicar: '2026-11-30', vencimento: '2026-12-01', recursoPendente: false })
  })

  it('responsável: Empresa quando gravado; nas antigas, o motorista do lookup', () => {
    expect(responsavelDaMulta({ ...base, responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO })).toBe(EMPRESA)
    expect(responsavelDaMulta(base)).toEqual({ id: 'f1', label: 'Ana (fictício)' })
    expect(responsavelDaMulta({ ...base, motorista: null })).toBeNull()
  })

  it('prazo vencido vem das regras espelhadas', () => {
    expect(situacaoDaMulta({ ...base, dataParaIndicar: '2026-11-16' }, '2026-11-17').pendentes).toEqual(['PrazoVencido'])
  })
})
```

Acrescente ao `describe` principal de `apps/shell/src/pages/frota/data/mappers.test.ts` (importe `mapMulta` de `./mappers` se ainda não estiver no import):

```ts
  it('multa: lê responsável, canal, datas dos passos, valores e nomes dos arquivos', () => {
    const m = mapMulta({
      cr40f_multasid: '{U1}', cr40f_novacoluna: 'AIT 1', cr40f_status: 202410001, cr40f_responsavel: 100000001, cr40f_motivoempresa: 100000000,
      cr40f_canalindicacao: 100000000, cr40f_vencimento: '2026-11-20', cr40f_valorcomdesconto: 105.53, cr40f_valorpago: 175.88, cr40f_pagaem: '2026-11-16',
      cr40f_competenciadesconto: '2026-12-01', cr40f_motivocancelamento: null, cr40f_autodainfracao_name: 'auto.pdf', cr40f_comprovantepagamento_name: 'comprovante.pdf',
    }, { cr40f_vencimento: 'DateOnly', cr40f_pagaem: 'DateOnly', cr40f_competenciadesconto: 'DateOnly' })
    expect(m).toMatchObject({
      responsavel: 100000001, motivoEmpresa: 100000000, canal: 100000000, vencimento: '2026-11-20', valorComDesconto: 105.53, valorPago: 175.88,
      pagaEm: '2026-11-16', competencia: '2026-12-01', motivoCancelamento: null, arquivos: { autuacao: 'auto.pdf', penalidade: null, comprovante: 'comprovante.pdf' },
    })
  })
```

Acrescente ao fim de `apps/shell/src/pages/frota/data/dataverse.test.ts`:

```ts
describe('passo a passo da multa (Custom APIs)', () => {
  const MULTA_ID = '{AAAAAAAA-1111-2222-3333-444444444444}'
  const resposta = (ok: boolean, status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status, json: async () => body }))

  it('passoMulta chama cr40f_PassoMulta com MultaId limpo, Passo e DadosJson e devolve a situação', async () => {
    const situacao = { etapa: 'indicar', pendentes: ['RegistrarIndicacao'], proximoPasso: 'Indicar no órgão', proximoPrazo: '2026-11-30', prazoVencido: false, aguardandoPenalidade: false }
    const fetchMock = resposta(true, 200, { MultaJson: JSON.stringify(situacao) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await createXrmSource(host().xrm).passoMulta(MULTA_ID, 'AvisarMotorista', {})).toEqual(situacao)
    expect(fetchMock.mock.calls[0][0]).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_PassoMulta')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ MultaId: 'aaaaaaaa-1111-2222-3333-444444444444', Passo: 'AvisarMotorista', DadosJson: '{}' })
  })

  it('passoMulta repassa a recusa do servidor como está', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'Avise o motorista antes de registrar a indicação.' } }))
    await expect(createXrmSource(host().xrm).passoMulta(MULTA_ID, 'RegistrarIndicacao', { canal: 'dsv', data: '2026-11-15' })).rejects.toThrow('Avise o motorista antes de registrar a indicação.')
  })

  it('dossieMulta lê o new_DossieJson', async () => {
    const dossie = { multa: { id: 'x', auto: 'AIT 1', placa: 'TST1A11', dataHora: null, local: null, orgao: null, dataParaIndicar: null, infracao: null }, servicos: [], infleet: { erro: 'Sem token' } }
    const fetchMock = resposta(true, 200, { new_DossieJson: JSON.stringify(dossie) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await createXrmSource(host().xrm).dossieMulta(MULTA_ID)).toEqual(dossie)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ new_MultaId: 'aaaaaaaa-1111-2222-3333-444444444444' })
  })

  it('enviarArquivoMulta faz PATCH binário na coluna de arquivo com o nome sem acento', async () => {
    const fetchMock = resposta(true, 204, {})
    vi.stubGlobal('fetch', fetchMock)
    await createXrmSource(host().xrm).enviarArquivoMulta(MULTA_ID, 'cr40f_comprovantepagamento', new File(['x'], 'comprovante pagamento março.pdf', { type: 'application/pdf' }))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://org23b93544.crm2.dynamics.com/api/data/v9.2/cr40f_multases(aaaaaaaa-1111-2222-3333-444444444444)/cr40f_comprovantepagamento')
    expect(init?.method).toBe('PATCH')
    expect((init?.headers as Record<string, string>)['x-ms-file-name']).toBe('comprovante pagamento marco.pdf')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/multaEstado.test.ts src/pages/frota/data/mappers.test.ts src/pages/frota/data/dataverse.test.ts`
Expected: FAIL ("Failed to resolve import './multaEstado'", `passoMulta is not a function`, campos novos `undefined`).

- [ ] **Step 3: Tipos**

Em `apps/shell/src/pages/frota/data/types.ts`, troque a linha `export type Multa = { ... }` por:

```ts
export type ArquivosMulta = { autuacao: string | null; penalidade: string | null; comprovante: string | null }
/** Campos novos da fase 1 são opcionais: fixtures antigos continuam válidos e o mapper sempre os preenche. */
export type Multa = {
  id: string; titulo: string; status: number | null; dataHora: string | null; local: string | null; dataParaIndicar: string | null; indicado: boolean; dataAviso: string | null; dataIndicacao: string | null
  veiculo: Ref | null; motorista: Ref | null; infracaoId: string | null; criadoEm: string; valorGuia: number | null; recursoPendente: boolean; termoVigente: Ref | null
  /** undefined = resumo dos termos não carregou; null = sem termo. */ termo?: ResumoTermo | null
  responsavel?: number | null; motivoEmpresa?: number | null; canal?: number | null; aceiteEm?: string | null; vencimento?: string | null
  valorComDesconto?: number | null; valorPago?: number | null; pagaEm?: string | null; competencia?: string | null; acertoEm?: string | null
  encerradaEm?: string | null; canceladaEm?: string | null; motivoCancelamento?: string | null; arquivos?: ArquivosMulta
}
/** Retorno da Custom API new_DossieMulta (plugin DossieMultaPlugin). */
export type DossieServico = { id: string; codigo: string | null; cliente: string | null; saida: string; retorno: string | null; motorista: string | null; status: string | null; noHorario: boolean }
export type DossieViagem = { inicio: string; fim: string; motoristaInfleet: string | null; motorista?: string | null }
export type Dossie = {
  multa: { id: string; auto: string | null; placa: string | null; dataHora: string | null; local: string | null; orgao: string | null; dataParaIndicar: string | null; infracao: { codigo: string | null; descricao: string | null; valor: number | null } | null }
  servicos: DossieServico[]
  infleet: { veiculoId?: string; viagens?: DossieViagem[]; erro?: string }
}
```

- [ ] **Step 4: Leitura (mappers)**

Em `apps/shell/src/pages/frota/data/mappers.ts`, troque a linha `multas: [...]` de `SELECT` por:

```ts
  multas: ['cr40f_multasid', 'cr40f_novacoluna', 'cr40f_status', 'cr40f_dataehorario', 'cr40f_localdainfracao', 'cr40f_dataparaindicar', 'cr40f_indicado', 'cr40f_datadeavisoaocondutor', 'cr40f_datadeindicacao', '_cr40f_placa_value', '_cr40f_motorista_value', '_cr40f_codigodainfracao_value', 'createdon', 'new_valorguia', 'new_recursopendente', '_new_termovigente_value',
    'cr40f_responsavel', 'cr40f_motivoempresa', 'cr40f_canalindicacao', 'cr40f_aceiteem', 'cr40f_vencimento', 'cr40f_valorcomdesconto', 'cr40f_valorpago', 'cr40f_pagaem', 'cr40f_competenciadesconto', 'cr40f_acertoem', 'cr40f_encerradaem', 'cr40f_canceladaem', 'cr40f_motivocancelamento',
    'cr40f_autodainfracao_name', 'cr40f_pdfpenalidade_name', 'cr40f_comprovantepagamento_name'],
```

e, em `mapMulta`, logo depois de `termoVigente: ref(row, '_new_termovigente_value'),`, acrescente:

```ts
    responsavel: num(row.cr40f_responsavel),
    motivoEmpresa: num(row.cr40f_motivoempresa),
    canal: num(row.cr40f_canalindicacao),
    aceiteEm: toDateOnly(row.cr40f_aceiteem, behaviors.cr40f_aceiteem),
    vencimento: toDateOnly(row.cr40f_vencimento, behaviors.cr40f_vencimento),
    valorComDesconto: num(row.cr40f_valorcomdesconto),
    valorPago: num(row.cr40f_valorpago),
    pagaEm: toDateOnly(row.cr40f_pagaem, behaviors.cr40f_pagaem),
    competencia: toDateOnly(row.cr40f_competenciadesconto, behaviors.cr40f_competenciadesconto),
    acertoEm: toDateOnly(row.cr40f_acertoem, behaviors.cr40f_acertoem),
    encerradaEm: toDateOnly(row.cr40f_encerradaem, behaviors.cr40f_encerradaem),
    canceladaEm: toDateOnly(row.cr40f_canceladaem, behaviors.cr40f_canceladaem),
    motivoCancelamento: str(row.cr40f_motivocancelamento),
    arquivos: { autuacao: str(row.cr40f_autodainfracao_name), penalidade: str(row.cr40f_pdfpenalidade_name), comprovante: str(row.cr40f_comprovantepagamento_name) },
```

- [ ] **Step 5: `multaEstado.ts`**

```ts
import { RESPONSAVEL } from '../data/schema'
import type { Multa, Ref } from '../data/types'
import { avaliar, responsavelEfetivo, type MultaEstado, type Situacao } from './multaEtapas'

/** Multa da tela → estado que as regras (multaEtapas.ts) leem. */
export function estadoDaMulta(m: Multa): MultaEstado {
  return {
    status: m.status, responsavel: m.responsavel ?? null, motoristaId: m.motorista?.id ?? null, motivoEmpresa: m.motivoEmpresa ?? null,
    dataParaIndicar: m.dataParaIndicar, dataAviso: m.dataAviso, canal: m.canal ?? null, dataIndicacao: m.dataIndicacao, indicado: m.indicado,
    aceiteEm: m.aceiteEm ?? null, vencimento: m.vencimento ?? null, pagaEm: m.pagaEm ?? null, valorPago: m.valorPago ?? null,
    competencia: m.competencia ?? null, acertoEm: m.acertoEm ?? null, encerradaEm: m.encerradaEm ?? null, canceladaEm: m.canceladaEm ?? null,
    motivoCancelamento: m.motivoCancelamento ?? null, recursoPendente: m.recursoPendente,
  }
}

export const situacaoDaMulta = (m: Multa, hoje: string): Situacao => avaliar(estadoDaMulta(m), hoje)

export const EMPRESA: Ref = { id: 'empresa', label: 'Empresa' }

/** Quem responde pela multa: Empresa, ou o motorista (nas antigas sem responsável, o do lookup). */
export function responsavelDaMulta(m: Multa): Ref | null {
  return responsavelEfetivo(estadoDaMulta(m)) === RESPONSAVEL.EMPRESA ? EMPRESA : m.motorista
}
```

- [ ] **Step 6: Fonte de dados (contrato e Dataverse)**

Em `apps/shell/src/pages/frota/data/source.ts`:
- troque `import type { FrotaData, Kind, ParcelaTermo, TableKey, TermoMulta, Veiculo } from './types'` por `import type { Dossie, FrotaData, Kind, ParcelaTermo, TableKey, TermoMulta, Veiculo } from './types'` e acrescente `import type { DadosPasso, Passo, Situacao } from '../domain/multaEtapas'`;
- troque `export type FlowId = 'aprovarManutencao' | 'notificarCondutor' | 'gerarContrato'` por:

```ts
/** "Notificar condutor" e "Gerar contrato de indicação" saíram na fase 1 das multas: a multa anda pela cr40f_PassoMulta. */
export type FlowId = 'aprovarManutencao'
/** Colunas de arquivo livres da multa que a tela grava. */
export type ArquivoMulta = 'cr40f_comprovantepagamento' | 'cr40f_pdfpenalidade'
```

- no fim da `interface DataSource`, antes do `}`, acrescente:

```ts
  /** Custom API cr40f_PassoMulta: valida e grava o passo no servidor; a recusa vem com a mensagem do servidor. */
  passoMulta(multaId: string, passo: Passo, dados: DadosPasso): Promise<Situacao>
  /** Custom API new_DossieMulta: serviço da agenda, viagens do InFleet e dados da notificação, para a mensagem do WhatsApp. */
  dossieMulta(multaId: string): Promise<Dossie>
  /** Grava um arquivo numa coluna livre da multa (comprovante de pagamento ou PDF da penalidade). */
  enviarArquivoMulta(multaId: string, coluna: ArquivoMulta, file: File): Promise<void>
```

Em `apps/shell/src/pages/frota/data/dataverse.ts`:
- no `import ... from './source'` acrescente `type ArquivoMulta`; acrescente `import type { DadosPasso, Passo, Situacao } from '../domain/multaEtapas'` e inclua `Dossie` no `import type { ... } from './types'`;
- troque o objeto `FLOWS` por:

```ts
const FLOWS: Record<FlowId, { envVar: string; body: (id: string) => Record<string, string>; timeoutMs: number; nome: string }> = {
  aprovarManutencao: { envVar: 'new_FlowUrlManutencao', body: (id) => ({ guids: id }), timeoutMs: 60_000, nome: 'Agendar manutenção' },
}
```

- apague a linha `if (flow === 'notificarCondutor' && (status === 207 || status === 400) && Number(payload.noDriver) > 0) throw new Error('A multa não tem motorista. Nada foi enviado')`;
- no objeto devolvido por `createXrmSource`, depois de `listarParcelasTermo`, acrescente:

```ts
    async passoMulta(multaId: string, passo: Passo, dados: DadosPasso): Promise<Situacao> {
      const payload = await customApi('cr40f_PassoMulta', { MultaId: guid(multaId), Passo: passo, DadosJson: JSON.stringify(dados) }, 'Não foi possível gravar o passo')
      const json = typeof payload.MultaJson === 'string' ? payload.MultaJson : ''
      if (!json) throw new Error('O servidor não devolveu a situação da multa. Recarregue a tela')
      return JSON.parse(json) as Situacao
    },

    async dossieMulta(multaId: string): Promise<Dossie> {
      const payload = await customApi('new_DossieMulta', { new_MultaId: guid(multaId) }, 'Não foi possível montar o dossiê da multa')
      const json = typeof payload.new_DossieJson === 'string' ? payload.new_DossieJson : ''
      if (!json) throw new Error('O servidor não devolveu o dossiê da multa')
      return JSON.parse(json) as Dossie
    },

    async enviarArquivoMulta(multaId: string, coluna: ArquivoMulta, file: File) {
      // x-ms-file-name só aceita ASCII: tira acentos e o que sobrar fora da faixa imprimível.
      const nome = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '') || 'arquivo.pdf'
      const response = await fetch(`${apiUrl}/cr40f_multases(${guid(multaId)})/${coluna}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'x-ms-file-name': nome, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
        body: file,
      })
      if (!response.ok) throw new Error(`Não foi possível enviar o arquivo (${response.status})`)
    },
```

- [ ] **Step 7: Transições sem multa**

Em `apps/shell/src/pages/frota/domain/transitions.ts`:
- troque `import { COLISAO, MANUT, MULTA, MULTA_CAMPO, STATUS_FIELD } from '../data/schema'` por `import { COLISAO, MANUT, STATUS_FIELD } from '../data/schema'`;
- apague as constantes `desfechosMulta` e `finalizar`;
- troque o bloco `multa: { ... },` de `RULES` por:

```ts
  // Multa anda pelo passo a passo (MultaPassoAPasso → cr40f_PassoMulta); não tem transição de status aqui.
  multa: {},
```

- [ ] **Step 8: Mock**

Em `apps/shell/src/pages/frota/data/mock.ts`:
- troque `import { COLISAO, MANUT, MULTA, STATUS_FIELD, VEICULO } from './schema'` por `import { CANAL, COLISAO, MANUT, MOTIVO_EMPRESA, MULTA, RESPONSAVEL, STATUS_FIELD, VEICULO } from './schema'`; acrescente `import { estadoDaMulta } from '../domain/multaEstado'` e `import { aplicarPasso, avaliar, validarPasso, type MultaEstado } from '../domain/multaEtapas'`;
- na função `multa(id, extra)`, acrescente ao objeto, antes de `...extra`: `responsavel: null, motivoEmpresa: null, canal: null, aceiteEm: null, vencimento: null, valorComDesconto: null, valorPago: null, pagaEm: null, competencia: null, acertoEm: null, encerradaEm: null, canceladaEm: null, motivoCancelamento: null, arquivos: { autuacao: `auto-${id}.pdf`, penalidade: null, comprovante: null },`;
- troque a lista `multas: [ ... ],` do `seed()` por:

```ts
    // Uma multa em cada etapa, uma com prazo vencido e uma aguardando penalidade (spec §7, Mock).
    multas: [
      multa('u1', {}),
      multa('u2', { status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, dataAviso: offset(-2), dataParaIndicar: offset(2), motorista: ana }),
      multa('u3', { status: MULTA.FINALIZADO, responsavel: RESPONSAVEL.MOTORISTA, indicado: true, canal: CANAL.DSV, dataAviso: offset(-80), dataIndicacao: offset(-78), pagaEm: offset(-40), valorPago: 130.16, competencia: `${addMonths(todaySP(), -1).slice(0, 7)}-01`, acertoEm: offset(-30), encerradaEm: offset(-30), dataHora: iso(-90) }),
      multa('u4', { status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: ana, infracaoId: null, veiculo: v2, dataHora: iso(-150), pagaEm: offset(-3), valorPago: 130.16, arquivos: { autuacao: 'auto-u4.pdf', penalidade: 'penalidade-u4.pdf', comprovante: 'comprovante-u4.pdf' } }),
      multa('u5', { dataParaIndicar: offset(-1), dataHora: iso(-35) }),
      multa('u6', { status: MULTA.INDICADA, responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO, dataParaIndicar: offset(-10), dataHora: iso(-50) }),
      multa('u7', { status: MULTA.INDICADA, responsavel: RESPONSAVEL.MOTORISTA, motorista: ana, canal: CANAL.DSV, dataAviso: offset(-20), dataIndicacao: offset(-18), indicado: true, vencimento: offset(4), valorComDesconto: 78.1, dataHora: iso(-45) }),
      multa('u8', { status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, canal: CANAL.SENATRAN, dataAviso: offset(-5), dataIndicacao: offset(-3), indicado: true, dataParaIndicar: offset(6) }),
      multa('u9', { status: MULTA.CANCELADA, canceladaEm: offset(-7), motivoCancelamento: 'Multa duplicada no portal (fictício).' }),
      multa('u10', { status: MULTA.RECURSO, responsavel: RESPONSAVEL.MOTORISTA, recursoPendente: true, veiculo: v2 }),
    ],
```

- no `runFlow`, troque as três linhas do `if/else` e o `return` por:

```ts
      if (flow !== 'aprovarManutencao') throw new Error('Flow desconhecido no mock.')
      const record = find('manutencao', id) as Record<string, unknown> | undefined
      if (!record) throw new Error('Registro não encontrado no mock.')
      record.status = MANUT.APROVADO
      return { message: 'Mock: Flow simulado.', shareUrl: null }
```

(apagando também as linhas `const kind: Kind = ...` e `const record = find(kind, id) ...` que vinham antes).
- acrescente a função auxiliar, fora de `createMockSource`:

```ts
/** Leva o estado novo do passo para a multa do mock; o motorista escolhido vira Ref pelas pessoas fictícias. */
function aplicarNaMulta(m: Multa, e: MultaEstado, pessoas: Ref[]) {
  Object.assign(m, {
    status: e.status ?? null, responsavel: e.responsavel ?? null, motivoEmpresa: e.motivoEmpresa ?? null, dataAviso: e.dataAviso ?? null,
    canal: e.canal ?? null, dataIndicacao: e.dataIndicacao ?? null, indicado: e.indicado ?? false, aceiteEm: e.aceiteEm ?? null,
    pagaEm: e.pagaEm ?? null, valorPago: e.valorPago ?? null, competencia: e.competencia ?? null, acertoEm: e.acertoEm ?? null,
    encerradaEm: e.encerradaEm ?? null, canceladaEm: e.canceladaEm ?? null, motivoCancelamento: e.motivoCancelamento ?? null, recursoPendente: e.recursoPendente ?? false,
  })
  if (e.motoristaId && e.motoristaId !== m.motorista?.id) m.motorista = pessoas.find((p) => p.id === e.motoristaId) ?? m.motorista
}
```

- no objeto devolvido, depois de `listarParcelasTermo`, acrescente:

```ts
    async passoMulta(multaId, passo, dados) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const hoje = todaySP()
      const antes = estadoDaMulta(item)
      const erro = validarPasso(antes, passo, dados, hoje)
      if (erro) throw new Error(erro)
      const depois = aplicarPasso(antes, passo, dados, hoje)
      aplicarNaMulta(item, depois, [ana, bruno])
      return avaliar(depois, hoje)
    },
    async dossieMulta(multaId) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const infracao = data.infracoes.find((row) => row.id === item.infracaoId)
      const quando = Date.parse(item.dataHora ?? iso(-20))
      const em = (minutos: number) => new Date(quando + minutos * 60_000).toISOString()
      return {
        multa: { id: item.id, auto: item.titulo, placa: item.veiculo?.label ?? null, dataHora: item.dataHora, local: item.local, orgao: 'DSV (fictício)', dataParaIndicar: item.dataParaIndicar, infracao: infracao ? { codigo: infracao.codigo, descricao: infracao.descricao, valor: infracao.valor } : null },
        servicos: [{ id: 's1', codigo: 'S-1001', cliente: 'Cliente Alfa (fictício)', saida: em(-60), retorno: em(120), motorista: item.motorista?.label ?? null, status: 'Concluído', noHorario: true }],
        infleet: { viagens: [{ inicio: em(-20), fim: em(20), motoristaInfleet: 'drv-ficticio', motorista: item.motorista?.label ?? null }] },
      }
    },
    async enviarArquivoMulta(multaId, coluna, file) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const atuais = item.arquivos ?? { autuacao: null, penalidade: null, comprovante: null }
      item.arquivos = { ...atuais, [coluna === 'cr40f_comprovantepagamento' ? 'comprovante' : 'penalidade']: file.name }
    },
```

Se o typecheck acusar `Kind` sem uso no `import type` do mock, tire-o de lá.

- [ ] **Step 9: Ajustar os testes que usavam os Flows de multa**

`apps/shell/src/pages/frota/domain/transitions.test.ts`:
- troque o `it('lista só as transições permitidas de multa', ...)` inteiro por:

```ts
  it('multa não tem transição de status: o passo a passo grava pela cr40f_PassoMulta', () => {
    for (const status of Object.values(MULTA)) expect(ids('multa', status)).toEqual([])
  })
```

- em `it('marca quais transições chamam Flow', ...)` apague as duas linhas com `pick('multa', ...)`;
- em `it('exige veículo para aprovar e motorista para notificar e gerar contrato', ...)` apague as duas linhas de multa e renomeie para `'exige veículo para aprovar'`;
- apague os testes `'não exige campo nas transições de multa feitas por Flow'`, `'transições de multa por Flow não gravam nada pela tela'` e `'notificar condutor só chama o Flow, sem gravar pela tela'`;
- troque o corpo de `'não consulta nem chama nada quando falta o requisito'` por:

```ts
    const source = fakeSource(MANUT.SOLICITADO)
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO, { temVeiculo: false }), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toThrow('Informe o veículo no formulário antes desta ação')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
```

- troque as duas primeiras linhas do corpo de `'rejeita transição que não está disponível no status atual'` por:

```ts
    const source = fakeSource(MANUT.SOLICITADO)
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
```

`apps/shell/src/pages/frota/components/StatusPanel.test.tsx`:
- apague `it('desabilita as ações de multa que exigem motorista', ...)`;
- troque `it('usa a mensagem padrão quando o Flow não devolve texto', ...)` por:

```ts
  it('usa a mensagem padrão quando o Flow não devolve texto', async () => {
    const source = fakeSource()
    const { onDone } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
    fireEvent.change(screen.getByLabelText(/Agendar para/), { target: { value: '2026-10-15' } })
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(source.runFlow).toHaveBeenCalledWith('aprovarManutencao', 'm1')
    expect(await screen.findByText('Aprovar e agendar: concluído.')).toBeTruthy()
  })
```

- tire `MULTA` do import de `../data/schema` se não sobrar uso.

`apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx`: troque `it('multa sem motorista: Notificar condutor desabilitado com o motivo visível', ...)` por:

```ts
  it('multa não oferece mais Notificar condutor nem Gerar contrato', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.queryByRole('button', { name: 'Notificar condutor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Gerar contrato de indicação' })).toBeNull()
  })
```

`apps/shell/src/pages/frota/data/dataverse.test.ts`:
- no `it.each([...])` de `'chama o Flow %s com POST e o corpo certo'`, apague as linhas `['notificarCondutor', ...]` e `['gerarContrato', ...]`;
- troque `it('lê a variável de ambiente pelo schemaname de cada Flow', ...)` por:

```ts
  it('lê a variável de ambiente pelo schemaname do Flow', async () => {
    stubFetch(200)
    const { xrm, retrieveMultipleRecords } = flowHost()
    await createXrmSource(xrm).runFlow('aprovarManutencao', GUID)
    expect(retrieveMultipleRecords.mock.calls[0][1]).toContain("schemaname eq 'new_FlowUrlManutencao'")
  })
```

- apague `'notificarCondutor com 400 e noDriver ...'` e `'notificarCondutor com 207 e noDriver ...'`;
- nas chamadas restantes, troque `runFlow('notificarCondutor'`, `runFlow('gerarContrato'` e `prepareFlow('gerarContrato')` por `runFlow('aprovarManutencao'` / `prepareFlow('aprovarManutencao')`, e as mensagens esperadas: `'URL do Flow "Gerar contrato" não configurada (variável new_FlowUrlGerarContratoMultas)'` → `'URL do Flow "Agendar manutenção" não configurada (variável new_FlowUrlManutencao)'`; `'O Flow "Notificar condutor" respondeu 207. ...'` → `'O Flow "Agendar manutenção" respondeu 207. Confira o registro antes de tentar de novo'`; `'Não foi possível chamar o Flow "Gerar contrato" (rede ou bloqueio do navegador)'` → `'Não foi possível chamar o Flow "Agendar manutenção" (rede ou bloqueio do navegador)'`.

Em todo `fakeSource` de teste que monta um `DataSource` completo (`RegistroDrawer.test.tsx`, `StatusPanel.test.tsx`, `FrotaPage.test.tsx`, `TermoMultaPanel.test.tsx`, `transitions.test.ts` e qualquer outro que o typecheck apontar), acrescente depois de `listarParcelasTermo: async () => [],`:

```ts
    passoMulta: async () => { throw new Error('não usado neste teste') }, dossieMulta: async () => { throw new Error('não usado neste teste') }, enviarArquivoMulta: async () => {},
```

- [ ] **Step 10: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test -- src/pages/frota`
Expected: typecheck sem erro; PASS em toda a pasta `frota` (se estourar tempo, rode por subpasta: `src/pages/frota/data`, `src/pages/frota/domain`, `src/pages/frota/components`, `src/pages/frota/views`).

- [ ] **Step 11: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(multas): dados da fase 1 no shell, Custom APIs do passo e do dossiê, mock por etapa e fim dos Flows antigos"
```

---

### Task 12: Mensagem pronta para o WhatsApp

**Files:**
- Create: `apps/shell/src/pages/frota/domain/multaMensagem.ts`
- Test: `apps/shell/src/pages/frota/domain/multaMensagem.test.ts`

**Interfaces:**
- Consumes: `Dossie` (Task 11), `diaSP`, `formatBR`, `horaSP` (`frota/data/dates.ts`), `brl` (`frota/data/format.ts`).
- Produces: `mensagemWhatsApp(d: Dossie, motorista: string | null): string`.

- [ ] **Step 1: Escrever o teste (falha)**

`apps/shell/src/pages/frota/domain/multaMensagem.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { brl } from '../data/format'
import type { Dossie } from '../data/types'
import { mensagemWhatsApp } from './multaMensagem'

const dossie: Dossie = {
  multa: { id: 'u1', auto: '1A2B3C', placa: 'TST1A11', dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', orgao: 'DSV', dataParaIndicar: '2026-11-30', infracao: { codigo: '7455-0', descricao: 'Velocidade até 20% acima', valor: 130.16 } },
  servicos: [{ id: 's1', codigo: 'S-1001', cliente: 'Cliente Alfa (fictício)', saida: '2026-11-10T15:00:00Z', retorno: '2026-11-10T18:00:00Z', motorista: 'Ana (fictício)', status: 'Concluído', noHorario: true }],
  infleet: { viagens: [{ inicio: '2026-11-10T15:40:00Z', fim: '2026-11-10T16:20:00Z', motoristaInfleet: 'drv-1', motorista: 'Ana' }] },
}

describe('mensagemWhatsApp', () => {
  it('monta o texto com notificação, serviço da agenda, rastreador e prazo', () => {
    expect(mensagemWhatsApp(dossie, 'Ana Souza (fictício)').split('\n')).toEqual([
      'Olá, Ana. Chegou uma notificação de multa do veículo TST1A11.',
      `Infração: 7455-0 - Velocidade até 20% acima (${brl(130.16)})`,
      'Quando: 10/11/2026 às 13:00',
      'Local: Av. de Teste, 100',
      'Serviço na agenda: S-1001 · Cliente Alfa (fictício) · 12:00–15:00 (Ana (fictício))',
      'Rastreador: viagem 12:40–13:20 com Ana',
      'Prazo para indicar o condutor: 30/11/2026',
      'Pode me confirmar se era você ao volante? Com a sua confirmação eu faço a indicação.',
    ])
  })

  it('sem serviço e com o rastreador fora do ar, avisa sem travar a mensagem', () => {
    const texto = mensagemWhatsApp({ ...dossie, servicos: [], infleet: { erro: 'Token da Infleet não configurado.' } }, null)
    expect(texto).toContain('Olá. Chegou uma notificação')
    expect(texto).toContain('Agenda: nenhum serviço desse veículo no horário.')
    expect(texto).toContain('Rastreador: indisponível (Token da Infleet não configurado.)')
  })

  it('serviço fora do horário aparece como próximo e viagem nenhuma é dita', () => {
    const texto = mensagemWhatsApp({ ...dossie, servicos: [{ ...dossie.servicos[0], noHorario: false, retorno: null }], infleet: { viagens: [] } }, 'Bruno')
    expect(texto).toContain('Serviço próximo do horário: S-1001 · Cliente Alfa (fictício) · 12:00 (Ana (fictício))')
    expect(texto).toContain('Rastreador: nenhuma viagem 30 minutos antes ou depois.')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/multaMensagem.test.ts`
Expected: FAIL ("Failed to resolve import './multaMensagem'").

- [ ] **Step 3: Implementar**

`apps/shell/src/pages/frota/domain/multaMensagem.ts`:

```ts
import { diaSP, formatBR, horaSP } from '../data/dates'
import { brl } from '../data/format'
import type { Dossie, DossieServico } from '../data/types'

const quando = (iso: string | null) => (iso ? `${formatBR(diaSP(iso))} às ${horaSP(iso)}` : 'sem data e hora')

function linhasServico(servicos: DossieServico[]) {
  if (!servicos.length) return ['Agenda: nenhum serviço desse veículo no horário.']
  return servicos.map((s) => {
    const titulo = s.noHorario ? 'Serviço na agenda' : 'Serviço próximo do horário'
    const horario = `${horaSP(s.saida)}${s.retorno ? `–${horaSP(s.retorno)}` : ''}`
    return `${titulo}: ${[s.codigo, s.cliente, horario].filter(Boolean).join(' · ')}${s.motorista ? ` (${s.motorista})` : ''}`
  })
}

function linhasRastreador(infleet: Dossie['infleet']) {
  if (infleet.erro) return [`Rastreador: indisponível (${infleet.erro})`]
  const viagens = infleet.viagens ?? []
  if (!viagens.length) return ['Rastreador: nenhuma viagem 30 minutos antes ou depois.']
  return viagens.map((v) => `Rastreador: viagem ${horaSP(v.inicio)}–${horaSP(v.fim)}${v.motorista ? ` com ${v.motorista}` : ''}`)
}

/** Texto que o gestor cola no WhatsApp do motorista (spec §5.6 e §7). Só usa o primeiro nome. */
export function mensagemWhatsApp(d: Dossie, motorista: string | null): string {
  const m = d.multa
  const nome = motorista?.trim().split(/\s+/)[0]
  const infracao = m.infracao ? [m.infracao.codigo, m.infracao.descricao].filter(Boolean).join(' - ') || 'não informada' : 'não informada'
  return [
    `Olá${nome ? `, ${nome}` : ''}. Chegou uma notificação de multa do veículo ${m.placa ?? 'sem placa'}.`,
    `Infração: ${infracao}${m.infracao?.valor != null ? ` (${brl(m.infracao.valor)})` : ''}`,
    `Quando: ${quando(m.dataHora)}`,
    `Local: ${m.local ?? 'não informado'}`,
    ...linhasServico(d.servicos),
    ...linhasRastreador(d.infleet),
    ...(m.dataParaIndicar ? [`Prazo para indicar o condutor: ${formatBR(m.dataParaIndicar)}`] : []),
    'Pode me confirmar se era você ao volante? Com a sua confirmação eu faço a indicação.',
  ].join('\n')
}
```

- [ ] **Step 4: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/multaMensagem.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/domain/multaMensagem.ts apps/shell/src/pages/frota/domain/multaMensagem.test.ts
git commit -m "feat(multas): mensagem do WhatsApp montada a partir do dossiê"
```

---
### Task 13: Drawer passo a passo da multa (`MultaPassoAPasso`)

**Files:**
- Create: `apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx`
- Modify: `apps/shell/src/pages/frota/domain/multaEstado.ts` (helper `urgenciaDoPrazo`)
- Modify: `apps/shell/src/pages/frota/components/RegistroDrawer.tsx` (multa usa o passo a passo; termo escondido; dados recolhidos)
- Modify: `apps/shell/src/pages/frota/frota.css` (fim do arquivo)
- Test: `apps/shell/src/pages/frota/components/MultaPassoAPasso.test.tsx`, `apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx`

**Interfaces:**
- Consumes: `DataSource.passoMulta`, `dossieMulta`, `enviarArquivoMulta` (Task 11); `estadoDaMulta`, `responsavelDaMulta` (Task 11); `avaliar`, `validarPasso`, `aberta`, `ROTULO_PASSO`, `DadosPasso`, `Passo`, `Etapa`, `MultaEstado` (Task 3); `mensagemWhatsApp` (Task 12).
- Produces: `MultaPassoAPasso({ source, multa, data, onChanged, hoje? })`; `opcoesMotoristas(data, atual)`; `urgenciaDoPrazo(prazo: string | null, vencido: boolean, hoje: string): 'vencido' | 'atencao' | 'normal'` (usado também pela lista na Task 14).

- [ ] **Step 1: Escrever os testes (falham)**

`apps/shell/src/pages/frota/components/MultaPassoAPasso.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Dossie, Multa } from '../data/types'
import { MultaPassoAPasso } from './MultaPassoAPasso'

const HOJE = '2026-11-17'
const multa: Multa = { id: 'u1', titulo: 'AIT 1A2B3C', status: MULTA.NOTIFICAR, dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', dataParaIndicar: '2026-11-30', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: null, infracaoId: null, criadoEm: '2026-11-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const dossie: Dossie = { multa: { id: 'u1', auto: '1A2B3C', placa: 'TST1A11', dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', orgao: null, dataParaIndicar: '2026-11-30', infracao: null }, servicos: [], infleet: { viagens: [] } }

function fonte(overrides: Partial<DataSource> = {}) {
  return { passoMulta: vi.fn(async () => ({ etapa: 'pagar', pendentes: [], proximoPasso: 'Aguardando penalidade', proximoPrazo: null, prazoVencido: false, aguardandoPenalidade: true })), dossieMulta: vi.fn(async () => dossie), enviarArquivoMulta: vi.fn(async () => {}), ...overrides } as unknown as DataSource
}

function renderPasso(source: DataSource, m: Multa = multa) {
  const onChanged = vi.fn()
  render(<ToastProvider><MultaPassoAPasso source={source} multa={m} data={{ ...EMPTY_DATA, multas: [m] }} onChanged={onChanged} hoje={HOJE} /></ToastProvider>)
  return { onChanged }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MultaPassoAPasso', () => {
  it('mostra o topo, a barra de etapas e só o passo atual', () => {
    renderPasso(fonte())
    expect(screen.getByText('AIT 1A2B3C')).toBeTruthy()
    expect(screen.getByText('30/11/2026')).toBeTruthy()
    const atual = screen.getByRole('list', { name: 'Etapas da multa' }).querySelector('[aria-current="step"]')
    expect(atual?.textContent).toContain('Identificar')
    expect(screen.getByRole('heading', { name: 'Definir o responsável' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Avisar o motorista' })).toBeNull()
  })

  it('o botão só libera com os obrigatórios e grava pela cr40f_PassoMulta', async () => {
    const source = fonte()
    const { onChanged } = renderPasso(source)
    const confirmar = screen.getByRole('button', { name: 'Confirmar responsável' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    expect(confirmar.disabled).toBe(false)
    await act(async () => { fireEvent.click(confirmar) })
    expect(source.passoMulta).toHaveBeenCalledWith('u1', 'DefinirResponsavel', { responsavel: 'empresa' })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('mostra a recusa do servidor como está', async () => {
    const source = fonte({ passoMulta: vi.fn(async () => { throw new Error('Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos (cr40f_status).') }) })
    renderPasso(source)
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar responsável' })) })
    expect(await screen.findByText('Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos (cr40f_status).')).toBeTruthy()
  })

  it('prazo vencido ocupa o passo inteiro com as duas saídas e esconde o menu Mais', () => {
    renderPasso(fonte(), { ...multa, dataParaIndicar: '2026-11-16' })
    expect(screen.getByRole('heading', { name: 'O prazo de indicação venceu' })).toBeTruthy()
    expect(screen.getByLabelText('Sim, foi indicada')).toBeTruthy()
    expect(screen.getByLabelText('Não: a empresa paga a guia (prazo perdido)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mais ações da multa' })).toBeNull()
    expect(screen.getByText(/· vencido/)).toBeTruthy()
  })

  it('Copiar mensagem: sem clipboard, deixa o texto selecionado para copiar à mão', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('negado') }) } })
    const source = fonte()
    renderPasso(source, { ...multa, status: MULTA.NOTIFICADO, motorista: { id: 'f1', label: 'Ana Souza (fictício)' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(source.dossieMulta).toHaveBeenCalledWith('u1')
    const texto = screen.getByLabelText('Mensagem para o WhatsApp') as HTMLTextAreaElement
    expect(texto.value).toContain('Olá, Ana. Chegou uma notificação de multa do veículo TST1A11.')
    expect(screen.getByText('Não deu para copiar sozinho: o texto está selecionado. Use Ctrl+C.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avisei' })).toBeTruthy()
  })

  it('aguardando penalidade não tem passo e explica o porquê', () => {
    renderPasso(fonte(), { ...multa, status: MULTA.INDICADA, responsavel: 100000001, motivoEmpresa: 100000000 })
    expect(screen.getByText(/Aguardando a penalidade/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).toBeNull()
    expect(screen.getByText('Responsável: Empresa (prazo perdido)')).toBeTruthy()
  })
})
```

Acrescente a `apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx`:

```tsx
  it('multa mostra o passo a passo e deixa os dados recolhidos', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect(screen.getByRole('list', { name: 'Etapas da multa' })).toBeTruthy()
    const dados = screen.getByText('Dados e arquivos').closest('details') as HTMLDetailsElement
    expect(dados.open).toBe(false)
    expect(screen.queryByText('Termo de acordo')).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/components/MultaPassoAPasso.test.tsx src/pages/frota/components/RegistroDrawer.test.tsx`
Expected: FAIL ("Failed to resolve import './MultaPassoAPasso'").

- [ ] **Step 3: Helper de urgência**

Acrescente a `apps/shell/src/pages/frota/domain/multaEstado.ts` (e `import { daysBetween } from '../data/dates'` no topo):

```ts
/** Cor do próximo prazo (spec §7): vermelho quando vencido, âmbar com 7 dias ou menos. */
export function urgenciaDoPrazo(prazo: string | null, vencido: boolean, hoje: string): 'vencido' | 'atencao' | 'normal' {
  if (vencido || (prazo !== null && daysBetween(hoje, prazo) < 0)) return 'vencido'
  return prazo !== null && daysBetween(hoje, prazo) <= 7 ? 'atencao' : 'normal'
}
```

- [ ] **Step 4: Implementar o componente**

`apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ChoiceGroup, Field, Input, Menu, Radio, Select, Textarea, type MenuAction } from '@betinhos/ui'
import { daysBetween, formatBR, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { CANAL, MOTIVO_EMPRESA, RESPONSAVEL } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Multa, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { estadoDaMulta, responsavelDaMulta, urgenciaDoPrazo } from '../domain/multaEstado'
import { aberta, avaliar, ROTULO_PASSO, validarPasso, type DadosPasso, type Etapa, type MultaEstado, type Passo } from '../domain/multaEtapas'
import { mensagemWhatsApp } from '../domain/multaMensagem'
import { useNotify } from './Toasts'

type Props = { source: DataSource; multa: Multa; data: FrotaData; onChanged: () => void; hoje?: string }

const BARRA: { etapa: 'identificar' | 'indicar' | 'pagar' | 'acertar'; rotulo: string }[] = [
  { etapa: 'identificar', rotulo: 'Identificar' }, { etapa: 'indicar', rotulo: 'Indicar' }, { etapa: 'pagar', rotulo: 'Pagar' }, { etapa: 'acertar', rotulo: 'Acertar' },
]
const ORDEM: Record<Etapa, number> = { identificar: 0, indicar: 1, pagar: 2, recurso: 2, acertar: 3, encerrada: 4, cancelada: -1 }
const BOTAO: Record<Passo, string> = {
  DefinirResponsavel: 'Confirmar responsável', AvisarMotorista: 'Avisei', RegistrarIndicacao: 'Registrar indicação', RegistrarAceite: 'Registrar aceite',
  RegistrarPagamento: 'Registrar pagamento', RegistrarAcerto: 'Registrar acerto', PrazoVencido: 'Responder', Cancelar: 'Cancelar multa',
  Recorrer: 'Entrar com recurso', ResultadoRecurso: 'Registrar resultado',
}
const CANAIS = [{ value: 'senatran', label: 'Senatran' }, { value: 'dsv', label: 'DSV Digital' }, { value: 'prefeitura', label: 'Prefeitura' }]
const MOTIVOS = [{ value: 'culpa-empresa', label: 'Culpa da empresa' }, { value: 'prazo-perdido', label: 'Prazo perdido' }]
const ROTULO_CANAL: Record<number, string> = { [CANAL.SENATRAN]: 'Senatran', [CANAL.DSV]: 'DSV Digital', [CANAL.PREFEITURA]: 'Prefeitura' }
const ROTULO_MOTIVO: Record<number, string> = { [MOTIVO_EMPRESA.PRAZO_PERDIDO]: 'prazo perdido', [MOTIVO_EMPRESA.CULPA_EMPRESA]: 'culpa da empresa' }

/** Quem pode ser o responsável: motoristas das posses e das multas (a Frota não carrega o cadastro inteiro). */
export function opcoesMotoristas(data: FrotaData, atual: Ref | null) {
  const mapa = new Map<string, string>()
  for (const r of [atual, ...data.posses.map((p) => p.motorista), ...data.multas.map((m) => m.motorista)]) if (r?.id && r.label) mapa.set(r.id, r.label)
  return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

/** Passos feitos, só leitura. */
function feitos(e: MultaEstado, responsavel: Ref | null): string[] {
  const linhas: string[] = []
  const motivo = e.motivoEmpresa != null ? ` (${ROTULO_MOTIVO[e.motivoEmpresa]})` : ''
  if (e.responsavel === RESPONSAVEL.EMPRESA) linhas.push(`Responsável: Empresa${motivo}`)
  else if (responsavel) linhas.push(`Responsável: ${responsavel.label}`)
  if (e.dataAviso) linhas.push(`Motorista avisado em ${formatBR(e.dataAviso)}`)
  if (e.dataIndicacao) linhas.push(`Indicada em ${formatBR(e.dataIndicacao)}${e.canal != null ? ` pela ${ROTULO_CANAL[e.canal]}` : ''}`)
  if (e.aceiteEm) linhas.push(`Aceite na CNH Digital em ${formatBR(e.aceiteEm)}`)
  if (e.pagaEm) linhas.push(`Paga em ${formatBR(e.pagaEm)}${e.valorPago != null ? ` · ${brl(e.valorPago)}` : ''}`)
  if (e.acertoEm) linhas.push(e.competencia ? `Lançada na folha de ${formatBR(e.competencia).slice(3)}` : `Empresa assumiu${motivo}`)
  if (e.canceladaEm) linhas.push(`Cancelada em ${formatBR(e.canceladaEm)}${e.motivoCancelamento ? `: ${e.motivoCancelamento}` : ''}`)
  return linhas
}

export function MultaPassoAPasso({ source, multa, data, onChanged, hoje = todaySP() }: Props) {
  const notify = useNotify()
  const estado = useMemo(() => estadoDaMulta(multa), [multa])
  const situacao = useMemo(() => avaliar(estado, hoje), [estado, hoje])
  const responsavel = responsavelDaMulta(multa)
  const motoristas = useMemo(() => opcoesMotoristas(data, multa.motorista), [data, multa.motorista])
  const [extra, setExtra] = useState<'Cancelar' | 'Recorrer' | null>(null)
  const passo: Passo | null = extra ?? situacao.pendentes[0] ?? null
  const [dados, setDados] = useState<DadosPasso>({})
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [copiaFalhou, setCopiaFalhou] = useState(false)
  const [montando, setMontando] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  // Passo novo começa limpo; o responsável já sugere o motorista que veio no cadastro da multa.
  useEffect(() => {
    setDados(passo === 'DefinirResponsavel' && multa.motorista ? { responsavel: 'motorista', motoristaId: multa.motorista.id } : {})
    setArquivo(null)
    setErro(null)
  }, [passo, multa.id, multa.motorista])

  const set = (patch: DadosPasso) => setDados((atual) => ({ ...atual, ...patch }))
  const faltando = passo ? validarPasso(estado, passo, dados, hoje) : null
  const dias = situacao.proximoPrazo ? daysBetween(hoje, situacao.proximoPrazo) : null
  const urgencia = urgenciaDoPrazo(situacao.proximoPrazo, situacao.prazoVencido, hoje)
  const mais: MenuAction[] = situacao.prazoVencido || extra ? [] : [
    ...(situacao.etapa === 'identificar' || situacao.etapa === 'indicar' || situacao.etapa === 'pagar' ? [{ id: 'recurso', label: 'Em recurso', onSelect: () => setExtra('Recorrer') }] : []),
    ...(aberta(situacao.etapa) ? [{ id: 'cancelar', label: 'Cancelar multa', onSelect: () => setExtra('Cancelar') }] : []),
  ]

  async function gravar() {
    if (!passo || faltando || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      if (passo === 'RegistrarPagamento' && arquivo) await source.enviarArquivoMulta(multa.id, 'cr40f_comprovantepagamento', arquivo)
      await source.passoMulta(multa.id, passo, dados)
      notify('success', `${ROTULO_PASSO[passo]}: feito.`)
      setExtra(null)
      onChanged()
    } catch (reason) {
      setErro(errorMessage(reason))
    } finally {
      setSalvando(false)
    }
  }

  async function copiar() {
    setMontando(true)
    setCopiaFalhou(false)
    let texto: string
    try {
      texto = mensagemWhatsApp(await source.dossieMulta(multa.id), multa.motorista?.label ?? null)
    } catch (reason) {
      notify('error', errorMessage(reason))
      setMontando(false)
      return
    }
    setMensagem(texto)
    try {
      await navigator.clipboard.writeText(texto)
      notify('success', 'Mensagem copiada. Cole no WhatsApp do motorista.')
    } catch {
      setCopiaFalhou(true)
      requestAnimationFrame(() => { textoRef.current?.focus(); textoRef.current?.select() })
    } finally {
      setMontando(false)
    }
  }

  const campoData = (rotulo: string) => (
    <Field label={rotulo} required><Input type="date" max={hoje} disabled={salvando} value={dados.data ?? ''} onChange={(e: { target: { value: string } }) => set({ data: e.target.value })} /></Field>
  )
  const campoCanal = () => (
    <Field label="Canal" required>
      <Select aria-label="Canal da indicação" options={CANAIS} placeholder="Escolha o canal" value={dados.canal ?? null} onChange={(v) => set({ canal: (v ?? undefined) as DadosPasso['canal'] })} />
    </Field>
  )

  function campos() {
    const nome = `${multa.id}-${passo}`
    switch (passo) {
      case 'DefinirResponsavel':
        return <>
          <ChoiceGroup label="Quem responde pela multa" inline>
            <Radio name={nome} label="Motorista" checked={dados.responsavel === 'motorista'} onChange={() => set({ responsavel: 'motorista' })} />
            <Radio name={nome} label="Empresa (culpa da empresa)" checked={dados.responsavel === 'empresa'} onChange={() => setDados({ responsavel: 'empresa' })} />
          </ChoiceGroup>
          {dados.responsavel === 'motorista' && (
            <Field label="Motorista" required>
              <Select aria-label="Motorista" options={motoristas} searchable placeholder="Escolha o motorista" value={dados.motoristaId ?? null} onChange={(v) => set({ motoristaId: v ?? undefined })} />
            </Field>
          )}
          {dados.responsavel === 'empresa' && <p className="frota-muted">A etapa 2 é pulada: a multa vai direto para Pagar.</p>}
        </>
      case 'AvisarMotorista':
        return <>
          <p className="frota-muted">Mande pelo WhatsApp a mensagem com o serviço do dia e o rastreador. Depois confirme em "Avisei".</p>
          <div className="frota-cluster"><Button variant="secondary" loading={montando} onClick={() => void copiar()}>Copiar mensagem</Button></div>
          {mensagem !== null && <textarea ref={textoRef} className="multa-mensagem" aria-label="Mensagem para o WhatsApp" rows={9} readOnly value={mensagem} />}
          {copiaFalhou && <p className="frota-muted" role="status">Não deu para copiar sozinho: o texto está selecionado. Use Ctrl+C.</p>}
        </>
      case 'RegistrarIndicacao':
        return <div className="frota-fields">{campoCanal()}{campoData('Data da indicação')}</div>
      case 'RegistrarAceite':
        return <div className="frota-fields">{campoData('Data do aceite na CNH Digital')}</div>
      case 'RegistrarPagamento':
        return <>
          <p className="frota-muted">Vencimento {formatBR(estado.vencimento)}{multa.valorComDesconto != null ? ` · com os 40%: ${brl(multa.valorComDesconto)}` : ''}</p>
          <div className="frota-fields">
            {campoData('Data do pagamento')}
            <Field label="Valor pago (R$)" required>
              <Input type="number" step="0.01" min="0" disabled={salvando} value={dados.valorPago ?? ''} onChange={(e: { target: { value: string } }) => set({ valorPago: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Field>
            <Field label="Comprovante (opcional)">
              <input type="file" accept="application/pdf,image/*" disabled={salvando} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          {estado.responsavel === RESPONSAVEL.EMPRESA && <p className="frota-muted">Multa da empresa: o acerto sai junto e a multa encerra.</p>}
        </>
      case 'RegistrarAcerto':
        return <>
          <ChoiceGroup label="Acerto" inline>
            <Radio name={nome} label="Lancei na folha" checked={dados.acerto === 'folha'} onChange={() => setDados({ acerto: 'folha' })} />
            <Radio name={nome} label="Empresa assume" checked={dados.acerto === 'empresa'} onChange={() => setDados({ acerto: 'empresa' })} />
          </ChoiceGroup>
          {dados.acerto === 'folha' && <Field label="Mês do desconto" required><Input type="month" disabled={salvando} value={dados.competencia ?? ''} onChange={(e: { target: { value: string } }) => set({ competencia: e.target.value })} /></Field>}
          {dados.acerto === 'empresa' && (
            <Field label="Motivo" required>
              <Select aria-label="Motivo de a empresa assumir" options={MOTIVOS} placeholder="Escolha o motivo" value={dados.motivo ?? null} onChange={(v) => set({ motivo: (v ?? undefined) as DadosPasso['motivo'] })} />
            </Field>
          )}
        </>
      case 'PrazoVencido':
        return <>
          <p>O prazo para indicar era {formatBR(estado.dataParaIndicar)}. Antes de qualquer outro passo, responda:</p>
          <ChoiceGroup label="A multa foi indicada no prazo?">
            <Radio name={nome} label="Sim, foi indicada" checked={dados.indicou === true} onChange={() => setDados({ indicou: true })} />
            <Radio name={nome} label="Não: a empresa paga a guia (prazo perdido)" checked={dados.indicou === false} onChange={() => setDados({ indicou: false })} />
          </ChoiceGroup>
          {dados.indicou === true && <div className="frota-fields">{campoCanal()}{campoData('Data da indicação')}</div>}
        </>
      case 'Cancelar':
        return <Field label="Motivo do cancelamento" required><Textarea rows={3} maxLength={2000} disabled={salvando} value={dados.motivoTexto ?? ''} onChange={(e: { target: { value: string } }) => set({ motivoTexto: e.target.value })} /></Field>
      case 'Recorrer':
        return <p className="frota-muted">A multa fica em recurso até o resultado. Indeferido volta para Pagar; deferido encerra.</p>
      case 'ResultadoRecurso':
        return <ChoiceGroup label="Resultado do recurso" inline>
          <Radio name={nome} label="Deferido: a multa encerra" checked={dados.resultado === 'deferido'} onChange={() => setDados({ resultado: 'deferido' })} />
          <Radio name={nome} label="Indeferido: volta para Pagar" checked={dados.resultado === 'indeferido'} onChange={() => setDados({ resultado: 'indeferido' })} />
        </ChoiceGroup>
      default:
        return null
    }
  }

  const prazoTexto = situacao.proximoPrazo ? `${formatBR(situacao.proximoPrazo)}${urgencia === 'vencido' ? ' · vencido' : dias === 0 ? ' · hoje' : ''}` : '—'
  const lista = feitos(estado, responsavel)

  return (
    <div className="multa-passos">
      <header className="multa-topo" data-urgencia={urgencia}>
        <div className="multa-topo__id">
          <strong>{multa.titulo}</strong>
          <span>{multa.veiculo?.label || 'sem placa'} · {responsavel?.label ?? 'sem responsável'}</span>
        </div>
        <div className="multa-topo__prazo"><small>Próximo prazo</small><b>{prazoTexto}</b></div>
        {mais.length > 0 && <Menu trigger={(props) => <Button variant="ghost" size="compact" icon={<MoreHorizontal size={16} />} aria-label="Mais ações da multa" {...props} />} actions={mais} />}
      </header>

      <ol className="multa-etapas" aria-label="Etapas da multa">
        {BARRA.map((b, i) => {
          const atual = ORDEM[situacao.etapa]
          const classe = atual < 0 ? '' : i < atual ? 'done' : i === atual ? 'active' : ''
          const pulada = b.etapa === 'indicar' && estado.responsavel === RESPONSAVEL.EMPRESA
          const quando = { identificar: null, indicar: estado.aceiteEm ?? estado.dataIndicacao ?? null, pagar: estado.pagaEm ?? null, acertar: estado.acertoEm ?? null }[b.etapa]
          return (
            <li key={b.etapa} className={classe} aria-current={classe === 'active' ? 'step' : undefined}>
              <b>{i + 1}</b><span>{b.rotulo}</span>
              {classe === 'done' && <small>{pulada ? 'pulada' : quando ? formatBR(quando) : 'feito'}</small>}
            </li>
          )
        })}
      </ol>

      {passo ? (
        <section className="multa-passo" data-vencido={passo === 'PrazoVencido' ? '' : undefined} aria-labelledby={`${multa.id}-passo`}>
          <h3 id={`${multa.id}-passo`}>{passo === 'PrazoVencido' ? 'O prazo de indicação venceu' : ROTULO_PASSO[passo]}</h3>
          {campos()}
          {erro && <Alert tone="danger">{erro}</Alert>}
          <div className="frota-cluster">
            <Button variant={passo === 'Cancelar' ? 'danger' : 'primary'} loading={salvando} disabled={faltando !== null} onClick={() => void gravar()}>{BOTAO[passo]}</Button>
            {extra && <Button variant="secondary" disabled={salvando} onClick={() => setExtra(null)}>Voltar</Button>}
          </div>
        </section>
      ) : (
        <p className="frota-muted">{situacao.aguardandoPenalidade ? 'Aguardando a penalidade: a rotina do SNE grava o vencimento e o valor com desconto.' : situacao.etapa === 'cancelada' ? 'Multa cancelada.' : 'Multa encerrada. Nada a fazer.'}</p>
      )}

      {lista.length > 0 && (
        <section className="multa-feitos" aria-label="Passos feitos">
          <ul>{lista.map((linha) => <li key={linha}>{linha}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Ligar no `RegistroDrawer` (termo escondido, dados recolhidos)**

Em `apps/shell/src/pages/frota/components/RegistroDrawer.tsx`:
- troque `import { TermoMultaPanel } from './TermoMultaPanel'` por `import { MultaPassoAPasso } from './MultaPassoAPasso'` e acrescente `CANAL` ao import existente de `../data/schema`;
- no `detalhe`, troque a lista `campos` da multa por:

```ts
      ['Motorista', texto(item.motorista?.label)], ['Data da infração', dia(item.dataHora)], ['Local', texto(item.local)],
      ['Infração', infracao ? `${infracao.codigo} · ${texto(infracao.descricao)}` : 'Sem código de infração'], ['Gravidade', infracao ? label(GRAVIDADE, infracao.gravidade) : NAO_INFORMADO],
      ['Valor', brl(item.valorGuia ?? infracao?.valor ?? null)], ['Pontos na CNH', texto(infracao?.pontos)],
      ['Prazo para indicar', formatBR(item.dataParaIndicar) || NAO_INFORMADO], ['Vencimento da guia', formatBR(item.vencimento ?? null) || NAO_INFORMADO],
      ['Valor com desconto', brl(item.valorComDesconto ?? null)], ['Canal da indicação', item.canal === CANAL.SENATRAN ? 'Senatran' : item.canal === CANAL.DSV ? 'DSV Digital' : item.canal === CANAL.PREFEITURA ? 'Prefeitura' : NAO_INFORMADO],
      ['Notificação de autuação', texto(item.arquivos?.autuacao)], ['PDF da penalidade', texto(item.arquivos?.penalidade)], ['Comprovante', texto(item.arquivos?.comprovante)],
```

- apague a linha `const valorCatalogo = ...` (só o termo usava);
- troque a `<section className="frota-group" aria-labelledby={`${id}-acoes`}> ... </section>` por:

```tsx
          {multa ? (
            <section className="frota-group" aria-labelledby={`${id}-passos`}>
              <h3 id={`${id}-passos`} className="frota-group__title">Passo a passo</h3>
              <MultaPassoAPasso key={`${id}-${multa.status}`} source={source} multa={multa} data={data} onChanged={onChanged} />
            </section>
          ) : (
            <section className="frota-group" aria-labelledby={`${id}-acoes`}>
              <h3 id={`${id}-acoes`} className="frota-group__title">Ações de status</h3>
              {shareUrl && /^https?:\/\//i.test(shareUrl) && <p><a className="frota-link" href={shareUrl} target="_blank" rel="noreferrer">Abrir contrato gerado</a></p>}
              <StatusPanel
                key={`${id}-${registro.status}`}
                source={source}
                kind={kind}
                record={{ id, status: registro.status, temVeiculo: registro.veiculo !== null, temMotorista: registro.temMotorista }}
                initial={registro.initial}
                onDone={concluido}
                onReload={onChanged}
              />
            </section>
          )}
```

- apague o bloco `{multa && ( <section ... "Termo de acordo" ... </section> )}` (o termo fica escondido até a fase 3; `TermoMultaPanel.tsx` e o teste dele continuam no repositório);
- troque a `<section className="frota-group" aria-labelledby={`${id}-dados`}> ... </section>` por:

```tsx
          {(() => {
            const corpo = (
              <dl className="frota-detail">
                <dt>Veículo</dt>
                <dd>{registro.veiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(registro.veiculo!.id)}>{registro.veiculo.label || NAO_INFORMADO}</button> : NAO_INFORMADO}</dd>
                {registro.campos.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}
              </dl>
            )
            return multa ? (
              <details className="frota-group multa-dados">
                <summary className="frota-group__title">Dados e arquivos</summary>
                {corpo}
              </details>
            ) : (
              <section className="frota-group" aria-labelledby={`${id}-dados`}>
                <h3 id={`${id}-dados`} className="frota-group__title">Dados</h3>
                {corpo}
              </section>
            )
          })()}
```

- [ ] **Step 6: Estilos (tokens do Design System)**

Acrescente ao fim de `apps/shell/src/pages/frota/frota.css`:

```css
/* Passo a passo da multa (modelo visual: barra de etapas do QuoteManagementDrawer). */
.multa-passos { display: grid; gap: var(--bt-space-3); }
.multa-topo { display: flex; align-items: center; gap: var(--bt-space-3); padding: var(--bt-space-3); border: 1px solid var(--bt-color-border); border-left: var(--bt-border-width-severity) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.multa-topo[data-urgencia="atencao"] { border-left-color: var(--bt-color-warning); }
.multa-topo[data-urgencia="vencido"] { border-left-color: var(--bt-color-danger); }
.multa-topo__id { flex: 1; display: grid; min-width: 0; }
.multa-topo__id strong { font-size: var(--bt-font-size-14); color: var(--bt-color-text-primary); }
.multa-topo__id span, .multa-topo__prazo small { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.multa-topo__prazo { display: grid; text-align: right; }
.multa-topo[data-urgencia="atencao"] .multa-topo__prazo b { color: var(--bt-color-warning); }
.multa-topo[data-urgencia="vencido"] .multa-topo__prazo b { color: var(--bt-color-danger); }
.multa-etapas { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; border-bottom: 1px solid var(--bt-color-border); }
.multa-etapas li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-1-5); min-width: 0; padding: var(--bt-space-2); border-bottom: 2px solid transparent; color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-bold); }
.multa-etapas li b { display: grid; place-items: center; width: 22px; height: 22px; border: 2px solid var(--bt-color-border); border-radius: 999px; font-size: var(--bt-font-size-11); }
.multa-etapas li small { flex-basis: 100%; font-weight: var(--bt-font-weight-semibold); }
.multa-etapas li.done { color: var(--bt-color-success); }
.multa-etapas li.done b { border-color: var(--bt-color-success); background-color: var(--bt-color-success); color: var(--bt-color-white); }
.multa-etapas li.active { color: var(--bt-color-action); border-bottom-color: var(--bt-color-action); }
.multa-etapas li.active b { border-color: var(--bt-color-action); }
.multa-passo { display: grid; gap: var(--bt-space-3); padding: var(--bt-space-3); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); }
.multa-passo h3 { margin: 0; font-size: var(--bt-font-size-14); color: var(--bt-color-brand); }
.multa-passo[data-vencido] { border-color: var(--bt-color-danger); }
.multa-passo[data-vencido] h3 { color: var(--bt-color-danger); }
.multa-mensagem { width: 100%; padding: var(--bt-space-2); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-sm); font: inherit; font-size: var(--bt-font-size-13); resize: vertical; }
.multa-feitos ul { display: grid; gap: var(--bt-space-1); margin: 0; padding-left: var(--bt-space-4); font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.multa-dados summary { cursor: pointer; }
.frota-prazo[data-urgencia="atencao"] { color: var(--bt-color-warning); font-weight: var(--bt-font-weight-bold); }
.frota-prazo[data-urgencia="vencido"] { color: var(--bt-color-danger); font-weight: var(--bt-font-weight-bold); }
@media (max-width: 560px) { .multa-etapas li { padding: var(--bt-space-2) var(--bt-space-1); font-size: var(--bt-font-size-11); } .multa-topo { flex-wrap: wrap; } }
```

- [ ] **Step 7: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test -- src/pages/frota/components/MultaPassoAPasso.test.tsx src/pages/frota/components/RegistroDrawer.test.tsx`
Expected: typecheck sem erro; PASS.

- [ ] **Step 8: Prints antes e depois (mock)**

Na Betinhos-Renan, com a `develop` (antes) e com esta branch (depois), suba o shell em modo mock (`pnpm --filter @betinhos/shell dev`, porta 36472) e capture com o Playwright:
```
npx playwright screenshot --viewport-size "1280, 900" --wait-for-timeout 2500 "http://localhost:36472/#/frota-multas?registro=multa:u1" .superpowers/multas-fase1/drawer-u1-1280.png
npx playwright screenshot --viewport-size "1280, 900" --wait-for-timeout 2500 "http://localhost:36472/#/frota-multas?registro=multa:u5" .superpowers/multas-fase1/drawer-u5-vencido-1280.png
npx playwright screenshot --viewport-size "375, 812" --wait-for-timeout 2500 "http://localhost:36472/#/frota-multas?registro=multa:u2" .superpowers/multas-fase1/drawer-u2-375.png
```
No "antes", salve com sufixo `-antes`. Traga os PNGs para esta máquina e mostre no chat. Os prints não vão para o repositório.

- [ ] **Step 9: Commit**

```bash
git add apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx apps/shell/src/pages/frota/components/MultaPassoAPasso.test.tsx apps/shell/src/pages/frota/components/RegistroDrawer.tsx apps/shell/src/pages/frota/components/RegistroDrawer.test.tsx apps/shell/src/pages/frota/domain/multaEstado.ts apps/shell/src/pages/frota/frota.css
git commit -m "feat(multas): drawer passo a passo com prazo vencido, mensagem do WhatsApp e termo escondido"
```

---

### Task 14: Lista de multas (colunas e visões)

**Files:**
- Modify: `apps/shell/src/pages/frota/domain/linhas.ts`, `apps/shell/src/pages/frota/domain/listas.ts`, `apps/shell/src/pages/frota/views/Registros.tsx`
- Test: `apps/shell/src/pages/frota/domain/listas.test.ts`, `apps/shell/src/pages/frota/views/Registros.test.tsx`

**Interfaces:**
- Consumes: `situacaoDaMulta`, `responsavelDaMulta`, `urgenciaDoPrazo` (Tasks 11 e 13); `Situacao` (Task 3).
- Produces: `Linha` ganha `proximoPasso?: string`, `proximoPrazo?: string | null`, `situacoes?: string[]`; `filasDaMulta(s: Situacao): string[]` (valores `comigo`, `prazo-vencido`, `aguardando-penalidade`, `aguardando-acerto`, `encerradas`); `linhas(kind, data, hoje = todaySP())`; em `listas.ts`: `SITUACAO_OPCOES`, `MULTA_FILTROS_PADRAO`, `MULTA_VISAO_PADRAO = 'Comigo'`, colunas e visões novas da multa.

- [ ] **Step 1: Escrever os testes (falham)**

Em `apps/shell/src/pages/frota/domain/listas.test.ts`: troque `import { readRegistro, registroBuiltins, registroColumns } from './listas'` por `import { MULTA_FILTROS_PADRAO, MULTA_VISAO_PADRAO, readRegistro, registroBuiltins, registroColumns } from './listas'`, tire o import de `brl` (`../data/format`) e troque o `describe('termo na lista de multas (v2)', ...)` inteiro por:

```ts
describe('lista de multas (fase 1)', () => {
  const hoje = '2026-11-17'
  const base = data.multas[0]
  const comEtapas: FrotaData = {
    ...data,
    multas: [
      { ...base, id: 'a', dataParaIndicar: '2026-11-10' },
      { ...base, id: 'b', status: 202410001 },
      { ...base, id: 'c', status: 202410006 },
      { ...base, id: 'd', status: 202410005 },
      { ...base, id: 'e', status: 202410001, vencimento: '2026-11-20', responsavel: 100000001 },
    ],
  }

  it('colunas: auto, data, placa, responsável, etapa, próximo passo e próximo prazo', () => {
    expect(registroColumns('multa').map((c) => c.label)).toEqual(['Auto', 'Data', 'Placa', 'Responsável', 'Etapa', 'Próximo passo', 'Próximo prazo'])
    expect(registroColumns('manutencao').map((c) => c.key)).not.toContain('termo')
  })

  it('linhas com responsável, próximo passo, próximo prazo e filas', () => {
    const porId = Object.fromEntries(linhas('multa', comEtapas, hoje).map((l) => [l.id, l]))
    expect(porId.a).toMatchObject({ proximoPasso: 'Prazo vencido: responder', proximoPrazo: '2026-11-10', situacoes: ['comigo', 'prazo-vencido'] })
    expect(porId.b.situacoes).toEqual(['aguardando-penalidade'])
    expect(porId.c.situacoes).toEqual(['comigo', 'aguardando-acerto'])
    expect(porId.d.situacoes).toEqual(['encerradas'])
    expect(porId.e.pessoa).toEqual({ id: 'empresa', label: 'Empresa' })
    expect(porId.e.proximoPrazo).toBe('2026-11-20')
    expect(readRegistro(porId.a, 'situacao')).toEqual(['comigo', 'prazo-vencido'])
  })

  it('visões: Comigo é a padrão; depois Prazo vencido, Aguardando penalidade, Aguardando acerto, Encerradas e canceladas, Todas', () => {
    expect(MULTA_VISAO_PADRAO).toBe('Comigo')
    expect(MULTA_FILTROS_PADRAO.advanced.items).toMatchObject([{ field: 'situacao', op: 'in', values: [{ value: 'comigo' }] }])
    expect(registroBuiltins('multa').map((v) => v.name)).toEqual(['Prazo vencido', 'Aguardando penalidade', 'Aguardando acerto', 'Encerradas e canceladas', 'Todas'])
  })
})
```

Em `apps/shell/src/pages/frota/views/Registros.test.tsx`, apague os testes `'sem o resumo dos termos (falha na leitura), a lista avisa discretamente'` e `'multas mostram a coluna Termo com o rótulo do último termo'` e acrescente:

```tsx
  it('multas abrem na visão Comigo, sem a coluna Termo', async () => {
    window.location.hash = '#/frota-multas'
    const lista: FrotaData = { ...EMPTY_DATA, multas: [{ ...multa('m1', 'v1'), status: 202410000 }, { ...multa('m2', 'v1'), status: 202410005 }] }
    render(<Registros kinds={['multa']} data={lista} source={source} onOpen={() => {}} onReload={() => {}} />)
    expect(await screen.findByText('Multa m1')).toBeTruthy()
    expect(screen.queryByText('Multa m2')).toBeNull()
    expect(screen.getAllByText('Próximo passo').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Coluna Termo/)).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/frota/domain/listas.test.ts src/pages/frota/views/Registros.test.tsx`
Expected: FAIL (`MULTA_FILTROS_PADRAO` não exportado; colunas antigas; m2 aparece).

- [ ] **Step 3: `linhas.ts`**

Troque o arquivo inteiro por:

```ts
import { diaSP, todaySP } from '../data/dates'
import { brl } from '../data/format'
import { GRAU, label } from '../data/schema'
import type { FrotaData, Kind, Ref, TermoStatus } from '../data/types'
import { responsavelDaMulta, situacaoDaMulta } from './multaEstado'
import type { Situacao } from './multaEtapas'

export type Linha = {
  kind: Kind; id: string; titulo: string; veiculo: Ref | null; pessoa: Ref | null; status: number | null; dia: string | null; extra: string; categorias: number[]
  termo: string; termoStatus: TermoStatus | null; termoIndisponivel?: boolean
  /** Só multa (fase 1): próximo passo, próximo prazo e filas das visões. */
  proximoPasso?: string; proximoPrazo?: string | null; situacoes?: string[]
}

/** Filas das visões da lista de multas (spec §7). Uma multa pode estar em mais de uma: Comigo e Prazo vencido, por exemplo. */
export function filasDaMulta(s: Situacao): string[] {
  const filas: string[] = []
  if (s.pendentes.length) filas.push('comigo')
  if (s.prazoVencido) filas.push('prazo-vencido')
  if (s.aguardandoPenalidade) filas.push('aguardando-penalidade')
  if (s.etapa === 'acertar') filas.push('aguardando-acerto')
  if (s.etapa === 'encerrada' || s.etapa === 'cancelada') filas.push('encerradas')
  return filas
}

export function linhas(kind: Kind, data: FrotaData, hoje = todaySP()): Linha[] {
  const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
  const result: Linha[] =
    kind === 'manutencao'
      ? data.manutencoes.map((item) => ({ kind, id: item.id, titulo: item.descricao, veiculo: item.veiculo, pessoa: item.solicitante, status: item.status, dia: diaSP(item.dataManutencao ?? item.criadoEm), extra: item.valor !== null ? brl(item.valor) : label(GRAU, item.grau), categorias: item.categorias, termo: '', termoStatus: null }))
      : kind === 'multa'
        ? data.multas.map((item) => {
          const s = situacaoDaMulta(item, hoje)
          return { kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: responsavelDaMulta(item), status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: valorMulta(item.valorGuia, item.infracaoId ? infracoes.get(item.infracaoId)?.valor ?? null : null, item.infracaoId), categorias: [], termo: '', termoStatus: null, proximoPasso: s.proximoPasso, proximoPrazo: s.proximoPrazo, situacoes: filasDaMulta(s) }
        })
        : data.colisoes.map((item) => ({ kind, id: item.id, titulo: item.titulo, veiculo: item.veiculo, pessoa: item.motorista, status: item.status, dia: diaSP(item.dataHora ?? item.criadoEm), extra: item.houveTerceiro ? 'Com terceiro' : 'Sem terceiro', categorias: [], termo: '', termoStatus: null }))
  return result.sort((a, b) => (b.dia ?? '').localeCompare(a.dia ?? ''))
}

/** Valor da multa: o da guia vale mais que o do catálogo de infrações. */
function valorMulta(valorGuia: number | null, catalogo: number | null, infracaoId: string | null) {
  if (valorGuia !== null) return brl(valorGuia)
  return infracaoId ? brl(catalogo) : 'Sem código de infração'
}
```

- [ ] **Step 4: `listas.ts`**

- tire `import { TERMO_ROTULO } from './termoMulta'` e a constante `TERMO_OPCOES`, e tire `MULTA` do import de `../data/schema` (a visão "A notificar" sai; ele fica sem uso);
- troque a linha de `PESSOA` por `export const PESSOA: Record<Kind, string> = { manutencao: 'Solicitante', multa: 'Responsável', colisao: 'Motorista' }`;
- troque `registroColumns` por:

```ts
/** Colunas na ordem padrão; a primeira (Descrição ou Auto) é fixa. */
export const registroColumns = (kind: Kind): ViewColumnDef[] => kind === 'multa'
  ? [
    { key: 'descricao', label: 'Auto' }, { key: 'data', label: 'Data' }, { key: 'veiculo', label: 'Placa' }, { key: 'pessoa', label: 'Responsável' },
    { key: 'status', label: 'Etapa' }, { key: 'proximoPasso', label: 'Próximo passo' }, { key: 'proximoPrazo', label: 'Próximo prazo' },
  ]
  : [
    { key: 'descricao', label: 'Descrição' }, { key: 'data', label: 'Data' }, { key: 'veiculo', label: 'Veículo' }, { key: 'pessoa', label: PESSOA[kind] },
    { key: 'extra', label: EXTRA[kind] }, { key: 'status', label: 'Status' },
  ]

export const SITUACAO_OPCOES: FilterOption[] = [
  { value: 'comigo', label: 'Com passo a dar' }, { value: 'prazo-vencido', label: 'Prazo vencido' }, { value: 'aguardando-penalidade', label: 'Aguardando penalidade' },
  { value: 'aguardando-acerto', label: 'Aguardando acerto' }, { value: 'encerradas', label: 'Encerradas e canceladas' },
]
const filaMulta = (valor: string): TableFilters => {
  const filtros = emptyFilters()
  filtros.advanced.items.push({ type: 'condition', id: `situacao-${valor}`, field: 'situacao', op: 'in', values: SITUACAO_OPCOES.filter((o) => o.value === valor) })
  return filtros
}
/** Visão padrão da lista de multas ("Comigo"): o que tem passo a dar. */
export const MULTA_VISAO_PADRAO = 'Comigo'
export const MULTA_FILTROS_PADRAO = filaMulta('comigo')
```

- troque `registroFields` por:

```ts
export function registroFields(kind: Kind, opcoes: { veiculos: FilterOption[]; pessoas: FilterOption[] }): FilterField[] {
  if (kind === 'multa') {
    return [
      { key: 'descricao', label: 'Auto', kind: 'text' },
      { key: 'data', label: 'Data', kind: 'date' },
      { key: 'veiculo', label: 'Placa', kind: 'choice', options: opcoes.veiculos },
      { key: 'pessoa', label: 'Responsável', kind: 'choice', options: opcoes.pessoas },
      { key: 'status', label: 'Etapa', kind: 'choice', options: options(STATUS_OPTIONS.multa) },
      { key: 'proximoPasso', label: 'Próximo passo', kind: 'text' },
      { key: 'proximoPrazo', label: 'Próximo prazo', kind: 'date' },
      { key: 'situacao', label: 'Situação', kind: 'choice', options: SITUACAO_OPCOES, advancedOnly: true },
    ]
  }
  return [
    { key: 'descricao', label: 'Descrição', kind: 'text' },
    { key: 'data', label: 'Data', kind: 'date' },
    { key: 'veiculo', label: 'Veículo', kind: 'choice', options: opcoes.veiculos },
    { key: 'pessoa', label: PESSOA[kind], kind: 'choice', options: opcoes.pessoas },
    { key: 'extra', label: EXTRA[kind], kind: 'text' },
    { key: 'status', label: 'Status', kind: 'choice', options: options(STATUS_OPTIONS[kind]) },
    ...(kind === 'manutencao' ? [{ key: 'categoria', label: 'Categoria', kind: 'choice' as const, options: options(CATEGORIAS_MANUT), advancedOnly: true }] : []),
  ]
}
```

- em `readRegistro`, troque `case 'termo': return l.termoStatus` por:

```ts
    case 'proximoPasso': return l.proximoPasso ?? null
    case 'proximoPrazo': return l.proximoPrazo ?? null
    case 'situacao': return l.situacoes ?? []
```

- em `sortRegistros`, troque `case 'termo': return l.termo || null` por:

```ts
      case 'proximoPasso': return l.proximoPasso ?? null
      case 'proximoPrazo': return l.proximoPrazo ?? null
```

- em `registroBuiltins`, troque as linhas `const termo = ...` e `if (kind === 'multa') return [...]` por:

```ts
  if (kind === 'multa') return [
    view('prazo-vencido', 'Prazo vencido', 1, filaMulta('prazo-vencido')),
    view('aguardando-penalidade', 'Aguardando penalidade', 2, filaMulta('aguardando-penalidade')),
    view('aguardando-acerto', 'Aguardando acerto', 3, filaMulta('aguardando-acerto')),
    view('encerradas', 'Encerradas e canceladas', 4, filaMulta('encerradas')),
    view('todas', 'Todas', 5, emptyFilters()),
  ]
```

- [ ] **Step 5: `Registros.tsx`**

- troque `import { TERMO_TOM } from '../domain/termoMulta'` por `import { urgenciaDoPrazo } from '../domain/multaEstado'`, `import { formatBR } from '../data/dates'` por `import { formatBR, todaySP } from '../data/dates'`, inclua `MULTA_FILTROS_PADRAO, MULTA_VISAO_PADRAO` no import de `../domain/listas` e tire `StatusBadge as Badge` do import de `@betinhos/ui` se não sobrar uso;
- no `useListView({...})`, depois de `defaultSort: REGISTRO_SORT,`, acrescente:

```ts
    defaultFilters: kind === 'multa' ? MULTA_FILTROS_PADRAO : undefined,
    defaultName: kind === 'multa' ? MULTA_VISAO_PADRAO : undefined,
```

- troque `const footer = ...` por `const footer = <span className="frota-muted">{visiveis.length} de {todas.length}</span>`;
- antes de `const table = ...`, acrescente `const titulo = (key: string) => columns.find((c) => c.key === key)?.label ?? key` e `const hoje = todaySP()`;
- troque a lista `columns={[ ... ]}` da `VirtualTable` por:

```tsx
      columns={[
        { key: 'descricao', header: titulo('descricao'), label: titulo('descricao'), sortable: true, defaultWidth: 300, width: 'minmax(180px, 2fr)', cell: (linha) => <TableTitle title={linha.titulo} meta={linha.categorias.length > 0 ? categoriasTexto(linha.categorias) : undefined} /> },
        { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 120, width: 'minmax(92px, .6fr)', cell: (linha) => <span className="frota-nowrap">{formatBR(linha.dia)}</span> },
        { key: 'veiculo', header: titulo('veiculo'), label: titulo('veiculo'), sortable: true, defaultWidth: 120, width: 'minmax(90px, .7fr)', hideBelow: 'mobile', cell: (linha) => <span className="frota-nowrap">{linha.veiculo?.label || '—'}</span> },
        { key: 'pessoa', header: PESSOA[kind], label: PESSOA[kind], sortable: true, defaultWidth: 190, hideBelow: 'mobile', cell: (linha) => linha.pessoa?.label || '—' },
        ...(kind === 'multa' ? [] : [{ key: 'extra', header: EXTRA[kind], label: EXTRA[kind], defaultWidth: 160, hideBelow: 'compact' as const, cell: (linha: Linha) => <span className="frota-nowrap">{linha.extra}</span> }]),
        { key: 'status', header: titulo('status'), label: titulo('status'), sortable: true, defaultWidth: 180, width: 'minmax(110px, .8fr)', cell: (linha) => <StatusBadge kind={linha.kind} value={linha.status} /> },
        ...(kind === 'multa' ? [
          { key: 'proximoPasso', header: 'Próximo passo', label: 'Próximo passo', sortable: true, defaultWidth: 220, width: 'minmax(140px, 1fr)', hideBelow: 'compact' as const, cell: (linha: Linha) => linha.proximoPasso || '—' },
          { key: 'proximoPrazo', header: 'Próximo prazo', label: 'Próximo prazo', sortable: true, defaultWidth: 140, width: 'minmax(100px, .7fr)', cell: (linha: Linha) => (linha.proximoPrazo
            ? <span className="frota-prazo frota-nowrap" data-urgencia={urgenciaDoPrazo(linha.proximoPrazo, (linha.situacoes ?? []).includes('prazo-vencido'), hoje)}>{formatBR(linha.proximoPrazo)}</span>
            : <span className="frota-muted">—</span>) },
        ] : []),
      ]}
```

- [ ] **Step 6: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test -- src/pages/frota/domain src/pages/frota/views`
Expected: typecheck sem erro; PASS.

- [ ] **Step 7: Prints da lista (antes e depois)**

Na Betinhos-Renan, com o shell em mock no ar como na Task 13:
```
npx playwright screenshot --viewport-size "1280, 900" --wait-for-timeout 2500 "http://localhost:36472/#/frota-multas" .superpowers/multas-fase1/lista-1280.png
npx playwright screenshot --viewport-size "375, 812" --wait-for-timeout 2500 "http://localhost:36472/#/frota-multas" .superpowers/multas-fase1/lista-375.png
```
Traga e mostre no chat (o "antes" com sufixo `-antes`).

- [ ] **Step 8: Commit**

```bash
git add apps/shell/src/pages/frota/domain/linhas.ts apps/shell/src/pages/frota/domain/listas.ts apps/shell/src/pages/frota/domain/listas.test.ts apps/shell/src/pages/frota/views/Registros.tsx apps/shell/src/pages/frota/views/Registros.test.tsx
git commit -m "feat(multas): lista com responsável, etapa, próximo passo e prazo e visões Comigo, Prazo vencido e acerto"
```

---
### Task 15: Planner: "Abrir multa" e conclusão bloqueada

**Files:**
- Create: `apps/shell/src/pages/planner/domain/multaTaskFlow.ts`
- Test: `apps/shell/src/pages/planner/domain/multaTaskFlow.test.ts`, `apps/shell/src/pages/planner/PlannerPage.test.tsx`
- Modify: `apps/shell/src/pages/planner/domain/types.ts:137` (campos da tarefa), `apps/shell/src/pages/planner/data/dataverse.ts:396,658-697,1468-1520,1960-1967`, `apps/shell/src/pages/planner/data/mock.ts:289-300,324-345,654-657`, `apps/shell/src/pages/planner/components/TaskDrawer.tsx:4,17,65,187-194,537-551,554-556`

**Interfaces:**
- Consumes: `MULTA` (frota `schema.ts`); lookup `cr40f_plannertarefa.cr40f_multa` e origem 100000003 (Task 1); tarefas criadas pelo plugin (Task 6).
- Produces: `MULTA_TASK_DONE_BLOCKED = 'A tarefa fecha sozinha quando a multa for encerrada.'`, `isMultaTask(task)`, `multaFechada(status)`, `multaHref(multaId)`; `Task.multaId?: string | null`, `Task.multaCode?: string`; origem `multa` → 100000003.

- [ ] **Step 1: Escrever os testes (falham)**

`apps/shell/src/pages/planner/domain/multaTaskFlow.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { loadState, updateTask } from '../data/mock'
import { isMultaTask, multaFechada, multaHref, MULTA_TASK_DONE_BLOCKED } from './multaTaskFlow'

afterEach(() => localStorage.clear())

describe('tarefa de multa no Planner', () => {
  it('reconhece pelo lookup ou pela origem', () => {
    expect(isMultaTask({ multaId: 'u1' })).toBe(true)
    expect(isMultaTask({ sourceType: 'multa' })).toBe(true)
    expect(isMultaTask({ sourceType: 'quote' })).toBe(false)
  })

  it('link da multa no shell', () => {
    expect(multaHref('{AB-12}')).toBe('#/frota-multas?registro=multa:ab-12')
  })

  it('multa fechada: Encerrada, Descontado e Cancelada', () => {
    expect([202410005, 202410003, 202410007].every(multaFechada)).toBe(true)
    expect(multaFechada(202410006)).toBe(false)
    expect(multaFechada(null)).toBe(false)
  })

  it('no mock, concluir à mão a tarefa da multa é recusado', () => {
    expect(() => updateTask(loadState(), 'task-multa-1', { status: 'done' })).toThrow(MULTA_TASK_DONE_BLOCKED)
  })
})
```

Acrescente ao `describe` de `apps/shell/src/pages/planner/PlannerPage.test.tsx` (inclua `fireEvent` no import de `@testing-library/react`):

```tsx
  it('tarefa de multa tem "Abrir multa", que leva para a multa na Frota', async () => {
    history.replaceState(null, '', '#/planner?taskId=task-multa-1')
    render(<PlannerPage />)
    const abrir = await screen.findByRole('button', { name: /Abrir multa/ }, { timeout: 10_000 })
    fireEvent.click(abrir)
    expect(window.location.hash).toBe('#/frota-multas?registro=multa:u1')
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/planner/domain/multaTaskFlow.test.ts src/pages/planner/PlannerPage.test.tsx`
Expected: FAIL ("Failed to resolve import './multaTaskFlow'"; botão "Abrir multa" não encontrado).

- [ ] **Step 3: `multaTaskFlow.ts`**

```ts
import { MULTA } from '../../frota/data/schema'

/** Mesmo padrão de QUOTE_TASK_DONE_BLOCKED: a tarefa da multa é fechada pelo plugin da frota (MultaTarefa), nunca à mão. */
export const MULTA_TASK_DONE_BLOCKED = 'A tarefa fecha sozinha quando a multa for encerrada.'

const FECHADA: ReadonlySet<number> = new Set([MULTA.FINALIZADO, MULTA.DESCONTADO, MULTA.CANCELADA])

export function isMultaTask(task: { multaId?: unknown; sourceType?: unknown } = {}): boolean {
  return Boolean(task.multaId || task.sourceType === 'multa')
}

export const multaFechada = (status: unknown): boolean => typeof status === 'number' && FECHADA.has(status)

export const multaHref = (multaId: string) => `#/frota-multas?registro=multa:${String(multaId).replace(/[{}]/g, '').toLowerCase()}`
```

- [ ] **Step 4: Tipos e Dataverse**

`apps/shell/src/pages/planner/domain/types.ts`: depois de `quoteStatus?: string` (dentro do tipo da tarefa, perto da linha 141) acrescente:

```ts
  /** Multa que gerou a tarefa (cr40f_multa, plugin da frota). */
  multaId?: string | null
  multaCode?: string
```

`apps/shell/src/pages/planner/data/dataverse.ts`:
- `import { isMultaTask, multaFechada, MULTA_TASK_DONE_BLOCKED } from "../domain/multaTaskFlow";` junto dos outros imports de `../domain`;
- troque `const ORIGIN_VALUES: Record<string, number> = { manual: 100000000, quote: 100000001, quality: 100000002 };` por `const ORIGIN_VALUES: Record<string, number> = { manual: 100000000, quote: 100000001, quality: 100000002, multa: 100000003 };`;
- troque a assinatura `function plannerTaskQuery(includeTeamLookup = true, includeWaitingContext = true) {` por `function plannerTaskQuery(includeTeamLookup = true, includeWaitingContext = true, includeMulta = false) {` e, na lista `fields`, depois de `"_cr40f_acaooperacional_value",`, acrescente `...(includeMulta ? ["_cr40f_multa_value"] : []),`;
- troque o início de `retrievePlannerTasks` por (o resto da função fica igual):

```ts
async function retrievePlannerTasks(xrm: PlannerXrm): Promise<Row[]> {
  try {
    return await retrieveMany(xrm, TASK_TABLE, plannerTaskQuery(true, true, true));
  } catch (multaError) {
    console.warn("[Planner] lookup da multa indisponível; carregando tarefas sem ele", multaError);
  }
  try {
    return await retrieveMany(xrm, TASK_TABLE, plannerTaskQuery(true));
```

- em `normalizeTask`, depois de `quoteTitle: s(row.quoteTitle),` acrescente:

```ts
    multaId: s(row._cr40f_multa_value) || null,
    multaCode: s(row["_cr40f_multa_value@OData.Community.Display.V1.FormattedValue"]),
```

  troque `sourceId: s(row._cr40f_pedidocotacao_value || row._cr40f_errooperacional_value || row._cr40f_acaooperacional_value) || null,` por `sourceId: s(row._cr40f_pedidocotacao_value || row._cr40f_errooperacional_value || row._cr40f_acaooperacional_value || row._cr40f_multa_value) || null,` e a linha `sourceLabel: ...` por `sourceLabel: origin === "quote" ? "Pedido de cotação" : origin === "quality" ? "Qualidade" : origin === "multa" ? "Multa" : "Tarefa manual",`;
- em `updateLiveTask`, logo depois da linha `if (quoteTask && !patch.suppressQuoteSync && patch.status === "done" && !isQuoteTerminalStatus(quote.status)) throw new Error(QUOTE_TASK_DONE_BLOCKED);`, acrescente:

```ts
  if (existing && isMultaTask(existing) && existing.multaId && patch.status === "done" && existing.status !== "done") {
    const multa = asRecord(await request(xrm, `/cr40f_multases(${cleanId(existing.multaId)})?$select=cr40f_status`));
    if (!multaFechada(multa?.cr40f_status)) throw new Error(MULTA_TASK_DONE_BLOCKED);
  }
```

- [ ] **Step 5: Mock do Planner**

`apps/shell/src/pages/planner/data/mock.ts`:
- acrescente `import { isMultaTask, MULTA_TASK_DONE_BLOCKED } from '../domain/multaTaskFlow'`;
- em `interface SeedContext`, acrescente `multaId?: string` e `multaCode?: string`;
- na lista `const tasks: MockTask[] = [`, acrescente como último item:

```ts
    task('task-multa-1', 'Multa AIT fictício u1 · TST1A11 · Definir o responsável', null, 'MULTA:u1', 'AIT fictício u1', 'todo', 'urgent', 'Rafael Lima', 'Operação', dateFromToday(5), 'Multa AIT fictício u1 · TST1A11.\nAbrir no Sistema Betinhos: #/frota-multas?registro=multa:u1', null, { sourceType: 'multa', sourceId: 'u1', sourceLabel: 'Multa', sourceCode: 'MULTA:u1', multaId: 'u1', multaCode: 'AIT fictício u1', checklist: [{ id: 'multa-definir-responsavel', title: 'Definir o responsável', done: false }] }),
```

- em `updateTask`, logo depois da linha `if (quoteTask && patch.status === 'done' && !isQuoteTerminalStatus(quote?.status)) throw new Error(QUOTE_TASK_DONE_BLOCKED)`, acrescente:

```ts
  // No mock a multa está sempre aberta: a tarefa dela nunca conclui à mão.
  if (existing && isMultaTask(existing) && patch.status === 'done' && existing.status !== 'done') throw new Error(MULTA_TASK_DONE_BLOCKED)
```

Se o tipo `MockChecklistItem` exigir outros campos, copie o formato de um item de checklist já existente no seed.

- [ ] **Step 6: `TaskDrawer.tsx`**

- acrescente `import { isMultaTask, MULTA_TASK_DONE_BLOCKED, multaHref } from '../domain/multaTaskFlow'` depois do import de `quoteTaskFlow` e `AlertTriangle` ao import de `lucide-react`;
- depois de `const [showQuoteCompletionPrompt, setShowQuoteCompletionPrompt] = useState<any>(false);` acrescente `const [multaBloqueada, setMultaBloqueada] = useState(false);`;
- em `setTaskStatus`, antes do `if (value === "done" && ... isQuoteTask(taskItem) ...)`, acrescente:

```ts
    if (value === "done" && taskItem.status !== "done" && isMultaTask(taskItem)) {
      setMultaBloqueada(true);
      return;
    }
    setMultaBloqueada(false);
```

- logo depois do bloco `{taskItem.quoteId && ( <button className="linked-record" ...> ... </button> )}`, acrescente:

```tsx
          {taskItem.multaId && (
            <button
              className="linked-record"
              aria-label={`Abrir multa ${taskItem.multaCode || ""}`.trim()}
              onClick={() => { window.location.hash = multaHref(taskItem.multaId); }}
            >
              <AlertTriangle size={16} />
              <span>
                <small>Abrir multa</small>
                <strong>{taskItem.multaCode || taskItem.sourceCode}</strong>
              </span>
              <ArrowUpRight size={15} />
            </button>
          )}
```

- dentro de `<div className="status-field">`, logo depois de `<StatusPicker value={form.status} onChange={setTaskStatus} />`, acrescente `{multaBloqueada && <p className="empty-inline" role="alert">{MULTA_TASK_DONE_BLOCKED}</p>}`.

- [ ] **Step 7: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test -- src/pages/planner`
Expected: typecheck sem erro; PASS (inclui `uiContracts.test.ts` e os testes de cotação já existentes).

- [ ] **Step 8: Print da tarefa no Planner (mock)**

Na Betinhos-Renan, com o shell em mock no ar: `npx playwright screenshot --viewport-size "1280, 900" --wait-for-timeout 3000 "http://localhost:36472/#/planner?taskId=task-multa-1" .superpowers/multas-fase1/planner-tarefa-1280.png`. Traga e mostre no chat.

- [ ] **Step 9: Commit**

```bash
git add apps/shell/src/pages/planner
git commit -m "feat(multas): tarefa do Planner abre a multa e não conclui à mão com a multa aberta"
```

---

### Task 16: Ficha do funcionário (aba Multas e e-mail diário)

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/data/types.ts:28-35`, `apps/shell/src/pages/funcionarios/data/dataverse.ts:207-218`, `apps/shell/src/pages/funcionarios/data/mock.ts:40,161`, `apps/shell/src/pages/funcionarios/components/RelatedTabs.tsx:1-55`, `apps/shell/src/pages/funcionarios/data/schema.ts` (`FIELDS`)
- Test: `apps/shell/src/pages/funcionarios/components/RelatedTabs.test.tsx`

**Interfaces:**
- Consumes: `MULTA_STATUS` (= `STATUS_OPTIONS.multa`, Task 10), `TONE` (frota `schema.ts`), `hrefFor` (`nav/useHashRoute.ts`).
- Produces: `funcionarios` `Multa.status: number | null`; aba Multas com a etapa e o link `#/frota-multas?registro=multa%3A<id>` (o mesmo drawer da Frota); campo `cr40f_recebeemailmultas` ("E-mail diário de multas") na ficha.

- [ ] **Step 1: Escrever o teste (falha)**

Acrescente a `apps/shell/src/pages/funcionarios/components/RelatedTabs.test.tsx` (inclua `MultasTab` no import de `./RelatedTabs`):

```tsx
describe('aba Multas', () => {
  it('mostra a etapa e abre a multa no drawer da Frota', async () => {
    const multas = vi.fn(async () => [{ id: 'x1', titulo: 'Excesso de velocidade', status: 202410001, dataHora: '2026-11-10T16:00:00Z', placa: 'TST1A11', local: 'Rod. de Teste km 10' }])
    render(<MultasTab source={{ multas } as unknown as DataSource} id="f1" />)
    expect(await screen.findByText('3. Pagar')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Abrir multa Excesso de velocidade' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#/frota-multas?registro=multa%3Ax1')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell test -- src/pages/funcionarios/components/RelatedTabs.test.tsx`
Expected: FAIL (o texto "3. Pagar" não aparece; o botão ainda abre o formulário nativo).

- [ ] **Step 3: Implementar**

`apps/shell/src/pages/funcionarios/data/types.ts`: no tipo `Multa`, troque `status: string` por `status: number | null`.

`apps/shell/src/pages/funcionarios/data/dataverse.ts`, em `multas(id)`: troque `status: String(row[`cr40f_status${FORMATTED}`] ?? ''),` por `status: typeof row.cr40f_status === 'number' ? row.cr40f_status : null,`.

`apps/shell/src/pages/funcionarios/data/mock.ts`, linha 161: troque `status: 'Indicada'` por `status: 202410001`; na linha 40 (dados do funcionário fictício), acrescente `cr40f_recebeemailmultas: false,` junto de `new_notificacoesfrota: false,`.

`apps/shell/src/pages/funcionarios/data/schema.ts`, em `FIELDS`, logo depois da linha de `new_notificacoesfrota`, acrescente:

```ts
  { key: 'cr40f_recebeemailmultas', label: 'E-mail diário de multas', kind: 'bool', group: 'detalhes', hint: 'Recebe o e-mail "Multas de hoje" (dias úteis, 07:00).' },
```

`apps/shell/src/pages/funcionarios/components/RelatedTabs.tsx`: acrescente `import { TONE } from '../../frota/data/schema'` e `import { MULTA_STATUS, optionLabel } from '../data/schema'`, e troque o `MultasTab` por:

```tsx
export function MultasTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.multas(id), [source, id])
  const { data, loading, error } = useLoad<Multa[]>(load)
  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!data?.length} />
      <ul className="cards">
        {data?.map((multa) => {
          // O mesmo drawer passo a passo da Frota.
          const href = hrefFor('frota-multas', { registro: `multa:${multa.id}` })
          return (
            <li key={multa.id} className="card">
              <div className="card-main">
                <a className="link" href={href} aria-label={`Abrir multa ${multa.titulo}`}>{multa.titulo}</a>
                <span className="muted">{fmt(multa.dataHora)} · {multa.placa || 'sem placa'}{multa.local && ` · ${multa.local}`}</span>
              </div>
              <StatusBadge tone={multa.status !== null ? TONE.multa[multa.status] ?? 'neutral' : 'neutral'}>{optionLabel(MULTA_STATUS, multa.status) || '—'}</StatusBadge>
              <a className={buttonClassName({ variant: 'ghost', size: 'compact', iconOnly: true })} href={href} tabIndex={-1} aria-hidden="true"><ChevronRight size={16} aria-hidden /></a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

Se `ExternalLink` ficar sem uso no arquivo, tire-o do import de `lucide-react`.

- [ ] **Step 4: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test -- src/pages/funcionarios`
Expected: typecheck sem erro; PASS. Se algum teste da ficha contar os campos de "Detalhes", ajuste a contagem esperada em +1 (campo novo `cr40f_recebeemailmultas`).

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/funcionarios
git commit -m "feat(multas): aba Multas da ficha mostra a etapa e abre o passo a passo; ficha ganha o e-mail diário"
```

---

### Task 17: E-mail diário "Multas | Multas de hoje" (flow novo)

**Files:**
- Create: `packages/deploy/flows/multas-do-dia.json`
- Create: `packages/deploy/flows/multas-do-dia.test.mjs`
- Create: `packages/deploy/provision-flow-multas-do-dia.ps1`
- Modify: `packages/deploy/flows-dev.mjs` (entrada nova), `packages/deploy/flows-dev.test.mjs:60-66`, `packages/deploy/package.json:7`

**Interfaces:**
- Consumes: Custom API `cr40f_MultasDoDia` (Task 7, JSON `{hoje,total,prazoVencido,indicar,aceite,pagar,aguardandoAcerto}`); coluna `cr40f_recebeemailmultas` (Task 1); variáveis `new_URLSistemaBetinhos` e `new_EmailAdminAvisos` (já existem, de `provision-flow-documentos-resumo.ps1`).
- Produces: flow "Multas | Multas de hoje" (dias úteis 07:00, Brasília); entrada `multas-do-dia` em `flows-dev.mjs` com `args: [['Remetente', 'FLOW_FROTA_REMETENTE']]` (o mesmo remetente do resumo da frota; sem variável nova no GitHub).

- [ ] **Step 1: Escrever o teste do JSON (falha: arquivo não existe)**

`packages/deploy/flows/multas-do-dia.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./multas-do-dia.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const tem = flow.actions.Try.actions.Tem_itens

test('dias úteis às 07:00 no horário de Brasília', () => {
  const r = flow.triggers.Dias_uteis_7h.recurrence
  assert.equal(r.frequency, 'Week')
  assert.equal(r.interval, 1)
  assert.equal(r.timeZone, 'E. South America Standard Time')
  assert.deepEqual(r.schedule, { weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], hours: ['7'], minutes: [0] })
})

test('lê a Custom API cr40f_MultasDoDia e só envia com itens', () => {
  const api = flow.actions.Try.actions.Multas_do_dia
  assert.equal(api.inputs.host.operationId, 'PerformUnboundAction')
  assert.equal(api.inputs.parameters.actionName, 'cr40f_MultasDoDia')
  assert.deepEqual(tem.expression, { and: [{ greater: ["@int(outputs('Dados')?['total'])", 0] }] })
  assert.deepEqual(tem.else.actions, {})
})

test('seções na ordem da spec, cada linha com auto, placa, responsável, prazo, passo e link da multa', () => {
  const corpo = tem.actions.Corpo.inputs
  const ordem = ['1. Prazo vencido: responda', '2. Indicar em até 7 dias', '3. Aceite pendente na CNH Digital', '4. Pagar com 40% em até 5 dias', '5. Aguardando acerto']
  const posicoes = ordem.map((t) => corpo.indexOf(t))
  assert.ok(posicoes.every((p) => p >= 0), 'todas as seções no corpo')
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes)
  for (const lista of ['Linhas_prazo', 'Linhas_indicar', 'Linhas_aceite', 'Linhas_pagar']) {
    const sel = tem.actions[lista].inputs.select
    for (const campo of ["item()?['auto']", "item()?['placa']", "item()?['responsavel']", "item()?['prazo']", "item()?['passo']", '#/frota-multas?registro=multa:']) assert.ok(sel.includes(campo), `${lista}: ${campo}`)
  }
  assert.match(corpo, /#\/frota-multas\?status=202410006/)
})

test('um e-mail para cada funcionário ativo com cr40f_recebeemailmultas, pela noreply', () => {
  const dest = tem.actions.Destinatarios.inputs.parameters
  assert.equal(dest.entityName, 'cr40f_funcionarioses')
  assert.equal(dest.$filter, 'statecode eq 0 and cr40f_status eq 0 and cr40f_recebeemailmultas eq true and cr40f_emailbetinhos ne null')
  const email = tem.actions.Enviar.actions.E_mail.inputs
  assert.equal(email.host.operationId, 'SendEmailV2')
  assert.equal(email.parameters['emailMessage/From'], '__REMETENTE__')
})

test('Catch avisa o admin e marca a execução como falha', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  assert.match(flow.actions.Catch.actions.Avisar_admin.inputs.parameters['emailMessage/To'], /new_EmailAdminAvisos/)
  assert.equal(flow.actions.Catch.actions.Marcar_falha.type, 'Terminate')
})

test('nenhum dado de ambiente no repositório', () => {
  assert.ok(raw.includes('__REMETENTE__'))
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|sig=/i)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (na Betinhos-Renan): `node --test packages/deploy/flows/multas-do-dia.test.mjs`
Expected: FAIL ("ENOENT ... multas-do-dia.json").

- [ ] **Step 3: Escrever o JSON do flow**

`packages/deploy/flows/multas-do-dia.json`:

```json
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "URL do Sistema Betinhos (new_URLSistemaBetinhos)": {
      "defaultValue": "",
      "type": "String",
      "metadata": { "schemaName": "new_URLSistemaBetinhos", "description": "Endereço do Sistema Betinhos usado nos links dos e-mails." }
    },
    "E-mail do administrador dos avisos (new_EmailAdminAvisos)": {
      "defaultValue": "",
      "type": "String",
      "metadata": { "schemaName": "new_EmailAdminAvisos", "description": "Recebe o aviso quando o e-mail das multas falha." }
    }
  },
  "triggers": {
    "Dias_uteis_7h": {
      "type": "Recurrence",
      "recurrence": {
        "frequency": "Week",
        "interval": 1,
        "timeZone": "E. South America Standard Time",
        "startTime": "2026-11-18T07:00:00",
        "schedule": { "weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": ["7"], "minutes": [0] }
      }
    }
  },
  "actions": {
    "Try": {
      "type": "Scope",
      "runAfter": {},
      "actions": {
        "Multas_do_dia": {
          "type": "OpenApiConnection",
          "runAfter": {},
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "PerformUnboundAction" },
            "parameters": { "actionName": "cr40f_MultasDoDia" },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Dados": {
          "type": "Compose",
          "runAfter": { "Multas_do_dia": ["Succeeded"] },
          "inputs": "@json(outputs('Multas_do_dia')?['body/MultasJson'])"
        },
        "Tem_itens": {
          "type": "If",
          "runAfter": { "Dados": ["Succeeded"] },
          "expression": { "and": [ { "greater": [ "@int(outputs('Dados')?['total'])", 0 ] } ] },
          "actions": {
            "Url": { "type": "Compose", "runAfter": {}, "inputs": "@{parameters('URL do Sistema Betinhos (new_URLSistemaBetinhos)')}" },
            "Cabecalho": {
              "type": "Compose",
              "runAfter": { "Url": ["Succeeded"] },
              "inputs": "<tr><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Auto</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Placa</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Responsável</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Prazo</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Passo que falta</th></tr>"
            },
            "Linhas_prazo": {
              "type": "Select",
              "runAfter": { "Cabecalho": ["Succeeded"] },
              "inputs": { "from": "@outputs('Dados')?['prazoVencido']", "select": "@concat('<tr><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\"><a href=\"', outputs('Url'), '#/frota-multas?registro=multa:', item()?['id'], '\">', coalesce(item()?['auto'], 'sem número'), '</a></td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', coalesce(item()?['placa'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['responsavel'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', if(empty(item()?['prazo']), '—', formatDateTime(item()?['prazo'], 'dd/MM/yyyy')), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['passo'], ''), '</td></tr>')" }
            },
            "Linhas_indicar": {
              "type": "Select",
              "runAfter": { "Linhas_prazo": ["Succeeded"] },
              "inputs": { "from": "@outputs('Dados')?['indicar']", "select": "@concat('<tr><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\"><a href=\"', outputs('Url'), '#/frota-multas?registro=multa:', item()?['id'], '\">', coalesce(item()?['auto'], 'sem número'), '</a></td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', coalesce(item()?['placa'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['responsavel'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', if(empty(item()?['prazo']), '—', formatDateTime(item()?['prazo'], 'dd/MM/yyyy')), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['passo'], ''), '</td></tr>')" }
            },
            "Linhas_aceite": {
              "type": "Select",
              "runAfter": { "Linhas_indicar": ["Succeeded"] },
              "inputs": { "from": "@outputs('Dados')?['aceite']", "select": "@concat('<tr><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\"><a href=\"', outputs('Url'), '#/frota-multas?registro=multa:', item()?['id'], '\">', coalesce(item()?['auto'], 'sem número'), '</a></td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', coalesce(item()?['placa'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['responsavel'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', if(empty(item()?['prazo']), '—', formatDateTime(item()?['prazo'], 'dd/MM/yyyy')), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['passo'], ''), '</td></tr>')" }
            },
            "Linhas_pagar": {
              "type": "Select",
              "runAfter": { "Linhas_aceite": ["Succeeded"] },
              "inputs": { "from": "@outputs('Dados')?['pagar']", "select": "@concat('<tr><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\"><a href=\"', outputs('Url'), '#/frota-multas?registro=multa:', item()?['id'], '\">', coalesce(item()?['auto'], 'sem número'), '</a></td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', coalesce(item()?['placa'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['responsavel'], '—'), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB;white-space:nowrap\">', if(empty(item()?['prazo']), '—', formatDateTime(item()?['prazo'], 'dd/MM/yyyy')), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['passo'], ''), '</td></tr>')" }
            },
            "Corpo": {
              "type": "Compose",
              "runAfter": { "Linhas_pagar": ["Succeeded"] },
              "inputs": "@concat('<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\"><p>Multas de hoje (', formatDateTime(outputs('Dados')?['hoje'], 'dd/MM/yyyy'), '): <b>', string(outputs('Dados')?['total']), '</b> pedem atenção.</p>', if(empty(body('Linhas_prazo')), '', concat('<h3 style=\"color:#B91C1C\">1. Prazo vencido: responda</h3><table style=\"border-collapse:collapse\">', outputs('Cabecalho'), join(body('Linhas_prazo'), ''), '</table>')), if(empty(body('Linhas_indicar')), '', concat('<h3>2. Indicar em até 7 dias</h3><table style=\"border-collapse:collapse\">', outputs('Cabecalho'), join(body('Linhas_indicar'), ''), '</table>')), if(empty(body('Linhas_aceite')), '', concat('<h3>3. Aceite pendente na CNH Digital</h3><table style=\"border-collapse:collapse\">', outputs('Cabecalho'), join(body('Linhas_aceite'), ''), '</table>')), if(empty(body('Linhas_pagar')), '', concat('<h3>4. Pagar com 40% em até 5 dias</h3><table style=\"border-collapse:collapse\">', outputs('Cabecalho'), join(body('Linhas_pagar'), ''), '</table>')), if(equals(int(outputs('Dados')?['aguardandoAcerto']), 0), '', concat('<h3>5. Aguardando acerto</h3><p><b>', string(outputs('Dados')?['aguardandoAcerto']), '</b> multas pagas esperam o acerto. <a href=\"', outputs('Url'), '#/frota-multas?status=202410006\">Abrir a lista</a></p>')), '</div>')"
            },
            "Destinatarios": {
              "type": "OpenApiConnection",
              "runAfter": { "Corpo": ["Succeeded"] },
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
                "parameters": {
                  "entityName": "cr40f_funcionarioses",
                  "$select": "cr40f_emailbetinhos",
                  "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_recebeemailmultas eq true and cr40f_emailbetinhos ne null",
                  "$top": 50
                },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Enviar": {
              "type": "Foreach",
              "foreach": "@outputs('Destinatarios')?['body/value']",
              "runAfter": { "Destinatarios": ["Succeeded"] },
              "actions": {
                "E_mail": {
                  "type": "OpenApiConnection",
                  "runAfter": {},
                  "inputs": {
                    "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
                    "parameters": {
                      "emailMessage/From": "__REMETENTE__",
                      "emailMessage/To": "@{trim(items('Enviar')?['cr40f_emailbetinhos'])}",
                      "emailMessage/Subject": "Multas | @{outputs('Dados')?['total']} para hoje | @{formatDateTime(outputs('Dados')?['hoje'], 'dd/MM/yyyy')}",
                      "emailMessage/Body": "@{outputs('Corpo')}",
                      "emailMessage/Importance": "Normal"
                    },
                    "authentication": "@parameters('$authentication')"
                  }
                }
              }
            }
          },
          "else": { "actions": {} }
        }
      }
    },
    "Catch": {
      "type": "Scope",
      "runAfter": { "Try": ["Failed", "TimedOut"] },
      "actions": {
        "Falhas": {
          "type": "Query",
          "runAfter": {},
          "inputs": { "from": "@result('Try')", "where": "@not(equals(item()?['status'], 'Succeeded'))" }
        },
        "Avisar_admin": {
          "type": "OpenApiConnection",
          "runAfter": { "Falhas": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
            "parameters": {
              "emailMessage/From": "__REMETENTE__",
              "emailMessage/To": "@{parameters('E-mail do administrador dos avisos (new_EmailAdminAvisos)')}",
              "emailMessage/Subject": "Multas | E-mail de hoje falhou",
              "emailMessage/Body": "@{concat('<p>O e-mail Multas de hoje falhou na execução ', workflow()?['run']?['name'], '.</p><p>Etapas com problema:</p><pre>', string(body('Falhas')), '</pre>')}",
              "emailMessage/Importance": "High"
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Marcar_falha": {
          "type": "Terminate",
          "runAfter": { "Avisar_admin": ["Succeeded", "Failed"] },
          "inputs": { "runStatus": "Failed", "runError": { "code": "MultasDoDiaFalhou", "message": "O e-mail Multas de hoje falhou; o administrador foi avisado." } }
        }
      }
    }
  },
  "outputs": {}
}
```

- [ ] **Step 4: Rodar e ver passar**

Run (na Betinhos-Renan): `node --test packages/deploy/flows/multas-do-dia.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 5: Script de criação e atualização (BOM UTF-8)**

`packages/deploy/provision-flow-multas-do-dia.ps1`:

```powershell
# Cria (ou atualiza) no DEV o flow "Multas | Multas de hoje" (dias uteis 07:00, Brasilia) na solucao AppBetinhos.
# A definicao vem de flows/multas-do-dia.json; o e-mail da noreply entra por parametro (nunca no repo). Usa as variaveis
# new_URLSistemaBetinhos e new_EmailAdminAvisos (criadas por provision-flow-documentos-resumo.ps1).
# Pre-requisitos: migration 20261117-1200-multas-fase1.ps1 aplicada (coluna cr40f_recebeemailmultas), Custom API
# cr40f_MultasDoDia registrada pelo Deploy, connection references de Dataverse e Office 365 Outlook e `az login --use-device-code`.
# Primeira vez: a mao, do checkout principal na develop atualizada (flow novo nasce com o dono de quem roda). Depois o Deploy atualiza.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $Remetente,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaOutlook
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Multas | Multas de hoje'
$customApi = 'cr40f_MultasDoDia'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponivel (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[multas-do-dia] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API nao respondeu pela organizacao DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solucao AppBetinhos ausente ou ambigua.' }
$solutionId = $solution[0].solutionid

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id nao entrou na $solutionName." }
}

# 1. Pre-requisitos: Custom API, coluna e variaveis.
if (@((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").value).Count -ne 1) { throw "Custom API $customApi ausente no DEV. Espere o Deploy publicar o plugin da frota." }
if (-not @((Dv GET "EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes?`$select=MetadataId&`$filter=LogicalName eq 'cr40f_recebeemailmultas'").value).Count) { throw 'Coluna cr40f_recebeemailmultas ausente: a migration da fase 1 das multas ainda nao rodou.' }
foreach ($schema in 'new_URLSistemaBetinhos', 'new_EmailAdminAvisos') {
  if (-not @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value).Count) { throw "Variavel $schema ausente no DEV. Rode provision-flow-documentos-resumo.ps1 antes." }
}

# 2. Connection references (Dataverse e Office 365 Outlook). Flow que ja existe mantem a que usa.
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
$refsAtuais = if ($flows.Count) { ($flows[0].clientdata | ConvertFrom-Json).properties.connectionReferences } else { $null }
function Referencia([string] $conector, [string] $preferida) {
  if (-not $preferida -and $refsAtuais -and $refsAtuais.PSObject.Properties[$conector]) { $preferida = $refsAtuais.$conector.connection.connectionReferenceLogicalName }
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    $escolhida = @($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida })
    if ($escolhida.Count -ne 1) { throw "Connection reference '$preferida' ($conector) nao encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Ha $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -Referencia$(if ($conector -eq 'shared_office365') { 'Outlook' } else { 'Dataverse' })."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse
$refOutlook = Referencia 'shared_office365' $ReferenciaOutlook

# 3. Definicao com o remetente.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\multas-do-dia.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__REMETENTE__', $Remetente)
if ($raw -match '__[A-Z_]+__') { throw "Token nao substituido na definicao do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json
$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 4. Cria ou atualiza, inclui na solucao e ativa.
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  $normalizar = { param($o) if ($null -eq $o) { '' } else { ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) } }
  $guardado = $flows[0].clientdata | ConvertFrom-Json
  $novo = $clientData | ConvertFrom-Json
  $mudou = (& $normalizar $guardado.properties.definition) -ne (& $normalizar $novo.properties.definition) -or
           (& $normalizar $guardado.properties.connectionReferences) -ne (& $normalizar $novo.properties.connectionReferences)
  Write-Output "Definicao do flow alterada: $(if ($mudou) { 'sim, atualizando' } else { 'nao, mantida' })"
  if ($mudou) {
    if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
    Dv PATCH "workflows($flowId)" @{ clientdata = $clientData } | Out-Null
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Dias uteis as 07:00 envia as multas que pedem atencao (Custom API cr40f_MultasDoDia) a quem tem E-mail diario de multas marcado. Sem itens, nao envia.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
# No CI (Deploy), flow existente desligado no DEV continua desligado: quem desliga e decisao de operacao.
if (($env:GITHUB_ACTIONS -eq 'true') -and $flows.Count -and $flows[0].statecode -ne 1) { Write-Output "DEV: '$flowName' mantido desligado (estava desligado)."; return }
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow nao ativou. Confira as conexoes das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo na $solutionName."
```

- [ ] **Step 6: Mapear no Deploy**

Em `packages/deploy/flows-dev.mjs`, na lista `ENTRADAS`, logo depois da entrada `lembrete-pagamento`, acrescente:

```js
  {
    nome: 'multas-do-dia', script: 'provision-flow-multas-do-dia.ps1', flows: ['Multas | Multas de hoje'], args: [['Remetente', 'FLOW_FROTA_REMETENTE']],
    arquivos: [script('multas-do-dia'), flowsDir('multas-do-dia\\.json')],
  },
```

Em `packages/deploy/flows-dev.test.mjs`, no teste `'mudança no script ou no JSON publica só aquele flow'`, acrescente:

```js
  assert.deepEqual(nomes(['packages/deploy/flows/multas-do-dia.json']), ['multas-do-dia'])
  assert.deepEqual(nomes(['packages/deploy/provision-flow-multas-do-dia.ps1']), ['multas-do-dia'])
```

Em `packages/deploy/package.json`, no script `test`, acrescente ` flows/multas-do-dia.test.mjs` logo depois de `flows/documentos-resumo-semanal.test.mjs`.

- [ ] **Step 7: Rodar e ver passar**

Run (na Betinhos-Renan):
```
head -c 3 packages/deploy/provision-flow-multas-do-dia.ps1 | xxd -p
pwsh -NoProfile -Command '$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path packages/deploy/provision-flow-multas-do-dia.ps1).Path,[ref]$null,[ref]$e); $e.Count'
pnpm --filter @betinhos/deploy test
```
Expected: `efbbbf`; `0`; `fail 0` (inclui `flows-dev.test.mjs`: BOM, args obrigatórios, reuso da connection reference, todo arquivo de `flows/` numa entrada).

- [ ] **Step 8: Commit**

```bash
git add packages/deploy/flows/multas-do-dia.json packages/deploy/flows/multas-do-dia.test.mjs packages/deploy/provision-flow-multas-do-dia.ps1 packages/deploy/flows-dev.mjs packages/deploy/flows-dev.test.mjs packages/deploy/package.json
git commit -m "feat(multas): flow do e-mail diário Multas de hoje com script e publicação pelo Deploy"
```

---

### Task 18: Resumo diário sem a linha de multa

**Files:**
- Modify: `packages/deploy/provision-flow-resumo-diario.ps1` (cabeçalho, ações `Limite_multa`, `Escalados`, `Multas`, `Cnh_escalados`, `Total`, `Linhas_multas`, `Resumo_html`, função `Conferir` e a descrição do flow)

**Interfaces:**
- Consumes: nada novo. O flow "Flow Alertas | Resumo diário" continua com CNH, ASO e documentos; a multa passa a ir só no "Multas | Multas de hoje".

- [ ] **Step 1: Editar a definição**

Em `packages/deploy/provision-flow-resumo-diario.ps1`:
- cabeçalho (linhas 3-5): troque `# de motorista escalado hoje, documento vigente vencido de veículo escalado hoje e multa sem condutor com prazo de indicação` + `# em até 3 dias. Sem itens, o flow termina sem enviar. ...` por:

```powershell
# de motorista escalado hoje e documento vigente vencido de veículo escalado hoje. As multas saíram daqui em 17/11/2026 e vão
# no e-mail "Multas | Multas de hoje" (provision-flow-multas-do-dia.ps1). Sem itens, o flow termina sem enviar. Sem tabela, sem Worker, sem segredo no repositório.
```

- apague a linha da ação `"Limite_multa": { ... },`;
- em `"Escalados"`, troque `"runAfter": { "Limite_multa": ["Succeeded"] }` por `"runAfter": { "Limite_aso": ["Succeeded"] }`;
- apague a ação `"Multas": { ... },` inteira (de `"Multas": {` até o `},` que fecha o `inputs` e a ação);
- em `"Cnh_escalados"`, troque `"runAfter": { "Multas": ["Succeeded"] }` por `"runAfter": { "Docs": ["Succeeded"] }`;
- troque o `inputs` de `"Total"` por `"@add(add(length(body('Cnh_escalados')), length(body('Aso_escalados'))), length(body('Docs_escalados')))"`;
- apague a linha da ação `"Linhas_multas": { ... },`;
- em `"Resumo_html"`, troque `"runAfter": { "Linhas_multas": ["Succeeded"] }` por `"runAfter": { "Linhas_docs": ["Succeeded"] }` e `union(body('Linhas_cnh'), body('Linhas_aso'), body('Linhas_docs'), body('Linhas_multas'))` por `union(body('Linhas_cnh'), body('Linhas_aso'), body('Linhas_docs'))`;
- na função `Conferir`, apague a linha `$mul = & $ler $a.Multas` e a entrada `'Multas: Notificar o Condutor, sem motorista, prazo até o limite de 3 dias, top 150' = ...`, e acrescente no `$checks` (antes de `'Sem_itens encerra ...'`):

```powershell
    'sem multas (foram para o e-mail Multas de hoje)' = -not ($pa -contains 'Multas') -and -not ($pa -contains 'Linhas_multas') -and -not ($pa -contains 'Limite_multa')
```

- na descrição do `Dv POST workflows`, troque `e multa sem condutor. Sem itens, não envia.` por `. Sem itens, não envia.` (ficando `... documento do veículo vencido (de quem está escalado hoje). Sem itens, não envia.`).

- [ ] **Step 2: Conferir sintaxe agora e a definição no DEV depois**

Run (na Betinhos-Renan): `pwsh -NoProfile -Command '$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path packages/deploy/provision-flow-resumo-diario.ps1).Path,[ref]$null,[ref]$e); $e.Count'`
Expected: `0`.

A sessão de implementação não roda `provision-*`. A conferência da definição (`-SomenteValidar`: só `checkFlowErrors` e a função `Conferir`, sem gravar) fica para quem roda do checkout principal com `az login` no DEV, antes do merge: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-resumo-diario.ps1 -SomenteValidar` → `checkFlowErrors: []` e as linhas `[resumo-diario] ok: ...`, incluindo `ok: sem multas (foram para o e-mail Multas de hoje)`. Depois do merge, o Deploy republica o flow (entrada `resumo-diario` de `flows-dev.mjs`).

- [ ] **Step 3: Commit**

```bash
git add packages/deploy/provision-flow-resumo-diario.ps1
git commit -m "feat(multas): resumo diário deixa a multa para o e-mail Multas de hoje"
```

---
### Task 19: Flows antigos de multa: conferência nas soluções e remoção declarada

**Files:**
- Modify: `packages/deploy/solucoes/comparar-fotos.mjs:38-66,104-112,129-147`
- Modify: `packages/deploy/solucoes/comparar-fotos.test.mjs` (import e testes novos)
- Modify: `packages/deploy/solucoes/fluxos-aposentados.json`

**Interfaces:**
- Consumes: `foto-ambiente.ps1` (só leitura), artefato `fotos-prod` do workflow "Publicar soluções", `Restore-Estados` (`solucoes.ps1:422-431`, desliga aposentado com o substituto ligado).
- Produces: entradas de `fluxos-aposentados.json` com `"removido": true`; `compararFotos(antes, depois, { ..., removidos })`: fluxo removido por decisão que some vai para `fluxosAposentados` (`depois: null`) e o componente dele não conta em `componentesSumiram`; a CLI lê `removidos` do mesmo JSON.

- [ ] **Step 1: Conferir onde os 3 flows estão (só leitura)**

DEV (na Betinhos-Renan, PowerShell 5.1 com login no DEV; `backup/` não é versionado):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup/solucoes/foto-multas-dev.json -Solucoes "AppBetinhos,BetinhosCore,BetinhosAutomacao,BetinhosInterface,BetinhosMotoristas"
node -e "const f=require('./backup/solucoes/foto-multas-dev.json');const alvo=['Flow Notificação Email Multa não Indicada','Flow Gerar Contrato','Flow Notificar Condutor Multas'];for(const [id,x] of Object.entries(f.fluxos)){const n=x.nome.replace(/\s+/g,' ');if(alvo.includes(n))console.log(n,'|',id,'|',(f.componentes[id]||[]).join(','),'| estado',x.estado)}"
```
PROD (sem tocar no ambiente: a foto "antes" do último "Publicar soluções" que foi ao PROD):
```bash
gh run list --workflow publicar.yml --limit 10 --json databaseId,conclusion,displayTitle,createdAt
gh run download <databaseId> -n fotos-prod -D backup/solucoes/fotos-prod
ls backup/solucoes/fotos-prod
```
e o mesmo `node -e` trocando o arquivo pela foto de antes listada no `ls`.

Expected: uma linha por flow encontrado, com as soluções. Registre o resultado no PR (tabela flow → soluções no DEV → soluções no PROD). Decisão por flow:
- **Está numa das 4 soluções** (esperado para "Flow Notificar Condutor Multas" e "Flow Gerar Contrato", que o shell chamava): sai pelas soluções (Steps 2 a 6).
- **"Flow Notificação Email Multa não Indicada" fora das 4 no PROD** (só existe lá): solução não remove o que nunca carregou. Não entra em `fluxos-aposentados.json`; o PR diz "fora das soluções, decisão do Renan: desligar à mão no PROD depois que o e-mail Multas de hoje estiver ligado". Se aparecer numa das 4 no PROD, entra como os outros dois.

- [ ] **Step 2: Escrever os testes do comparador (falham)**

Em `packages/deploy/solucoes/comparar-fotos.test.mjs`, acrescente `import { readFileSync } from 'node:fs'` aos imports e, no fim:

```js
test('fluxo aposentado e removido que some não é perda: vai para fluxosAposentados e o componente não conta', () => {
  const antes = foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 1 }, f2: { nome: 'Flow Gerar Contrato', estado: 0 } }, componentes: { c1: ['AppBetinhos'], f2: ['BetinhosAutomacao'] } })
  const depois = foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 1 } }, componentes: { c1: ['AppBetinhos'] } })
  const d = compararFotos(antes, depois, { aposentados: ['Flow Gerar Contrato'], removidos: ['Flow Gerar Contrato'] })
  assert.deepEqual(d.fluxosAposentados, [{ id: 'f2', nome: 'Flow Gerar Contrato', antes: 0, depois: null }])
  assert.deepEqual(d.fluxosSumiram, [])
  assert.deepEqual(d.componentesSumiram, [])
  assert.equal(temPerda(d), false)
  assert.equal(temPerda(compararFotos(antes, depois, { aposentados: ['Flow Gerar Contrato'] })), true)
})

test('fluxos-aposentados.json: cada entrada tem nome, substituto e decisão; removido só como true', () => {
  const lista = JSON.parse(readFileSync(new URL('./fluxos-aposentados.json', import.meta.url), 'utf8'))
  for (const a of lista) {
    assert.ok(a.nome && a.substituto && a.decisao, JSON.stringify(a))
    if ('removido' in a) assert.equal(a.removido, true, a.nome)
  }
})
```

Run (na Betinhos-Renan): `node --test packages/deploy/solucoes/comparar-fotos.test.mjs`
Expected: FAIL no primeiro teste novo (`fluxosSumiram` com o f2).

- [ ] **Step 3: Implementar no comparador**

Em `packages/deploy/solucoes/comparar-fotos.mjs`:
- acrescente ao comentário acima de `compararFotos`: `// removidos: nomes de fluxos-aposentados.json com "removido": true. Fluxo assim que some (saiu das soluções por decisão registrada) vai para fluxosAposentados com depois null, e o componente dele não conta como perda.`;
- troque a assinatura por `export function compararFotos(antes, depois, { travado = false, aceitarTabelas = [], retirada = false, aposentados = [], removidos = [], remocoes = [] } = {}) {`;
- logo depois de `const d = Object.fromEntries(...)`, acrescente `const idsRemovidos = new Set()`;
- troque `if (!g) (soDaCaixa(id) ? d.fluxosDaCaixaSumiram : d.fluxosSumiram).push({ id, nome: f.nome })` por:

```js
    if (!g) {
      if (removidos.includes(f.nome)) { d.fluxosAposentados.push({ id, nome: f.nome, antes: f.estado, depois: null }); idsRemovidos.add(id) }
      else (soDaCaixa(id) ? d.fluxosDaCaixaSumiram : d.fluxosSumiram).push({ id, nome: f.nome })
    }
```

- no laço `for (const [id, donos] of Object.entries(antes.componentes))`, logo depois de `if (!novos || !novos.length) {`, acrescente `if (idsRemovidos.has(id)) continue`;
- na CLI, troque a linha `const aposentados = (await lerJson(...)).map((a) => a.nome)` por:

```js
  const listaAposentados = await lerJson(fileURLToPath(new URL('./fluxos-aposentados.json', import.meta.url)))
  const aposentados = listaAposentados.map((a) => a.nome)
  const removidos = listaAposentados.filter((a) => a.removido === true).map((a) => a.nome)
```

  e passe `removidos` na chamada: `compararFotos(await lerJson(arquivos[0]), await lerJson(arquivos[1]), { travado, aceitarTabelas, retirada, aposentados, removidos, remocoes })`.

- [ ] **Step 4: Declarar os flows que saem**

`packages/deploy/solucoes/fluxos-aposentados.json`: acrescente ao array, para cada flow que o Step 1 achou numa das 4 soluções (os dois abaixo; o terceiro só se o Step 1 o achou nelas):

```json
  {
    "nome": "Flow Notificar Condutor Multas",
    "substituto": "Multas | Multas de hoje",
    "removido": true,
    "decisao": "Renan e Júnior, 17/11/2026 (spec multas fase 1, §9): o aviso ao motorista vira o passo AvisarMotorista do passo a passo; o flow sai pelas soluções"
  },
  {
    "nome": "Flow Gerar Contrato",
    "substituto": "Multas | Multas de hoje",
    "removido": true,
    "decisao": "Renan e Júnior, 17/11/2026 (spec multas fase 1, §9): a indicação vira o passo RegistrarIndicacao; o flow sai pelas soluções"
  }
```

Use o nome exato que o Step 1 imprimiu (se o DEV tiver dois espaços em "Flow  Notificar Condutor Multas", grave com dois espaços: o comparador e o `Restore-Estados` comparam o nome literal).

- [ ] **Step 5: Rodar e ver passar**

Run (na Betinhos-Renan): `pnpm --filter @betinhos/deploy test`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add packages/deploy/solucoes/comparar-fotos.mjs packages/deploy/solucoes/comparar-fotos.test.mjs packages/deploy/solucoes/fluxos-aposentados.json
git commit -m "feat(multas): flows antigos de multa saem pelas soluções como remoção declarada"
```

A exclusão dos flows no DEV (o que faz eles saírem das soluções) é manual e vem na virada (Task 22), depois do merge.

---

### Task 20: Rotina do SNE (roteiro da skill do Júnior)

**Files:**
- Create: `docs/multas/rotina-sne.md`

**Interfaces:**
- Consumes: colunas de `cr40f_multas` (Task 1 e as que já existem: `cr40f_novacoluna`, `cr40f_codigodoorgaoautuador`, `cr40f_nomedoorgaoautuador`, `cr40f_placa`, `cr40f_dataehorario`, `cr40f_localdainfracao`, `cr40f_codigodainfracao`, `new_valorguia`, `cr40f_dataparaindicar`, `cr40f_autodainfracao`); trava (Task 5): duplicata recusada e campos de passo só pelo passo a passo.
- Produces: texto que o Júnior cola na skill dele no claude.ai.

- [ ] **Step 1: Escrever o roteiro**

`docs/multas/rotina-sne.md`:

````markdown
# Rotina do SNE: roteiro da skill de multas (versão da fase 1, 17/11/2026)

Este é o texto que o Júnior copia para a skill dele no claude.ai (Claude in Chrome com o conector Dataverse PROD).
Mudou aqui, copie de novo para a skill. Spec: `docs/superpowers/specs/2026-11-17-multas-fase1-design.md`, §8.

---

## Para que serve

Uma ou duas vezes por semana, olhar as multas no portal da Senatran (SNE) e deixar o Sistema Betinhos em dia:
1. cadastrar as multas novas;
2. completar as multas abertas que ganharam penalidade (vencimento, valor com 40% e PDF).

O resto (quem é o responsável, aviso ao motorista, indicação, pagamento e acerto) é feito no passo a passo do Sistema
Betinhos, nunca por esta rotina.

## Regras que não mudam

- Tabela: `cr40f_multas` (no conector, `cr40f_multases`).
- **Nunca gravar** estes campos: `cr40f_status`, `cr40f_responsavel`, `cr40f_motivoempresa`, `cr40f_canalindicacao`,
  `cr40f_datadeavisoaocondutor`, `cr40f_datadeindicacao`, `cr40f_aceiteem`, `cr40f_pagaem`, `cr40f_valorpago`,
  `cr40f_competenciadesconto`, `cr40f_acertoem`, `cr40f_encerradaem`, `cr40f_canceladaem`, `cr40f_motivocancelamento`,
  `cr40f_indicado`. Eles são do passo a passo; o servidor recusa ou registra a gravação feita por fora.
- Toda multa nova começa sozinha na etapa "1. Identificar o responsável" e ganha uma tarefa no Planner para a equipe Frota.
- Datas sem hora no formato `AAAA-MM-DD`. Data e hora da infração com o fuso de Brasília (`AAAA-MM-DDTHH:MM:00-03:00`).

## Passo 1: multas novas

Para cada notificação de autuação que aparecer no SNE:

1. **Procure antes de criar.** Consulte `cr40f_multases` com `cr40f_novacoluna eq '<número do auto>'`.
   Se voltar alguma linha, a multa já existe: anote "já cadastrada" e passe para a próxima.
2. **Ache a placa.** Consulte `cr40f_veiculoses` com `cr40f_placa eq '<PLACA sem hífen>'`. Sem resultado: anote
   "placa não encontrada" e não crie a multa.
3. **Ache a infração.** Consulte `cr40f_infracaodetransitos` com `cr40f_codigodainfracao eq '<código>'` (formato `7455-0`).
   Sem resultado: crie a multa sem a infração e anote "infração sem cadastro".
4. **Crie a multa** com, e só com:
   - `cr40f_novacoluna`: número do auto;
   - `cr40f_codigodoorgaoautuador`: código do órgão autuador (número);
   - `cr40f_nomedoorgaoautuador`: nome do órgão autuador;
   - `cr40f_placa`: o veículo do item 2 (lookup);
   - `cr40f_dataehorario`: data e hora da infração;
   - `cr40f_localdainfracao`: local;
   - `cr40f_codigodainfracao`: a infração do item 3 (lookup);
   - `new_valorguia`: valor da multa;
   - `cr40f_dataparaindicar`: data-limite para indicar o condutor.
   Faça os lookups do mesmo jeito que a rotina já fazia antes desta versão.
5. **Anexe o PDF** da notificação de autuação na coluna de arquivo `cr40f_autodainfracao` da multa criada
   (upload de arquivo do conector: iniciar, enviar e confirmar).
6. **Se a criação for recusada** com "Já existe multa com o auto ...": a multa já estava lá. Anote "duplicada" e siga
   para a próxima. Qualquer outra recusa: anote a mensagem inteira e siga.

## Passo 2: penalidades das multas abertas

1. Consulte `cr40f_multases` com `statecode eq 0 and cr40f_vencimento eq null and (cr40f_status eq 202410000 or
   cr40f_status eq 202410004 or cr40f_status eq 202410001)`, trazendo `cr40f_multasid`, `cr40f_novacoluna` e `cr40f_placa`.
2. Para cada uma, procure no SNE a notificação de penalidade do mesmo auto. Se ainda não saiu, pule.
3. Se saiu, **atualize só estes campos**:
   - `cr40f_vencimento`: vencimento da guia;
   - `cr40f_valorcomdesconto`: valor com os 40% do SNE;
   - e anexe o PDF da penalidade na coluna de arquivo `cr40f_pdfpenalidade`.

## No fim, responda ao Júnior

Um resumo curto, nesta ordem:
- multas novas cadastradas (auto, placa, data para indicar);
- penalidades gravadas (auto, vencimento, valor com desconto);
- puladas e por quê (já cadastrada, duplicada, placa não encontrada, infração sem cadastro, outra recusa com a mensagem).

Lembrete final: "Abra o e-mail Multas de hoje ou a lista Comigo no Sistema Betinhos para dar os próximos passos."
````

- [ ] **Step 2: Conferir que o documento não tem dado pessoal**

Run (na Betinhos-Renan): `node scripts/dados-pessoais.mjs`
Expected: código 0 (sem CPF, e-mail de pessoa ou planilha).

- [ ] **Step 3: Commit**

```bash
git add docs/multas/rotina-sne.md
git commit -m "docs(multas): roteiro da rotina do SNE para a skill do Júnior"
```

---

### Task 21: Skill `verificar-multas` e skills do termo

**Files:**
- Create: `.claude/skills/verificar-multas/SKILL.md`
- Modify: `.claude/skills/verificar-index.md` (linha nova), `.claude/skills/verificar-termo-multa/SKILL.md` (aviso no topo), `apps/motoristas/.claude/skills/verificar-app-termo-multa/SKILL.md` (aviso no topo)

**Interfaces:**
- Consumes: tudo das Tasks 1 a 20 (nomes de API, steps, flow, telas e mock).

- [ ] **Step 1: Escrever a skill**

`.claude/skills/verificar-multas/SKILL.md`:

````markdown
---
name: verificar-multas
description: "Verifica a fase 1 das multas: regras MultaEtapas (plugin e espelho do shell, paridade), Custom APIs cr40f_PassoMulta, cr40f_MultasDoDia e new_DossieMulta, trava (observar/travar), tarefa da multa no Planner, drawer passo a passo, lista e visões, Abrir multa no Planner, aba Multas da ficha e o e-mail Multas de hoje. Use após mudar packages/plugins/Cr40f.Frota.Plugin/Multa*.cs, PassoMultaPlugin.cs, MultasDoDia*.cs, DossieMultaPlugin.cs, frota/domain/multa*.ts, MultaPassoAPasso.tsx, frota/domain/{linhas,listas}.ts, planner/domain/multaTaskFlow.ts, flows/multas-do-dia.json ou a migration 20261117-1200-multas-fase1.ps1."
---
# Verificar multas (fase 1)

Spec: `docs/superpowers/specs/2026-11-17-multas-fase1-design.md`. Plano: `docs/superpowers/plans/2026-11-17-multas-fase1.md`.
Testes, builds e navegador rodam na Betinhos-Renan (este PC tem 8 GB). Só DEV; PROD é proibido aqui.

## 1. Testes (sem Dataverse)
```
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --nologo -v q
dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --nologo -v q --filter FullyQualifiedName~DossieMulta
pnpm --filter @betinhos/shell typecheck
pnpm --filter @betinhos/shell test -- src/pages/frota/domain src/pages/frota/components/MultaPassoAPasso.test.tsx src/pages/frota/components/RegistroDrawer.test.tsx src/pages/frota/views src/pages/planner/domain/multaTaskFlow.test.ts src/pages/funcionarios/components/RelatedTabs.test.tsx src/pages/dashboard/domain/abas/multas.test.ts
pnpm --filter @betinhos/deploy test
```
Esperado: tudo verde. `ParidadeMultaTests` e `multaEtapas.test.ts` leem o mesmo `Fixtures/multa-etapas.json`: mudou uma regra, mude os dois lados e o fixture.

## 2. Mock (sem Dataverse)
Suba o shell em mock (`pnpm --filter @betinhos/shell dev`, porta 36472) e passe por:
1. `#/frota-multas`: abre na visão **Comigo**; colunas Auto, Data, Placa, Responsável, Etapa, Próximo passo, Próximo prazo; u5 com prazo vermelho; visões Prazo vencido, Aguardando penalidade (u6), Aguardando acerto (u4), Encerradas e canceladas (u3, u9), Todas.
2. Uma multa do começo ao fim, u1: Definir o responsável (Motorista Bruno) → Avisar o motorista ("Copiar mensagem" e "Avisei") → Indicar no órgão (DSV, data de hoje) → a multa vai para Pagar e fica "Aguardando a penalidade" (o mock não tem a rotina do SNE: confira só até aqui).
3. Prazo vencido, u5: o passo ocupa a tela inteira, o menu "Mais" some; responder "Não: a empresa paga a guia" leva a Pagar com responsável Empresa (prazo perdido).
4. u7 (Pagar com vencimento): Registrar pagamento → Acertar → "Lancei na folha" com o mês → Encerrada.
5. Menu "Mais" em u2: Cancelar exige motivo; Em recurso leva a u10-like "Registrar o resultado do recurso".
6. `#/planner?taskId=task-multa-1`: botão "Abrir multa" leva a `#/frota-multas?registro=multa:u1`; mudar o status para Concluída mostra "A tarefa fecha sozinha quando a multa for encerrada."
7. 375 px: sem rolagem horizontal no drawer e na lista.
Prints de antes e depois do drawer, da lista e da tarefa no Planner vão para o chat.

## 3. Dataverse DEV
Pré-requisitos: Deploy da `develop` verde (migration, plugin da frota, DriverRecordSharing, tela), `register-dossiemulta-customapi.ps1 -Apply` e o flow criado à mão (`provision-flow-multas-do-dia.ps1 -Remetente <noreply>`), os dois do checkout principal.
1. **Schema**: `cr40f_multas.cr40f_status` com os rótulos novos e a opção 202410007 Cancelada; colunas novas; `cr40f_MultasTravaModo` = `observar`.
2. **Registro**: `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com --testar-multas` imprime o MultasJson com `hoje`, `total` e as cinco seções.
3. **Multa nova**: crie uma multa de teste pelo formulário nativo (auto `TESTE-<data>`, placa de teste, data para indicar daqui a 2 dias). Esperado: status "1. Identificar o responsável"; em até 1 min uma tarefa no Planner `Multa TESTE-... · <placa> · Definir o responsável`, prioridade urgente, equipe Frota, sininho do principal.
4. **Passo a passo no DEV**: dê os passos na tela até Encerrada. A cada etapa a tarefa muda o título, o prazo, o checklist e ganha um evento "Multa: ... → ..."; encerrada, a tarefa vai para Concluída. Conclua a tarefa à mão com outra multa aberta: o Planner recusa; com a multa aberta e a tarefa concluída por fora, o próximo passo a reabre.
5. **Trava em observar**: grave `cr40f_status` direto pela Web API numa multa de teste. Esperado: a gravação passa e o log de plugins (`plugintracelogs?$filter=typename eq 'Cr40f.Frota.Plugin.MultaTravaPlugin'&$orderby=createdon desc&$top=5`) tem `Recusaria multa <id> (Update): ... | origem: gravação direta, usuário <id>`.
6. **Duplicata**: crie outra multa com o mesmo auto. Em observar, passa e o trace diz `Já existe multa com o auto ...`; com a variável em `travar` (só no DEV, voltar para `observar` no fim), a criação é recusada com essa mensagem.
7. **Dossiê**: na multa de teste, "Copiar mensagem" traz o serviço da agenda da placa no horário e as viagens do InFleet (ou "Rastreador: indisponível (...)" sem quebrar).
8. **E-mail**: com `cr40f_recebeemailmultas` marcado só para quem testa, rode o flow "Multas | Multas de hoje" à mão: um e-mail com as seções na ordem; sem itens, a execução termina sem enviar.

## Evidência obrigatória
Saída dos testes do item 1, prints do item 2, o MultasJson do item 3.2, o trace do item 3.5, a tarefa do item 3.3 e o e-mail do item 3.8.

## Limites
- Só prova o DEV. O PROD recebe tudo pelo "Publicar soluções" (ensaio no TEST e aprovação do Renan).
- Bypass de administrador (correção de dados) usa o bypass nativo de lógica customizada; não é coberto aqui.
- O termo de multa fica escondido nesta fase (skills `verificar-termo-multa` e `verificar-app-termo-multa`).
````

- [ ] **Step 2: Índice e skills do termo**

Em `.claude/skills/verificar-index.md`, acrescente depois da linha `verificar-termo-multa`:

```
- verificar-multas | packages/plugins/Cr40f.Frota.Plugin/{Multa*,PassoMultaPlugin,MultasDoDia*}.cs, packages/plugins/Betinhos.DriverRecordSharing/DossieMultaPlugin.cs, apps/shell/src/pages/frota/domain/multa*.ts, apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx, apps/shell/src/pages/frota/domain/{linhas,listas}.ts, apps/shell/src/pages/planner/domain/multaTaskFlow.ts, packages/deploy/flows/multas-do-dia.json, packages/deploy/provision-flow-multas-do-dia.ps1, packages/deploy/migrations/20261117-1200-multas-fase1.ps1 | Multas fase 1: passo a passo, trava, tarefa no Planner, dossiê, lista e e-mail Multas de hoje
```

Em `.claude/skills/verificar-termo-multa/SKILL.md`, logo depois da linha `# Verificar termo de multa (gestor)`, acrescente:

```markdown
> **Fase 1 das multas (17/11/2026): o termo está escondido.** O `TermoMultaPanel` não aparece no drawer da multa e a lista
> não tem mais a coluna Termo nem as visões "Termos pendentes" e "Contestados" (a multa anda pelo passo a passo; skill
> `verificar-multas`). O código e os testes do painel continuam e voltam na fase 3; até lá, esta skill só vale para os testes
> do componente (`TermoMultaPanel.test.tsx`).
```

Em `apps/motoristas/.claude/skills/verificar-app-termo-multa/SKILL.md`, logo depois da linha `# Verificar termo de multa (backend)`, acrescente:

```markdown
> **Fase 1 das multas (17/11/2026): o termo está escondido no Sistema Betinhos** (volta na fase 3). As Custom APIs do termo
> continuam publicadas, mas ninguém envia termo novo. Atenção: `new_AssinarTermoMulta` e `new_ContestarTermoMulta` gravam
> `cr40f_status` da multa; com a trava das multas em `travar` (variável `cr40f_MultasTravaModo`), essa gravação é recusada.
> Antes de religar o termo na fase 3, a trava precisa aceitar essas mensagens no `ParentContext`.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/verificar-multas/SKILL.md .claude/skills/verificar-index.md .claude/skills/verificar-termo-multa/SKILL.md apps/motoristas/.claude/skills/verificar-app-termo-multa/SKILL.md
git commit -m "docs(multas): skill verificar-multas e aviso do termo escondido nas skills do termo"
```

---

### Task 22: PR, DEV e virada no PROD

**Files:** nenhum arquivo novo; é a sequência de entrega. Os itens manuais são do Renan (ou de quem ele indicar), do checkout principal na `develop` atualizada.

**Interfaces:**
- Consumes: tudo das Tasks 1 a 21.

- [ ] **Step 1: Verificação completa antes do PR**

Run (na Betinhos-Renan):
```
pnpm -r --if-present typecheck
pnpm --filter @betinhos/shell test
pnpm --filter @betinhos/deploy test
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests
dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests
node scripts/dados-pessoais.mjs
```
Expected: tudo verde. Se a suíte inteira do shell estourar tempo, rode por pasta (`src/pages/frota`, `src/pages/planner`, `src/pages/funcionarios`, `src/pages/dashboard`).

- [ ] **Step 2: Abrir o PR para a `develop`**

```bash
git push -u origin t3/revisar-processo-multas
gh pr create --base develop --title "Multas fase 1: prazos, avisos, passo a passo e tarefa no Planner" --body-file - <<'EOF'
Implementa docs/superpowers/specs/2026-11-17-multas-fase1-design.md (plano: docs/superpowers/plans/2026-11-17-multas-fase1.md).

- Regras MultaEtapas no plugin da frota com espelho no shell e fixture de paridade.
- Custom APIs cr40f_PassoMulta, cr40f_MultasDoDia e new_DossieMulta; trava pre-operation em modo observar; tarefa no Planner por step assíncrono.
- Drawer passo a passo, lista com visões (Comigo padrão), Abrir multa no Planner, aba Multas da ficha.
- E-mail Multas de hoje (flow novo, criado à mão uma vez no DEV); resumo diário sem multa.
- Flows antigos de multa como remoção declarada (fluxos-aposentados.json); conferência das soluções: <tabela do Step 1 da Task 19>.
- Rotina do SNE em docs/multas/rotina-sne.md.

Não verificado no PR (depende do DEV): passo 3 da skill verificar-multas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Depois do merge na `develop` (Deploy)**

Acompanhe o Deploy (skill `verificar-deploy-dev`). Esperado no resumo: migration `20261117-1200-multas-fase1.ps1` aplicada; plugin `frota` publicado pelo registrador (3 Custom APIs, 4 steps); `driverrecordsharing` com o assembly novo; tela; flows `resumo-diario` republicado; `multas-do-dia` não publica (flow ainda não existe: tag ausente/sem flow = nada a fazer) até ser criado à mão.

- [ ] **Step 4: Itens manuais no DEV (checkout principal, `develop` atualizada, `az login`)**

1. `powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-dossiemulta-customapi.ps1` (dry-run) e depois com `-Apply`. Esperado: `OK: new_DossieMulta -> Betinhos.DriverRecordSharing.DossieMultaPlugin`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-multas-do-dia.ps1 -Remetente <noreply>` (primeira criação). Esperado: `DEV: 'Multas | Multas de hoje' ativo na AppBetinhos.`
3. `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/distribuir-solucoes.ps1 -SomenteConferir` (skill `verificar-solucoes`): código 0 depois da distribuição (APIs, steps, colunas, variável e flow nas soluções certas; tipo novo pede regra em `regras.json`).
4. Rode a seção 3 da skill `verificar-multas`.
5. Excluir no DEV os flows declarados como removidos na Task 19 (Power Automate → Soluções → AppBetinhos), depois repetir o item 3 até código 0.

- [ ] **Step 5: Antes de ligar no PROD**

1. Equipe Planner "Frota" no PROD com o Júnior como responsável principal (`cr40f_plannerequipe.cr40f_responsavelprincipal`); confira pela tela do Planner (Equipes).
2. PR `develop → main` (merge do Renan). O caminho é "Publicar soluções" (migration e plugin novos), com ensaio no TEST e aprovação do Renan. Na comparação, os flows removidos aparecem em `fluxosAposentados` (informativo), não em perda.
3. Depois do import no PROD: ligar à mão "Multas | Multas de hoje" (flow novo chega desligado; vincular as conexões das connection references); marcar `cr40f_recebeemailmultas` só na ficha do Júnior.
4. Atualizar a skill do Júnior no claude.ai com o conteúdo de `docs/multas/rotina-sne.md`.
5. "Flow Notificação Email Multa não Indicada": seguir a decisão registrada no PR (Task 19, Step 1).

- [ ] **Step 6: Trava e volta atrás**

- A trava começa em `observar` (padrão da variável). Por 1 a 2 semanas, uma vez por semana, ler no PROD os traces de `Cr40f.Frota.Plugin.MultaTravaPlugin` com `Recusaria` e anotar a origem de cada um. Sem registro inesperado, o Renan grava o valor `travar` em `cr40f_MultasTravaModo` no PROD.
- Volta atrás: valor `observar` na variável (efeito imediato, sem publicação); se preciso, PR de revert pela `develop`.
