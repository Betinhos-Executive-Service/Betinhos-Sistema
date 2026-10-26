param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [string] $DllPath = "",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply,
  [switch] $DeviceCode,
  [switch] $AddExistingToSolution
)

# Registra Betinhos.Planner.AutoNumberGuard: Create de cr40f_pedidodecotacao, PreValidation (10), síncrono.
# Mesmo padrão do Betinhos.AutoNumberGuard da Geral. Sem -Apply executa apenas dry-run.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AssemblyLogicalName = "Betinhos.Planner.AutoNumberGuard"
$TypeName = "Betinhos.Planner.AutoNumberGuard.QuoteAutoNumberGuardPlugin"
$TableName = "cr40f_pedidodecotacao"
$StepName = "Betinhos.Planner.AutoNumberGuard - Pedido de Cotacao Create PreValidation"
# IDs fixos (criados no DEV e incluídos na AppBetinhos). Em PROD, onde a AppBetinhos é gerenciada, o registro
# manual usa os mesmos IDs para o próximo import da solução adotar os componentes em vez de duplicá-los.
$FixedAssemblyId = "44d06424-8fc1-f111-aaaf-7ced8da8c473"
$FixedPluginTypeId = "47d06424-8fc1-f111-aaaf-7ced8da8c473"
$FixedStepId = "48d06424-8fc1-f111-aaaf-7ced8da8c473"
$script:useSolutionHeader = $true

function Write-Step([string] $Message) { Write-Host "[quote-autonumber-guard] $Message" }
function Escape-OData([string] $Value) { return $Value.Replace("'", "''") }
function New-Bind([string] $EntitySet, [string] $Id) { return "/$EntitySet($Id)" }

function Get-AccessToken([string] $BaseUrl, [switch] $UseDeviceCode) {
  $envToken = [Environment]::GetEnvironmentVariable("PLANNER_NOTIFICATION_ACCESS_TOKEN")
  if (-not [string]::IsNullOrWhiteSpace($envToken)) { return $envToken }
  if (-not (Get-Module -ListAvailable MSAL.PS)) {
    throw "MSAL.PS nao encontrado. Instale com Install-Module MSAL.PS -Scope CurrentUser ou defina PLANNER_NOTIFICATION_ACCESS_TOKEN."
  }
  Import-Module MSAL.PS -ErrorAction Stop
  $client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
  Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
  $scope = "$BaseUrl/user_impersonation"
  try {
    $silentToken = (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken
    if (-not [string]::IsNullOrWhiteSpace($silentToken)) { return $silentToken }
  }
  catch {
    if (-not $UseDeviceCode) { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken }
  }
  if ($UseDeviceCode) { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken }
  return (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken
}

$script:baseUrl = $EnvironmentUrl.TrimEnd("/")
$script:token = Get-AccessToken $script:baseUrl -UseDeviceCode:$DeviceCode
if ([string]::IsNullOrWhiteSpace($script:token)) { throw "Falha ao obter token para $script:baseUrl" }

function Get-ErrorDetail($ErrorRecord) {
  try {
    $stream = $ErrorRecord.Exception.Response.GetResponseStream()
    if ($stream) { $reader = New-Object IO.StreamReader($stream); try { return $reader.ReadToEnd() } finally { $reader.Dispose() } }
  } catch {}
  return [string]$ErrorRecord.Exception.Message
}

function Invoke-DataverseRequest {
  param([Parameter(Mandatory = $true)] [string] $Method, [Parameter(Mandatory = $true)] [string] $Path, [object] $Body)
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "return=representation" }
  if ($script:useSolutionHeader) { $headers["MSCRM.SolutionUniqueName"] = $SolutionUniqueName }
  if ($Method -eq "PATCH") { $headers["If-Match"] = "*" }
  $params = @{ Method = $Method; Uri = "$script:baseUrl/api/data/v9.2/$Path"; Headers = $headers; ContentType = "application/json; charset=utf-8" }
  if ($null -ne $Body) { $params.Body = $Body | ConvertTo-Json -Depth 12 -Compress }
  $last = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try { return Invoke-RestMethod @params }
    catch {
      $last = $_; $status = $null
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      $retry = $null -eq $status -or $status -eq 408 -or $status -eq 429 -or $status -ge 500
      if ($attempt -eq 4 -or -not $retry -or $Method -eq "POST") { break }
      Start-Sleep -Seconds ($attempt * 2)
    }
  }
  throw "Dataverse $Method $Path falhou: $(Get-ErrorDetail $last)"
}

function Get-Rows([string] $EntitySet, [string] $Select, [string] $Filter) {
  $path = "${EntitySet}?`$select=$Select"
  if ($Filter) { $path += "&`$filter=$([Uri]::EscapeDataString($Filter))" }
  $response = Invoke-DataverseRequest -Method GET -Path $path
  if ($response -and $response.PSObject.Properties.Name -contains "value") { return @($response.value) }
  return @($response)
}

