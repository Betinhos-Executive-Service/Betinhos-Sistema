param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $TenantId = "organizations",
  [string] $ClientId = "",
  [string] $DataverseConnectionReferenceLogicalName = "",
  [string] $DeepSeekConnectionReferenceLogicalName = "",
  [string] $DeepSeekApiName = "shared_new-5fbetinhos-20deepseek-5f30e351431b40001e",
  [string] $DeepSeekOperationId = "Responses",
  [string] $DefinitionDirectory = "power-platform\flows",
  [string] $InterpretFlowName = "Betinhos | IA | Interpretar conversa",
  [string] $ScheduleFlowName = "Betinhos | IA | Gravar reservas confirmadas",
  [switch] $DeviceCode,
  [switch] $WhatIf
)

try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[provision-ai-flows] $Message" }
function Escape-OData([string] $Value) { return $Value.Replace("'", "''") }
function Get-ResponseStatus($ErrorRecord) { try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 } }

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$environmentBaseUrl = $EnvironmentUrl.TrimEnd("/")
if ($environmentBaseUrl -notmatch "org23b93544\.crm2\.dynamics\.com$") {
  throw "Provisionamento bloqueado: este script aceita apenas o ambiente DEV org23b93544."
}

if ([string]::IsNullOrWhiteSpace($DataverseConnectionReferenceLogicalName)) { $DataverseConnectionReferenceLogicalName = $env:AI_SCHEDULE_DATAVERSE_CONNECTION_REFERENCE }
if ([string]::IsNullOrWhiteSpace($DeepSeekConnectionReferenceLogicalName)) { $DeepSeekConnectionReferenceLogicalName = $env:AI_SCHEDULE_DEEPSEEK_CONNECTION_REFERENCE }
if ([string]::IsNullOrWhiteSpace($DataverseConnectionReferenceLogicalName) -or $DataverseConnectionReferenceLogicalName -match "PREENCHER|__") {
  throw "Connection Reference Dataverse ausente. Use -DataverseConnectionReferenceLogicalName ou AI_SCHEDULE_DATAVERSE_CONNECTION_REFERENCE."
}
if ([string]::IsNullOrWhiteSpace($DeepSeekConnectionReferenceLogicalName) -or $DeepSeekConnectionReferenceLogicalName -match "PREENCHER|__") {
  throw "Connection Reference DeepSeek ausente. Use -DeepSeekConnectionReferenceLogicalName ou AI_SCHEDULE_DEEPSEEK_CONNECTION_REFERENCE."
}
if ($DeepSeekApiName -match "PREENCHER|__" -or $DeepSeekOperationId -match "PREENCHER|__") { throw "API/operationId do Custom Connector DeepSeek não podem ser placeholders." }

$definitionRoot = (Resolve-Path $DefinitionDirectory -ErrorAction Stop).Path
$definitions = @(
  @{ Name = $InterpretFlowName; File = Join-Path $definitionRoot "ai_schedule_interpret.json" },
  @{ Name = $ScheduleFlowName; File = Join-Path $definitionRoot "ai_schedule_schedule.json" }
)
foreach ($definition in $definitions) {
  if (-not (Test-Path -LiteralPath $definition.File -PathType Leaf)) {
    throw "Definição ausente: $($definition.File). Crie o JSON solution-aware antes de ativar os flows."
  }
}

