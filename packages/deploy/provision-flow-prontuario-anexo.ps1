# Cria (ou atualiza) no DEV o flow "Prontuário | Anexar pelo Claude" (gatilho HTTP chamado pelo script anexar_prontuario.py
# do ambiente de código do claude.ai) e grava a URL do gatilho na variável cr40f_URLFlowAnexarProntuario, que a Custom API
# cr40f_PrepararAnexoProntuario devolve como urlEnvio. Tudo na solução AppBetinhos; o distribuir-apos-push.ps1 leva o flow
# (29) e a definição da variável (380) para as soluções segmentadas. O valor da variável (381) nunca entra na solução.
# A definição vem de flows/prontuario-anexar-claude.json; o site do SharePoint entra por parâmetro (nunca no repo).
# Pré-requisitos: provision-anexo-prontuario.ps1 -Apply, pnpm push:plugin:prontuario:dev (Custom API cr40f_ConsumirAnexoProntuario),
# connection references de Dataverse e SharePoint na solução (a conexão de Dataverse precisa de prvWritecr40f_liberacaoanexo:
# é o execute privilege da API de consumo) e `az login` com acesso ao DEV e ao Power Automate. Idempotente.
# Sem -Apply só confere e mostra o que faria. A URL do gatilho (com sig) é segredo: nunca vai para o console.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[^/]+\.sharepoint\.com/sites/[^/]+$')] [string] $SiteUrl,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaSharePoint,
  [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Prontuário | Anexar pelo Claude'
$customApi = 'cr40f_ConsumirAnexoProntuario'
$envVarName = 'cr40f_URLFlowAnexarProntuario'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
function Write-Step([string] $m) { Write-Host "[flow-prontuario-anexo] $m" }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$baseHeaders = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
# $SemSolucao: o valor da variável de ambiente (tipo 381) nunca entra na solução; cada ambiente mantém o seu.
function Dv([string] $Method, [string] $Path, $Body = $null, [switch] $SemSolucao) {
  if (-not $Apply -and $Method -ne 'GET') { Write-Step "DRY RUN: $Method $($Path.Split('?')[0])"; return $null }
  Write-Step "$Method $($Path.Split('?')[0])"
  $h = $baseHeaders.Clone(); if (-not $SemSolucao) { $h['MSCRM.SolutionUniqueName'] = $solutionName }
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $h; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return @((Dv GET $Path).value) }

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @(Rows "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'")
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid
function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@(Rows $filter).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if ($Apply -and -not @(Rows $filter).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# 1. Dependências: Custom API de consumo e tabela de liberações.
if (@(Rows "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").Count -ne 1) { throw "Custom API $customApi ausente no DEV. Rode 'pnpm push:plugin:prontuario:dev' antes." }
if (-not @(Rows "EntityDefinitions?`$select=MetadataId&`$filter=LogicalName eq 'cr40f_liberacaoanexo'").Count) { throw 'Tabela cr40f_liberacaoanexo ausente. Rode provision-anexo-prontuario.ps1 -Apply antes.' }

# 2. Entity set dos funcionários e navegação da anotação (lidos da metadata, não supostos).
$setFuncionarios = (Dv GET "EntityDefinitions(LogicalName='cr40f_funcionarios')?`$select=EntitySetName").EntitySetName
if (-not $setFuncionarios) { throw 'Tabela cr40f_funcionarios ausente no DEV.' }
$navs = @(Rows "EntityDefinitions(LogicalName='annotation')/ManyToOneRelationships?`$select=ReferencingEntityNavigationPropertyName&`$filter=ReferencedEntity eq 'cr40f_funcionarios'")
if ($navs.Count -ne 1) { throw 'Relacionamento annotation → cr40f_funcionarios não encontrado (HasNotes ligado?).' }
$navAnotacao = $navs[0].ReferencingEntityNavigationPropertyName

# 3. Connection references (Dataverse e SharePoint).
$refs = @(Rows "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0")
# Flow que já existe mantém a referência que usa: com várias no DEV, só o flow novo pede o parâmetro.
$flows = @(Rows "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5")
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
$refsAtuais = if ($flows.Count) { ($flows[0].clientdata | ConvertFrom-Json).properties.connectionReferences } else { $null }
function Referencia([string] $conector, [string] $preferida, [string] $parametro) {
  if (-not $preferida -and $refsAtuais -and $refsAtuais.PSObject.Properties[$conector]) { $preferida = $refsAtuais.$conector.connection.connectionReferenceLogicalName }
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    if (@($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida }).Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -$parametro."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse 'ReferenciaDataverse'
$refSharePoint = Referencia 'shared_sharepointonline' $ReferenciaSharePoint 'ReferenciaSharePoint'

# 4. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\prontuario-anexar-claude.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__SITE_URL__', $SiteUrl.TrimEnd('/')).Replace('__SET_FUNCIONARIOS__', $setFuncionarios).Replace('__NAV_ANOTACAO__', $navAnotacao)
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json
$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_sharepointonline = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refSharePoint }; api = @{ name = 'shared_sharepointonline' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress
$descricao = 'Recebe do script do Claude (claude.ai) fotos/PDF com uma liberação de uso único, valida pela Custom API cr40f_ConsumirAnexoProntuario, salva no SharePoint (Funcionarios/<id>/Anotacoes) e cria uma anotação no funcionário.'

# 5. Cria ou atualiza o flow, inclui na solução e ativa.
if ($flows.Count) {
  $flowId = $flows[0].workflowid
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
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = $descricao } | Out-Null
  if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
  $flowId = @(Rows "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5")[0].workflowid
}
Include $flowId 29
if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
# No CI (Deploy), flow existente desligado no DEV continua desligado: quem desliga é decisão de operação.
if (($env:GITHUB_ACTIONS -eq 'true') -and $flows.Count -and $flows[0].statecode -ne 1) { Write-Output "DEV: '$flowName' mantido desligado (estava desligado)."; return }
$flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }

# No CI a URL do gatilho de um flow existente não muda: não lê nem regrava a variável.
if ($env:GITHUB_ACTIONS -eq 'true') { Write-Output 'URL do gatilho mantida: flow existente.'; Write-Output "DEV: '$flowName' ativo ($($flow.resourceid)); tudo na $solutionName."; return }
# 6. URL do gatilho (com sig): só para a variável de ambiente; nunca no console.
$ft = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
if (-not $ft) { throw 'Token do Power Automate indisponível.' }
$callback = $null
for ($i = 1; $i -le 3 -and -not $callback; $i++) {
  try {
    $callback = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flow.resourceid)/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $ft" } -ContentType 'application/json' -Body '{}' -TimeoutSec 30).response.value
  } catch { if ($i -eq 3) { throw 'listCallbackUrl falhou (detalhe omitido para não expor a URL).' }; Start-Sleep -Seconds 3 }
}
if (-not $callback) { throw 'URL do gatilho indisponível.' }