function Get-Single([string] $EntitySet, [string] $Select, [string] $Filter, [string] $Label) {
  $rows = @(Get-Rows $EntitySet $Select $Filter)
  if ($rows.Count -ne 1) { throw "$Label`: esperado 1 registro, encontrado $($rows.Count)." }
  return $rows[0]
}

function Get-AssemblyRows { return @(Get-Rows "pluginassemblies" "pluginassemblyid,name,version" "name eq '$AssemblyLogicalName'") }
function Get-TypeRows { return @(Get-Rows "plugintypes" "plugintypeid,typename,_pluginassemblyid_value" "typename eq '$TypeName'") }
function Get-Message { return Get-Single "sdkmessages" "sdkmessageid,name" "name eq 'Create'" "sdkmessage Create" }
function Get-Filter([string] $MessageId) {
  $metadata = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName,ObjectTypeCode" "LogicalName eq '$TableName'")
  if ($metadata.Count -ne 1) { throw "Metadata da tabela $TableName nao encontrada." }
  $code = [string]$metadata[0].ObjectTypeCode
  $rows = @(Get-Rows "sdkmessagefilters" "sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value" "_sdkmessageid_value eq $MessageId") | Where-Object { [string]$_.primaryobjecttypecode -eq $TableName -or [string]$_.primaryobjecttypecode -eq $code }
  if (@($rows).Count -ne 1) { throw "sdkmessagefilter Create/$TableName`: esperado 1 registro, encontrado $(@($rows).Count)." }
  return @($rows)[0]
}
function Get-Step([string] $TypeId, [string] $MessageId, [string] $FilterId) { return @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid,name,mode,stage,statecode" "_eventhandler_value eq $TypeId and _sdkmessageid_value eq $MessageId and _sdkmessagefilterid_value eq $FilterId and stage eq 10") }
function Get-Solution { return Get-Single "solutions" "solutionid,uniquename,ismanaged" "uniquename eq '$(Escape-OData $SolutionUniqueName)'" "Solucao $SolutionUniqueName" }
function Get-SolutionComponent([string] $SolutionId, [string] $ObjectId, [int] $ComponentType) { return @(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $SolutionId and objectid eq $ObjectId and componenttype eq $ComponentType") }
function Ensure-SolutionComponent([string] $SolutionId, [string] $ObjectId, [int] $ComponentType, [string] $Label) {
  $existing = @(Get-SolutionComponent $SolutionId $ObjectId $ComponentType)
  if ($existing.Count -gt 1) { throw "$Label duplicado na solucao." }
  if ($existing.Count -eq 1) { return }
  Invoke-DataverseRequest -Method POST -Path "AddSolutionComponent" -Body @{ ComponentId = $ObjectId; ComponentType = $ComponentType; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false } | Out-Null
  if (@(Get-SolutionComponent $SolutionId $ObjectId $ComponentType).Count -ne 1) { throw "$Label nao foi incluido na solucao." }
}

# As duas colunas protegidas precisam continuar com numeração automática; sem isso, remover o valor deixaria o registro sem número.
foreach ($column in @("cr40f_numerodacotacao", "cr40f_titulo")) {
  $attr = Invoke-DataverseRequest -Method GET -Path "EntityDefinitions(LogicalName='$TableName')/Attributes(LogicalName='$column')/Microsoft.Dynamics.CRM.StringAttributeMetadata?`$select=LogicalName,AutoNumberFormat"
  if ([string]::IsNullOrWhiteSpace([string]$attr.AutoNumberFormat)) { throw "$TableName.$column nao tem AutoNumberFormat neste ambiente; registro abortado." }
  Write-Step "$column AutoNumberFormat=$($attr.AutoNumberFormat)"
}

$solution = Get-Solution
if ([bool]$solution.ismanaged) {
  # PROD: solução gerenciada. Registra fora da solução, com os IDs fixos do DEV.
  if ($AddExistingToSolution) { throw "Solucao $SolutionUniqueName e gerenciada; rode sem -AddExistingToSolution." }
  $script:useSolutionHeader = $false
  Write-Step "Solucao $SolutionUniqueName gerenciada: registro fora da solucao com IDs do DEV."
}
$message = Get-Message
$filter = Get-Filter ([string]$message.sdkmessageid)

if (-not $DllPath) { $DllPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "power-platform\plugins\QuoteAutoNumberGuard\bin\Release\net462\Betinhos.Planner.AutoNumberGuard.dll" }
if (-not (Test-Path -LiteralPath $DllPath)) { throw "DLL nao encontrada: $DllPath. Rode dotnet build em Release antes." }
$resolvedDll = (Resolve-Path -LiteralPath $DllPath).Path
$assemblyName = [Reflection.AssemblyName]::GetAssemblyName($resolvedDll)
$tokenBytes = $assemblyName.GetPublicKeyToken()
if (-not $tokenBytes) { throw "DLL sem assinatura forte: $resolvedDll" }
$publicKeyToken = ([BitConverter]::ToString($tokenBytes)).Replace("-", "").ToLowerInvariant()
$assemblyPayload = @{ name = $AssemblyLogicalName; content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($resolvedDll)); isolationmode = 2; sourcetype = 0; version = [string]$assemblyName.Version; culture = "neutral"; publickeytoken = $publicKeyToken; description = "Garante a numeracao automatica de cr40f_pedidodecotacao em creates externos (MCP/conector)." }

if (-not $Apply) {
  Write-Step "DRY RUN OK: colunas autonumber, solucao, mensagem Create, filtro e DLL assinada ($publicKeyToken) conferidos."
  return
}

$assemblies = @(Get-AssemblyRows)
if ($assemblies.Count -gt 1) { throw "Assembly $AssemblyLogicalName duplicado." }
if ($assemblies.Count -eq 1) {
  $assemblyId = [string]$assemblies[0].pluginassemblyid
  Invoke-DataverseRequest -Method PATCH -Path "pluginassemblies($assemblyId)" -Body $assemblyPayload | Out-Null
} else {
  $assemblyId = [string](Invoke-DataverseRequest -Method POST -Path "pluginassemblies" -Body ($assemblyPayload + @{ pluginassemblyid = $FixedAssemblyId })).pluginassemblyid
}

$types = @(Get-TypeRows)
if ($types.Count -gt 1) { throw "PluginType duplicado." }
if ($types.Count -eq 1) {
  $pluginTypeId = [string]$types[0].plugintypeid
  if ([string]$types[0]._pluginassemblyid_value -ne $assemblyId) { throw "PluginType existente aponta para outro assembly; nenhuma correcao destrutiva foi feita." }
} else {
  $pluginTypeId = [string](Invoke-DataverseRequest -Method POST -Path "plugintypes" -Body @{ plugintypeid = $FixedPluginTypeId; name = "QuoteAutoNumberGuardPlugin"; friendlyname = "Pedido de cotacao - guarda da numeracao automatica"; typename = $TypeName; "pluginassemblyid@odata.bind" = (New-Bind "pluginassemblies" $assemblyId) }).plugintypeid
}

$steps = @(Get-Step $pluginTypeId ([string]$message.sdkmessageid) ([string]$filter.sdkmessagefilterid))
if ($steps.Count -gt 1) { throw "Step duplicado." }
$stepPayload = @{ name = $StepName; description = "Criado por register-quote-autonumber-guard.ps1"; "eventhandler_plugintype@odata.bind" = (New-Bind "plugintypes" $pluginTypeId); "sdkmessageid@odata.bind" = (New-Bind "sdkmessages" $message.sdkmessageid); "sdkmessagefilterid@odata.bind" = (New-Bind "sdkmessagefilters" $filter.sdkmessagefilterid); stage = 10; mode = 0; rank = 1; supporteddeployment = 0 }
if ($steps.Count -eq 1) {
  $stepId = [string]$steps[0].sdkmessageprocessingstepid
  Invoke-DataverseRequest -Method PATCH -Path "sdkmessageprocessingsteps($stepId)" -Body $stepPayload | Out-Null
} else {
  $stepId = [string](Invoke-DataverseRequest -Method POST -Path "sdkmessageprocessingsteps" -Body ($stepPayload + @{ sdkmessageprocessingstepid = $FixedStepId })).sdkmessageprocessingstepid
}

if ($AddExistingToSolution) {
  Ensure-SolutionComponent ([string]$solution.solutionid) $assemblyId 91 "assembly $AssemblyLogicalName"
  Ensure-SolutionComponent ([string]$solution.solutionid) $stepId 92 "step $StepName"
}

$checkStep = @(Get-Step $pluginTypeId ([string]$message.sdkmessageid) ([string]$filter.sdkmessagefilterid))
if (@(Get-AssemblyRows).Count -ne 1 -or @(Get-TypeRows).Count -ne 1 -or $checkStep.Count -ne 1) { throw "Validacao final falhou: assembly, PluginType ou step nao ficou unico." }
if ([int]$checkStep[0].mode -ne 0 -or [int]$checkStep[0].stage -ne 10 -or [int]$checkStep[0].statecode -ne 0) { throw "Validacao final falhou: step nao esta ativo, sincrono e PreValidation." }
if ($AddExistingToSolution -and (@(Get-SolutionComponent ([string]$solution.solutionid) $assemblyId 91).Count -ne 1 -or @(Get-SolutionComponent ([string]$solution.solutionid) $stepId 92).Count -ne 1)) { throw "Validacao final falhou: componentes nao estao na solucao." }
Write-Step "REGISTRO E VALIDACAO OK. Assembly=$assemblyId; PluginType=$pluginTypeId; Step=$stepId"
