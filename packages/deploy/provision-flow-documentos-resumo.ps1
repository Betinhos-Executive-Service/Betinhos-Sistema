# Cria (ou atualiza) no DEV o flow "Documentos | Resumo semanal" e as variáveis new_URLSistemaBetinhos e
# new_EmailAdminAvisos, na solução AppBetinhos. A definição vem de flows/documentos-resumo-semanal.json;
# e-mail da noreply, URL do Sistema e e-mail do admin entram por parâmetro (nunca no repo).
# Pré-requisitos: Custom API cr40f_DocumentosResumoSemanal registrada (pnpm push:plugin:documentos:dev),
# connection references de Dataverse e Office 365 Outlook na solução, e `az login --use-device-code` no DEV.
# Idempotente.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $Remetente,
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://')] [string] $UrlSistema,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $EmailAdmin,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaOutlook
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Documentos | Resumo semanal'
$customApi = 'cr40f_DocumentosResumoSemanal'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[documentos-resumo] $Method $($Path.Split('?')[0])"
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

# 1. A Custom API precisa existir antes do flow.
if (@((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").value).Count -ne 1) {
  throw "Custom API $customApi ausente no DEV. Rode 'pnpm push:plugin:documentos:dev' antes."
}

# 2. Entity set dos destinatários (lido da metadata, não suposto).
$setDestinatarios = (Dv GET "EntityDefinitions(LogicalName='cr40f_avisodestinatario')?`$select=EntitySetName").EntitySetName
if (-not $setDestinatarios) { throw 'Tabela cr40f_avisodestinatario ausente no DEV.' }

# 3. Connection references (Dataverse e Office 365 Outlook).
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
function Referencia([string] $conector, [string] $preferida) {
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    $escolhida = @($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida })
    if ($escolhida.Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -Referencia$(if ($conector -eq 'shared_office365') { 'Outlook' } else { 'Dataverse' })."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse
$refOutlook = Referencia 'shared_office365' $ReferenciaOutlook

# 4. Variáveis de ambiente.
function VariavelDeAmbiente([string] $schema, [string] $display, [string] $valor) {
  $defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value)
  if (-not $defs.Count) {
    Dv POST environmentvariabledefinitions @{ schemaname = $schema; displayname = $display; type = 100000000 } | Out-Null
    $defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value)
  }
  $defId = $defs[0].environmentvariabledefinitionid
  Include $defId 380
  $vals = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)
  if ($vals.Count -gt 1) { throw "Variável $schema com valores ambíguos." }
  if ($vals.Count) { $valId = $vals[0].environmentvariablevalueid; Dv PATCH "environmentvariablevalues($valId)" @{ value = $valor } | Out-Null }
  else {
    Dv POST environmentvariablevalues @{ value = $valor; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } | Out-Null
    $valId = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)[0].environmentvariablevalueid
  }
  # Valor atual NAO entra na solucao (tipo 381): cada ambiente mantem o seu; senao o deploy sobrescreve TEST/PROD com a URL do DEV.
}
VariavelDeAmbiente 'new_URLSistemaBetinhos' 'URL do Sistema Betinhos' $UrlSistema.TrimEnd('/')
VariavelDeAmbiente 'new_EmailAdminAvisos' 'E-mail do administrador dos avisos' $EmailAdmin

# 5. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\documentos-resumo-semanal.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__SET_DESTINATARIOS__', $setDestinatarios).Replace('__REMETENTE__', $Remetente)
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 6. Cria ou atualiza o flow, inclui na solução e ativa.
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
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
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Toda segunda às 07:00 envia, por categoria, o resumo de documentos vencidos, a vencer e faltantes aos destinatários cadastrados no Sistema Betinhos.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo, variáveis configuradas, tudo na $solutionName."