function Replace-Token([string] $Text, [string] $Token, [string] $Value) {
  return $Text.Replace($Token, $Value)
}
function Remove-ParseJsonPatterns($Node) {
  if ($Node -is [System.Array]) { foreach ($item in $Node) { Remove-ParseJsonPatterns $item }; return }
  if ($Node -isnot [pscustomobject]) { return }
  foreach ($property in @($Node.PSObject.Properties)) {
    if ($property.Name -in @("pattern", "patternProperties")) { $Node.PSObject.Properties.Remove($property.Name) }
    else { Remove-ParseJsonPatterns $property.Value }
  }
}
function Read-Definition([string] $Path) {
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $schemaPath = Join-Path $root "docs\power-platform\ai_schedule_proposal.schema.json"
  if (-not (Test-Path -LiteralPath $schemaPath -PathType Leaf)) { throw "Schema da proposta não encontrado: $schemaPath" }
  $schemaObject = Get-Content -LiteralPath $schemaPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $parseSchema = $schemaObject | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  Remove-ParseJsonPatterns $parseSchema
  $text = Replace-Token $text "__DV_CONNECTION_REF__" $DataverseConnectionReferenceLogicalName
  $text = Replace-Token $text "__DEEPSEEK_CONNECTION_REF__" $DeepSeekConnectionReferenceLogicalName
  $text = Replace-Token $text "__DEEPSEEK_API_NAME__" $DeepSeekApiName
  $text = Replace-Token $text "__DEEPSEEK_OPERATION_ID__" $DeepSeekOperationId
  if (($text -replace "__AI_SCHEDULE_SCHEMA_JSON__", "") -match "__[_A-Z0-9]+__|PREENCHER") { throw "Ainda existem placeholders na definição $Path." }
  try { $definition = $text | ConvertFrom-Json -ErrorAction Stop } catch { throw "JSON inválido em $Path`: $($_.Exception.Message)" }
  if ($definition.actions.PSObject.Properties.Name -contains "Call_DeepSeek") {
    $schemaSlot = $definition.actions.Call_DeepSeek.inputs.parameters.body.text.format.schema
    if ($schemaSlot -eq "__AI_SCHEDULE_SCHEMA_JSON__") { $definition.actions.Call_DeepSeek.inputs.parameters.body.text.format.schema = $schemaObject }
  }
  if ($definition.actions.PSObject.Properties.Name -contains "Call_DeepSeek_Fallback") {
    $schemaSlot = $definition.actions.Call_DeepSeek_Fallback.inputs.parameters.body.text.format.schema
    if ($schemaSlot -eq "__AI_SCHEDULE_SCHEMA_JSON__") { $definition.actions.Call_DeepSeek_Fallback.inputs.parameters.body.text.format.schema = $schemaObject }
  }
  if ($definition.actions.PSObject.Properties.Name -contains "Parse_Proposal") {
    if ($definition.actions.Parse_Proposal.inputs.schema -eq "__AI_SCHEDULE_SCHEMA_JSON__") { $definition.actions.Parse_Proposal.inputs.schema = $parseSchema }
  }
  if ($definition.actions.PSObject.Properties.Name -contains "Parse_Primary") {
    if ($definition.actions.Parse_Primary.inputs.schema -eq "__AI_SCHEDULE_SCHEMA_JSON__") { $definition.actions.Parse_Primary.inputs.schema = $parseSchema }
  }
  if ($definition.actions.PSObject.Properties.Name -contains "Use_Fallback_On_Low_Confidence") {
    $fallbackAction = $definition.actions.Use_Fallback_On_Low_Confidence.actions.Call_DeepSeek_Fallback_Low_Confidence
    if ($fallbackAction.inputs.parameters.body.text.format.schema -eq "__AI_SCHEDULE_SCHEMA_JSON__") { $fallbackAction.inputs.parameters.body.text.format.schema = $schemaObject }
  }
  return $definition
}

$definitionObjects = @($definitions | ForEach-Object { @{ Name = $_.Name; Definition = Read-Definition $_.File } })
if ($WhatIf) {
  foreach ($item in $definitionObjects) { Write-Step "dry-run: criaria/atualizaria '$($item.Name)' e ativaria uma única versão" }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ClientId)) { $ClientId = if ($env:DV_CLIENT_ID) { $env:DV_CLIENT_ID } else { "51f81489-12ee-4a9e-aaae-a2591f45987d" } }
