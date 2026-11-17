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

# Guard: Cancelada (202410007) so e criada; se o valor ja existir com outro rotulo, nao sobrescreve.
$statusAtual = Get-Opcoes $multas "cr40f_status"
$cancelada = @($statusAtual.Opcoes | Where-Object { [int] $_.Value -eq 202410007 -and (Rotulo $_) -cne "Cancelada" })
if ($cancelada.Count) { throw "cr40f_multas.cr40f_status 202410007 ja existe com outro rotulo: $(Rotulo $cancelada[0])." }

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
