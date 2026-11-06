param(
  [switch] $Apply,
  [string] $ReferenciaDataverse = 'new_sharedcommondataserviceforapps_5696d',
  [string] $ReferenciaPush = 'new_webpushmotoristas',
  [string] $ReferenciaBanco = 'new_BetinhosBancoMcp',
  [string] $Inicio = '2026-11-04'
)

# Cria (ou atualiza) no DEV o flow "Conciliação do cartão | Diário" (flows/conciliacao-cartao-diario.json) e o inclui na solução do .env.
# Todo dia às 08:07 (São Paulo) lê pelo conector Betinhos Banco MCP as transações dos cartões de crédito (D-10..hoje, nunca antes de -Inicio),
# grava cr40f_transacaocartao (idempotente pelo id do banco), casa com a despesa lançada pelo motorista ou cria uma para ele validar,
# e avisa por push cada motorista com gasto do cartão pendente.
# Ordem: provision-conciliacao-cartao.ps1, conceder-privilegios-conciliacao-cartao.ps1, provision-conector-banco-mcp.ps1, este script.
# O flow só é ligado quando a connection reference do Banco MCP já tem conexão (a key fica só nela); senão nasce desligado.
# Windows: az login no DEV. Linux/macOS: packages/deploy/rodar-linux.sh provision-flow-conciliacao-cartao.ps1 [-Apply]. Sem -Apply roda em DRY RUN.
# Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Write-Step([string] $Message) { Write-Host "[flow-conciliacao-cartao] $Message" }

function Read-DotEnv([string] $Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  return $values
}
$dotEnv = Read-DotEnv (Join-Path $root '.env')
function Get-Setting([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $dotEnv.ContainsKey($Name)) { $value = $dotEnv[$Name] }
  return $value
}

$environmentUrl = (Get-Setting 'DV_ENVIRONMENT_URL')
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw 'DV_ENVIRONMENT_URL ausente no .env.' }
$environmentUrl = $environmentUrl.TrimEnd('/')
$environmentHost = ([Uri] $environmentUrl).Host.ToLowerInvariant()
if ($environmentHost -eq 'orgf261ae8e.crm2.dynamics.com') { throw "$environmentHost é o PROD: este script nunca roda em PROD." }
$blockedHosts = @((Get-Setting 'DV_BLOCKED_HOSTS') -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw 'DV_BLOCKED_HOSTS ausente. Informe o host de PROD.' }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost está bloqueado (PROD exige pedido explícito)." }
$solutionName = Get-Setting 'DV_SOLUTION'
if ([string]::IsNullOrWhiteSpace($solutionName)) { throw 'DV_SOLUTION ausente no .env.' }
if ($Inicio -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "-Inicio deve ser AAAA-MM-DD." }

