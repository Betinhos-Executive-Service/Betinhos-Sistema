# Cria (ou atualiza) no DEV o flow "Flow Despesas | Escalada ao gestor" na solução AppBetinhos. Todo dia às 07:30 (Brasília)
# marca new_aguardandogestor = Sim nas despesas em "Precisa corrigir" (cr40f_statusoperacional = 100000001) que o motorista
# não respondeu há mais de 3 dias (modifiedon) e ainda não esperam o gestor. A definição vem de flows/despesas-escalada.json.
# Design: docs/superpowers/specs/2026-11-10-despesa-devolucao-design.md (entrega E). Flow novo: roda à mão, só do checkout
# principal na develop atualizada, nunca de feature, worktree ou sessão cloud (o Deploy só atualiza flow que já existe).
# Pré-requisitos: colunas da entrega A (provision-despesas-devolucao-schema.ps1), uma connection reference de Dataverse na
# solução e `az login --use-device-code` no DEV. Idempotente.
param(
  [string] $ReferenciaDataverse
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Despesas | Escalada ao gestor'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[despesas-escalada] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# 1. Colunas e tabela que o filtro do flow usa (entrega A).
$set = @((Dv GET "EntityDefinitions?`$select=EntitySetName&`$filter=LogicalName eq 'cr40f_despesaoperacional'").value)
if ($set.Count -ne 1) { throw 'Tabela cr40f_despesaoperacional ausente no DEV.' }
$entitySet = $set[0].EntitySetName
foreach ($coluna in 'cr40f_statusoperacional', 'new_aguardandogestor') {
  if (-not @((Dv GET "EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$coluna'").value).Count) {
    throw "Coluna cr40f_despesaoperacional.$coluna ausente no DEV. Rode provision-despesas-devolucao-schema.ps1 antes."
  }
}

# 2. Connection reference do Dataverse.
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
# Flow que já existe mantém a referência que usa: com várias no DEV, só o flow novo pede o parâmetro.
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
$refsAtuais = if ($flows.Count) { ($flows[0].clientdata | ConvertFrom-Json).properties.connectionReferences } else { $null }
function Referencia([string] $conector, [string] $preferida) {
  if (-not $preferida -and $refsAtuais -and $refsAtuais.PSObject.Properties[$conector]) { $preferida = $refsAtuais.$conector.connection.connectionReferenceLogicalName }
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    $escolhida = @($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida })
    if ($escolhida.Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -ReferenciaDataverse."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse

# 3. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\despesas-escalada.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__SET_DESPESA__', $entitySet)
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 4. Cria ou atualiza o flow, inclui na solução e ativa.
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  # O Dataverse normaliza o clientdata; compara só definição e referências de conexão, ambas normalizadas igual.
  $normalizar = { param($o) if ($null -eq $o) { '' } else { ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) } }
  $guardado = $flows[0].clientdata | ConvertFrom-Json
  $novo = $clientData | ConvertFrom-Json
  $mudou = (& $normalizar $guardado.properties.definition) -ne (& $normalizar $novo.properties.definition) -or
           (& $normalizar $guardado.properties.connectionReferences) -ne (& $normalizar $novo.properties.connectionReferences)
  Write-Output "Definição do flow alterada: $(if ($mudou) { 'sim, atualizando' } else { 'não, mantida' })"
  if ($mudou) {
    if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
    Dv PATCH "workflows($flowId)" @{ clientdata = $clientData } | Out-Null
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Todo dia às 07:30 manda ao gestor (new_aguardandogestor = Sim) a despesa em Precisa corrigir que o motorista não respondeu há mais de 3 dias.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
# No CI (Deploy), flow existente desligado no DEV continua desligado: quem desliga é decisão de operação.
if (($env:GITHUB_ACTIONS -eq 'true') -and $flows.Count -and $flows[0].statecode -ne 1) { Write-Output "DEV: '$flowName' mantido desligado (estava desligado)."; return }
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo na $solutionName."