$clientGuid = [Guid]::Empty
if (-not [Guid]::TryParse($ClientId, [ref]$clientGuid)) { throw "ClientId inválido: '$ClientId'." }
if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Módulo MSAL.PS não encontrado. Instale com Install-Module MSAL.PS -Scope CurrentUser." }
Import-Module MSAL.PS -ErrorAction Stop
$scope = "$environmentBaseUrl/user_impersonation"
$client = New-MsalClientApplication -ClientId $clientGuid.ToString() -TenantId $TenantId -RedirectUri ([Uri]"http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
try { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent }
catch { if ($DeviceCode) { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode } else { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -Interactive } }
if ([string]::IsNullOrWhiteSpace($tokenResult.AccessToken)) { throw "Falha ao obter token MSAL para $scope" }

$headers = @{
  Authorization = "Bearer $($tokenResult.AccessToken)"
  Accept = "application/json"
  "Content-Type" = "application/json; charset=utf-8"
  Prefer = "return=representation"
  "MSCRM.SolutionUniqueName" = "AppBetinhos"
}
$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
function Invoke-Dataverse([string] $Uri, [string] $Method = "Get", [string] $Body = $null) {
  try {
    if ($Method.ToUpperInvariant() -in @("GET", "HEAD") -and [string]::IsNullOrWhiteSpace($Body)) {
      return Invoke-RestMethod -Uri $Uri -Headers @{ Authorization = $headers.Authorization; Accept = "application/json" } -Method $Method -ErrorAction Stop
    }
  # Windows PowerShell rejeita Content-Type em GET/HEAD sem conteúdo.
  $requestHeaders = @{} + $headers
  if ([string]::IsNullOrWhiteSpace($Body) -and $Method.ToUpperInvariant() -in @("GET", "HEAD")) {
    $requestHeaders.Remove("Content-Type")
    $requestHeaders.Remove("Prefer")
  }
  $request = @{ Uri = $Uri; Headers = $requestHeaders; Method = $Method; ErrorAction = "Stop" }
  if ($null -ne $Body) { $request.Body = $Body }
    return Invoke-RestMethod @request
  } catch {
    if ($_.ErrorDetails.Message -match "ConnectionAuthorizationFailed") {
      throw "A conexão usada pela Connection Reference não está autorizada para o usuário do push. Compartilhe a conexão DeepSeek com esse usuário ou crie uma nova conexão em Power Apps > Conexões e vincule-a à referência '$DeepSeekConnectionReferenceLogicalName'. Detalhe: $($_.ErrorDetails.Message)"
    }
    throw
  }
}

function Ensure-ConnectionReference([string] $LogicalName, [string] $Role) {
  $escaped = Escape-OData $LogicalName
  $rows = @((Invoke-Dataverse "$apiBaseUrl/connectionreferences?`$select=connectionreferenceid,connectionreferencelogicalname,connectorid&`$filter=connectionreferencelogicalname eq '$escaped'").value)
  if ($rows.Count -ne 1) {
    throw "Connection Reference $Role '$LogicalName' não encontrada no DEV. Crie-a dentro da solution AppBetinhos e vincule a conexão real antes de executar npm run push."
  }
  if ($Role -eq "DeepSeek" -and $rows[0].connectorid -ne "/providers/Microsoft.PowerApps/apis/$DeepSeekApiName") {
    throw "Connection Reference DeepSeek '$LogicalName' aponta para '$($rows[0].connectorid)', mas o flow usa '$DeepSeekApiName'."
  }
  Write-Step "Connection Reference $Role validada: $LogicalName"
}

Ensure-ConnectionReference $DataverseConnectionReferenceLogicalName "Dataverse"
Ensure-ConnectionReference $DeepSeekConnectionReferenceLogicalName "DeepSeek"

function Ensure-Workflow([string] $Name, $Definition) {
  $filter = Escape-OData $Name
  $rows = @((Invoke-Dataverse "$apiBaseUrl/workflows?`$select=workflowid,name,statecode,statuscode,modifiedon&`$filter=name eq '$filter'&`$orderby=modifiedon desc").value)
  $target = $rows | Where-Object { [int]$_.statecode -eq 1 } | Select-Object -First 1
  if (-not $target) { $target = $rows | Select-Object -First 1 }

  $definitionJson = $Definition | ConvertTo-Json -Depth 100 -Compress
  $clientData = @{ schemaVersion = "1.0.0.0"; properties = @{ connectionReferences = @{
    shared_commondataserviceforapps = @{ runtimeSource = "embedded"; connection = @{ connectionReferenceLogicalName = $DataverseConnectionReferenceLogicalName }; api = @{ name = "shared_commondataserviceforapps" } }
    $DeepSeekApiName = @{ runtimeSource = "embedded"; connection = @{ connectionReferenceLogicalName = $DeepSeekConnectionReferenceLogicalName }; api = @{ name = $DeepSeekApiName } }
  }; definition = ($definitionJson | ConvertFrom-Json) } } | ConvertTo-Json -Depth 100 -Compress
  $payload = @{ category = 5; name = $Name; type = 1; primaryentity = "none"; clientdata = $clientData } | ConvertTo-Json -Depth 100 -Compress

  if ($target) {
    $id = [string]$target.workflowid
    $uri = "$apiBaseUrl/workflows($id)"
    if ([int]$target.statecode -eq 1) { Invoke-Dataverse $uri "Patch" (@{ statecode = 0; statuscode = 1 } | ConvertTo-Json) | Out-Null }
    Invoke-Dataverse $uri "Patch" (@{ clientdata = $clientData } | ConvertTo-Json -Depth 100) | Out-Null
  } else {
    $created = Invoke-Dataverse "$apiBaseUrl/workflows" "Post" $payload
    $id = [string]$created.workflowid
    $uri = "$apiBaseUrl/workflows($id)"
  }
  foreach ($row in $rows | Where-Object { $_.workflowid -ne $id -and [int]$_.statecode -eq 1 }) {
    Invoke-Dataverse "$apiBaseUrl/workflows($($row.workflowid))" "Patch" (@{ statecode = 0; statuscode = 1 } | ConvertTo-Json) | Out-Null
  }
  Invoke-Dataverse $uri "Patch" (@{ statecode = 1; statuscode = 2 } | ConvertTo-Json) | Out-Null
  Write-Step "Flow ativo: $Name ($id)"
}

foreach ($item in $definitionObjects) { Ensure-Workflow $item.Name $item.Definition }
Write-Step "dois flows provisionados na solution AppBetinhos"