$dvToken = Get-Setting 'DV_ACCESS_TOKEN'
if ([string]::IsNullOrWhiteSpace($dvToken)) { $dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv }
if (-not $dvToken) { throw 'Token do Dataverse indisponível (rode az login ou informe DV_ACCESS_TOKEN).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  $bytes = (Invoke-WebRequest @params).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return ,@((Dv GET $Path).value) }

Write-Step "ambiente $environmentHost, solução $solutionName, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
$solution = Rows "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'"
if ($solution.Count -ne 1) { throw "Solução $solutionName ausente ou ambígua." }
$solutionId = $solution[0].solutionid

# Pré-requisitos lidos da metadata e dos dados do DEV; no DRY RUN só lista o que falta.
$faltas = New-Object System.Collections.Generic.List[string]
function EntitySet([string] $logical) {
  $r = Rows "EntityDefinitions?`$select=EntitySetName&`$filter=LogicalName eq '$logical'"
  if ($r.Count -ne 1) { $faltas.Add("tabela $logical"); return "__AUSENTE_$logical" }
  return $r[0].EntitySetName
}
function Nav([string] $entidade, [string] $lookup, [string] $alvo) {
  if ($faltas -contains "tabela $entidade") { return '__AUSENTE__' }
  $r = @((Rows "EntityDefinitions(LogicalName='$entidade')/ManyToOneRelationships?`$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity") | Where-Object { $_.ReferencingAttribute -eq $lookup })
  if ($r.Count -ne 1) { $faltas.Add("lookup $entidade.$lookup"); return '__AUSENTE__' }
  if ($r[0].ReferencedEntity -ne $alvo) { throw "$entidade.$lookup aponta para $($r[0].ReferencedEntity), não para $alvo." }
  return $r[0].ReferencingEntityNavigationPropertyName
}

$set = @{
  trans = EntitySet 'cr40f_transacaocartao'; cartao = EntitySet 'cr40f_cartaocorporativo'; despesa = EntitySet 'cr40f_despesaoperacional'
  func = EntitySet 'cr40f_funcionarios'; subs = EntitySet 'new_inscricaopushmotorista'
  categoria = EntitySet 'cr40f_categoriadespesaoperacional'; forma = EntitySet 'cr40f_formapagamentodespesa'
}
$nav = @{
  tCartao = Nav 'cr40f_transacaocartao' 'cr40f_cartao' 'cr40f_cartaocorporativo'
  tMotorista = Nav 'cr40f_transacaocartao' 'cr40f_motorista' 'cr40f_funcionarios'
  tDespesa = Nav 'cr40f_transacaocartao' 'cr40f_despesa' 'cr40f_despesaoperacional'
  dMotorista = Nav 'cr40f_despesaoperacional' 'cr40f_motorista' 'cr40f_funcionarios'
  dCategoria = Nav 'cr40f_despesaoperacional' 'cr40f_categoria' 'cr40f_categoriadespesaoperacional'
  dForma = Nav 'cr40f_despesaoperacional' 'cr40f_formapagamento' 'cr40f_formapagamentodespesa'
}
if ($faltas -notcontains 'tabela cr40f_despesaoperacional') {
  $colunas = @((Rows "EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes?`$select=LogicalName") | ForEach-Object { $_.LogicalName })
  foreach ($c in @('cr40f_conciliadacartao', 'cr40f_origem', 'cr40f_statusoperacional', 'cr40f_statusfinanceiro', 'cr40f_statusanexo', 'cr40f_estabelecimento', 'cr40f_datagasto', 'cr40f_valor', 'cr40f_observacao', 'cr40f_observacaointerna')) {
    if ($colunas -notcontains $c) { $faltas.Add("coluna cr40f_despesaoperacional.$c") }
  }
}

# Registros de referência pelo nome (nunca ids fixos no repo).
function IdPorNome([string] $setName, [string] $idCol, [string] $nome) {
  if ($setName -like '__AUSENTE*') { return $null }
  $r = Rows "$setName`?`$select=$idCol&`$filter=cr40f_nome eq '$($nome.Replace("'", "''"))' and statecode eq 0"
  if ($r.Count -ne 1) { $faltas.Add("registro '$nome' em $setName ($($r.Count) encontrados)"); return $null }
  return $r[0].$idCol
}
$formaCartao = IdPorNome $set.forma 'cr40f_formapagamentodespesaid' 'Cartão de crédito'
# MCC -> categoria; "outros" é o padrão para MCC sem mapa.
$mapaMcc = [ordered]@{
  '5541' = 'Abastecimento'; '5542' = 'Abastecimento'; '5812' = 'Almoço'; '5814' = 'Lanche'; '5462' = 'Café'; '7523' = 'Estacionamento'
  '4784' = 'Pedágio'; '7542' = 'Lavagem'; '7538' = 'Manutenção'; '5533' = 'Manutenção'; '7011' = 'Hospedagem'; '7512' = 'Locação de carro'
  '4121' = 'Aplicativos'; 'outros' = 'Outros'
}
$idsCategoria = @{}
foreach ($nome in @($mapaMcc.Values | Select-Object -Unique)) { $idsCategoria[$nome] = IdPorNome $set.categoria 'cr40f_categoriadespesaoperacionalid' $nome }
$categorias = [ordered]@{}; foreach ($k in $mapaMcc.Keys) { $categorias[$k] = $idsCategoria[$mapaMcc[$k]] }

# Connection references e conectores.
$refs = Rows "connectionreferences?`$select=connectionreferencelogicalname,connectorid,connectionid&`$filter=statecode eq 0"
function Ref([string] $logical) {
  $r = @($refs | Where-Object { $_.connectionreferencelogicalname -eq $logical })
  if ($r.Count -ne 1) { $faltas.Add("connection reference $logical"); return $null }
  return $r[0]
}
$refDv = Ref $ReferenciaDataverse; $refPush = Ref $ReferenciaPush; $refBanco = Ref $ReferenciaBanco
if ($refDv -and $refDv.connectorid -notlike '*/shared_commondataserviceforapps') { throw "$ReferenciaDataverse não é do conector do Dataverse." }
$apiPush = if ($refPush) { $refPush.connectorid } else { '__AUSENTE__' }
$conector = Rows "connectors?`$select=connectorinternalid&`$filter=name eq 'new_betinhos-20banco-20mcp'"
if ($conector.Count -ne 1) { $faltas.Add('conector Betinhos Banco MCP (rode provision-conector-banco-mcp.ps1 -Apply)'); $apiBanco = '__AUSENTE__' }
else { $apiBanco = "/providers/Microsoft.PowerApps/apis/$($conector[0].connectorinternalid)" }
if ($refBanco -and $apiBanco -ne '__AUSENTE__' -and $refBanco.connectorid -ne $apiBanco) { throw "$ReferenciaBanco aponta para $($refBanco.connectorid), esperado $apiBanco." }
$bancoConectado = [bool]($refBanco -and $refBanco.connectionid)

if ($faltas.Count) {
  $msg = "Pré-requisitos ausentes no DEV: $($faltas -join '; ')."
  if ($Apply) { throw $msg }
  Write-Output "DRY RUN: $msg Rode antes os scripts de schema, privilégios e conector."
  return
}

$trocas = [ordered]@{
  '"__CATEGORIAS__"' = ($categorias | ConvertTo-Json -Compress)
  '__DV__' = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'; '__BANCO__' = $apiBanco; '__PUSH__' = $apiPush
  '__SET_TRANS__' = $set.trans; '__SET_CARTAO__' = $set.cartao; '__SET_DESPESA__' = $set.despesa; '__SET_FUNC__' = $set.func
  '__SET_SUBS__' = $set.subs; '__SET_CATEGORIA__' = $set.categoria; '__SET_FORMA__' = $set.forma
  '__FORMA_CARTAO__' = $formaCartao; '__INICIO__' = $Inicio
  '__NAV_T_CARTAO__' = $nav.tCartao; '__NAV_T_MOTORISTA__' = $nav.tMotorista; '__NAV_T_DESPESA__' = $nav.tDespesa
  '__NAV_D_MOTORISTA__' = $nav.dMotorista; '__NAV_D_CATEGORIA__' = $nav.dCategoria; '__NAV_D_FORMA__' = $nav.dForma
}
$apiNome = { param($id) $id.Split('/')[-1] }
$refDataverse = @{ shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaDataverse }; api = @{ name = 'shared_commondataserviceforapps' } } }
$refDiario = $refDataverse + @{
  shared_banco_mcp = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaBanco }; api = @{ name = (& $apiNome $apiBanco) } }
  shared_app_motoristas_push = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaPush }; api = @{ name = (& $apiNome $apiPush) } }
}
$diarioJson = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\conciliacao-cartao-diario.json'), [Text.Encoding]::UTF8)
function TempoReal([string] $qual) {
  $out = & node (Join-Path $PSScriptRoot 'flows\conciliacao-cartao-tempo-real.mjs') $qual
  if ($LASTEXITCODE -ne 0 -or -not $out) { throw "Falha ao gerar o flow em tempo real '$qual'." }
  return ($out -join "`n")
}
# O diário só liga com a conexão do Banco MCP; os de tempo real só usam o Dataverse e ficam sempre ligados.
$alvoDiario = if ($bancoConectado) { 1 } else { 0 }
$publicar = @(
  @{ nome = 'Conciliação do cartão | Diário'; raw = $diarioJson; refs = $refDiario; alvo = $alvoDiario
     descricao = "Todo dia às 08:07 lê as transações dos cartões pelo Banco MCP (D-10..hoje, desde $Inicio), grava cr40f_transacaocartao, casa com a despesa do motorista ou cria uma para ele validar e avisa por push." }
  @{ nome = 'Conciliação do cartão | Reprocessada'; raw = (TempoReal 'reprocessada'); refs = $refDataverse; alvo = 1
     descricao = 'Na hora em que uma compra volta a Pendente com cartão e motorista e sem despesa (Reprocessar/Reabrir no Sistema Betinhos), casa com a despesa do motorista, marca divergência ou cria a despesa para ele validar.' }
  @{ nome = 'Conciliação do cartão | Despesa atualizada'; raw = (TempoReal 'despesa'); refs = $refDataverse; alvo = 1
     descricao = 'Na hora em que a despesa criada pelo cartão sai de Precisa corrigir: completada concilia a transação; recusada ou cancelada marca divergência.' }
)
$definicoes = foreach ($f in $publicar) {
  $raw = $f.raw
  foreach ($k in $trocas.Keys) { $raw = $raw.Replace($k, [string] $trocas[$k]) }
  if ($raw -match '__[A-Z_]+__') { throw "$($f.nome): token não substituído: $($Matches[0])" }
  $f.clientData = @{ properties = @{ definition = ($raw | ConvertFrom-Json); connectionReferences = $f.refs }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress
  $f
}
if (-not $Apply) {
  foreach ($f in $definicoes) {
    $existe = (Rows "workflows?`$select=workflowid&`$filter=name eq '$($f.nome)' and category eq 5").Count
    Write-Output "DRY RUN: '$($f.nome)' seria $(if ($existe) { 'atualizado' } else { 'criado' }) $(if ($f.alvo -eq 1) { 'LIGADO' } else { 'DESLIGADO (a referência do Banco MCP ainda não tem conexão)' })."
  }
  Write-Output "DRY RUN: início $Inicio, $($categorias.Count) MCCs mapeados."
  return
}
$norm = { param($o) ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) }
foreach ($f in $definicoes) {
  $nome = $f.nome
  $flows = Rows "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$nome' and category eq 5"
  if ($flows.Count -gt 1) { throw "Flow '$nome' duplicado no DEV." }
  if ($flows.Count) {
    $flowId = $flows[0].workflowid
    $g = $flows[0].clientdata | ConvertFrom-Json; $n = $f.clientData | ConvertFrom-Json
    $mudou = (& $norm $g.properties.definition) -ne (& $norm $n.properties.definition) -or (& $norm $g.properties.connectionReferences) -ne (& $norm $n.properties.connectionReferences)
    if ($mudou) {
      if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
      Dv PATCH "workflows($flowId)" @{ clientdata = $f.clientData; description = $f.descricao } | Out-Null
    }
    Write-Output "'$nome': definição $(if ($mudou) { 'atualizada' } else { 'já igual' })."
  } else {
    Dv POST workflows @{ name = $nome; category = 5; type = 1; primaryentity = 'none'; clientdata = $f.clientData; description = $f.descricao } | Out-Null
    $flowId = (Rows "workflows?`$select=workflowid&`$filter=name eq '$nome' and category eq 5")[0].workflowid
    Write-Output "'$nome': criado."
  }
  $filtro = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $flowId"
  if (-not (Rows $filtro).Count) {
    Dv POST AddSolutionComponent @{ ComponentId = $flowId; ComponentType = 29; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
    if (-not (Rows $filtro).Count) { throw "Flow '$nome' não entrou na $solutionName." }
  }
  # No CI (Deploy), flow existente fica no estado em que estava: quem liga e desliga é decisão de operação.
  $alvo = if (($env:GITHUB_ACTIONS -eq 'true') -and $flows.Count) { [int]$flows[0].statecode } else { $f.alvo }
  $atual = (Dv GET "workflows($flowId)?`$select=statecode").statecode
  if ($atual -ne $alvo) { Dv PATCH "workflows($flowId)" @{ statecode = $alvo } | Out-Null; $atual = (Dv GET "workflows($flowId)?`$select=statecode").statecode }
  if ($atual -ne $alvo) { throw "'$nome' não ficou com statecode $alvo. Confira as conexões no Power Automate." }
  Write-Output "DEV: '$nome' $(if ($alvo -eq 1) { 'LIGADO' } else { 'DESLIGADO: ligue a conexão do Banco MCP e rode de novo' }) na $solutionName."
}