$defs = @(Rows "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'")
if (-not $defs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $envVarName; displayname = 'URL Flow Anexar no Prontuário (Claude)'; type = 100000000; description = 'URL do gatilho HTTP do flow "Prontuário | Anexar pelo Claude" (contém sig). Lida só pela Custom API cr40f_PrepararAnexoProntuario.' } | Out-Null
  $defs = @(Rows "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'")
}
$defId = $defs[0].environmentvariabledefinitionid
Include $defId 380
$vals = @(Rows "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId")
if ($vals.Count -gt 1) { throw "Variável $envVarName com valores ambíguos." }
if ($vals.Count) { Dv PATCH "environmentvariablevalues($($vals[0].environmentvariablevalueid))" @{ value = $callback } -SemSolucao | Out-Null }
else { Dv POST environmentvariablevalues @{ value = $callback; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } -SemSolucao | Out-Null }
$valor = @(Rows "environmentvariablevalues?`$select=value&`$filter=_environmentvariabledefinitionid_value eq $defId")
if ($valor.Count -ne 1 -or $valor[0].value -ne $callback) { throw "Variável $envVarName não ficou com a URL do gatilho." }
$callback = $null
Write-Output "DEV: '$flowName' ativo ($($flow.resourceid)); URL do gatilho gravada em $envVarName (valor não exibido); tudo na $solutionName."
