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
