param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [string] $TechnicalUserEmail = "",
  [string] $DllPath = "",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply,
  [switch] $DeviceCode,
  [switch] $AddExistingToSolution
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[planner-notification-plugin] $Message" }
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
    # Reutiliza o refresh token persistido; Device Code so e necessario na primeira execucao.
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
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "return=representation"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
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

function Get-AssemblyRows { return @(Get-Rows "pluginassemblies" "pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,content" "name eq 'Betinhos.Planner.Notifications'") }
function Get-TypeRows { return @(Get-Rows "plugintypes" "plugintypeid,typename,_pluginassemblyid_value" "typename eq 'Betinhos.Planner.Notifications.PlannerTaskEventNotificationPlugin'") }
function Get-Message { return Get-Single "sdkmessages" "sdkmessageid,name" "name eq 'Create'" "sdkmessage Create" }
function Get-Filter([string] $MessageId) {
  $metadata = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName,ObjectTypeCode" "LogicalName eq 'cr40f_plannertarefaevento'")
  if ($metadata.Count -ne 1) { throw "Metadata da tabela cr40f_plannertarefaevento nao encontrada." }
  $code = [string]$metadata[0].ObjectTypeCode
  $rows = @(Get-Rows "sdkmessagefilters" "sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value" "_sdkmessageid_value eq $MessageId") | Where-Object { [string]$_.primaryobjecttypecode -eq "cr40f_plannertarefaevento" -or [string]$_.primaryobjecttypecode -eq $code }
  if (@($rows).Count -ne 1) { throw "sdkmessagefilter Create/cr40f_plannertarefaevento: esperado 1 registro, encontrado $(@($rows).Count)." }
  return @($rows)[0]
}
function Get-Step([string] $TypeId, [string] $MessageId, [string] $FilterId) { return @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid,name,mode,stage,asyncautodelete,statecode,_eventhandler_value,_sdkmessageid_value,_sdkmessagefilterid_value,_impersonatinguserid_value" "_eventhandler_value eq $TypeId and _sdkmessageid_value eq $MessageId and _sdkmessagefilterid_value eq $FilterId and stage eq 40 and statecode eq 0") }
function Get-Solution { return Get-Single "solutions" "solutionid,uniquename,ismanaged" "uniquename eq '$(Escape-OData $SolutionUniqueName)'" "Solucao $SolutionUniqueName" }
function Get-SolutionComponent([string] $SolutionId, [string] $ObjectId, [int] $ComponentType) { return @(Get-Rows "solutioncomponents" "solutioncomponentid,objectid,componenttype" "_solutionid_value eq $SolutionId and objectid eq $ObjectId and componenttype eq $ComponentType") }

function Assert-RequiredTables {
  foreach ($table in @("cr40f_plannertarefaevento", "cr40f_funcionarios", "cr40f_plannertarefa")) {
    $rows = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
    if ($rows.Count -ne 1) { throw "Tabela obrigatoria $table nao esta disponivel neste ambiente." }
  }
}
function Get-RunAsUser {
  if ([string]::IsNullOrWhiteSpace($TechnicalUserEmail)) { return $null }
  return Get-Single "systemusers" "systemuserid,fullname,internalemailaddress" "internalemailaddress eq '$(Escape-OData $TechnicalUserEmail)' and isdisabled eq false" "Usuario tecnico $TechnicalUserEmail"
}
function Ensure-SolutionComponent([string] $SolutionId, [string] $ObjectId, [int] $ComponentType, [string] $Label) {
  $existing = @(Get-SolutionComponent $SolutionId $ObjectId $ComponentType)
  if ($existing.Count -gt 1) { throw "$Label duplicado na solucao." }
  if ($existing.Count -eq 1) { return }
  Invoke-DataverseRequest -Method POST -Path "AddSolutionComponent" -Body @{ ComponentId = $ObjectId; ComponentType = $ComponentType; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false } | Out-Null
  if (@(Get-SolutionComponent $SolutionId $ObjectId $ComponentType).Count -ne 1) { throw "$Label nao foi incluido na solucao." }
}

Assert-RequiredTables
$solution = Get-Solution
if ([bool]$solution.ismanaged) { throw "Solucao $SolutionUniqueName e gerenciada. Execute no ambiente DEV com a solucao nao gerenciada." }
$message = Get-Message
$filter = Get-Filter ([string]$message.sdkmessageid)
$runAs = Get-RunAsUser

if (-not $DllPath) { $DllPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "power-platform\plugins\PlannerNotifications\bin\Release\net462\Betinhos.Planner.Notifications.dll" }
if (-not (Test-Path -LiteralPath $DllPath)) { throw "DLL nao encontrada: $DllPath. Rode dotnet build em Release antes." }
$resolvedDll = (Resolve-Path -LiteralPath $DllPath).Path
$assemblyName = [Reflection.AssemblyName]::GetAssemblyName($resolvedDll)
$tokenBytes = $assemblyName.GetPublicKeyToken()
$publicKeyToken = if ($tokenBytes) { ([BitConverter]::ToString($tokenBytes)).Replace("-", "").ToLowerInvariant() } else { "" }
$assemblyBytes = [IO.File]::ReadAllBytes($resolvedDll)
$assemblyPayload = @{ name = "Betinhos.Planner.Notifications"; content = [Convert]::ToBase64String($assemblyBytes); isolationmode = 2; sourcetype = 0; version = [string]$assemblyName.Version; culture = if ($assemblyName.CultureName) { $assemblyName.CultureName } else { "neutral" }; publickeytoken = $publicKeyToken; description = "Native SendAppNotification plugin for Planner task events." }

if (-not $Apply) {
  Write-Step "DRY RUN OK: tabelas, solucao, mensagem Create, filtro e DLL assinada conferidos."
  return
}

$assemblies = @(Get-AssemblyRows)
if ($assemblies.Count -gt 1) { throw "Assembly Betinhos.Planner.Notifications duplicado." }
if ($assemblies.Count -eq 1) {
  $assemblyId = [string]$assemblies[0].pluginassemblyid
  Invoke-DataverseRequest -Method PATCH -Path "pluginassemblies($assemblyId)" -Body $assemblyPayload | Out-Null
} else {
  $assemblyId = [string](Invoke-DataverseRequest -Method POST -Path "pluginassemblies" -Body $assemblyPayload).pluginassemblyid
}

$types = @(Get-TypeRows)
if ($types.Count -gt 1) { throw "PluginType duplicado." }
if ($types.Count -eq 1) {
  $pluginTypeId = [string]$types[0].plugintypeid
  if ([string]$types[0]._pluginassemblyid_value -ne $assemblyId) { throw "PluginType existente aponta para outro assembly; nenhuma correcao destrutiva foi feita." }
} else {
  $pluginTypeId = [string](Invoke-DataverseRequest -Method POST -Path "plugintypes" -Body @{ name = "PlannerTaskEventNotificationPlugin"; friendlyname = "PlannerTaskEventNotificationPlugin"; typename = "Betinhos.Planner.Notifications.PlannerTaskEventNotificationPlugin"; "pluginassemblyid@odata.bind" = (New-Bind "pluginassemblies" $assemblyId) }).plugintypeid
}

$steps = @(Get-Step $pluginTypeId ([string]$message.sdkmessageid) ([string]$filter.sdkmessagefilterid))
if ($steps.Count -gt 1) { throw "Step de notificacao duplicado." }
$stepPayload = @{ name = "Planner Notifications - Tarefa evento"; description = "Criado por register-planner-notification-plugin.ps1"; "eventhandler_plugintype@odata.bind" = (New-Bind "plugintypes" $pluginTypeId); "sdkmessageid@odata.bind" = (New-Bind "sdkmessages" $message.sdkmessageid); "sdkmessagefilterid@odata.bind" = (New-Bind "sdkmessagefilters" $filter.sdkmessagefilterid); stage = 40; mode = 1; asyncautodelete = $false; rank = 1; supporteddeployment = 0 }
if ($runAs) { $stepPayload["impersonatinguserid@odata.bind"] = New-Bind "systemusers" $runAs.systemuserid }
if ($steps.Count -eq 1) {
  $stepId = [string]$steps[0].sdkmessageprocessingstepid
  Invoke-DataverseRequest -Method PATCH -Path "sdkmessageprocessingsteps($stepId)" -Body $stepPayload | Out-Null
} else {
  $stepId = [string](Invoke-DataverseRequest -Method POST -Path "sdkmessageprocessingsteps" -Body $stepPayload).sdkmessageprocessingstepid
}

if ($AddExistingToSolution) {
  Ensure-SolutionComponent ([string]$solution.solutionid) $assemblyId 91 "assembly Betinhos.Planner.Notifications"
  Ensure-SolutionComponent ([string]$solution.solutionid) $stepId 92 "step Planner Notifications - Tarefa evento"
}

$checkAssembly = @(Get-AssemblyRows)
$checkType = @(Get-TypeRows)
$checkStep = @(Get-Step $pluginTypeId ([string]$message.sdkmessageid) ([string]$filter.sdkmessagefilterid))
if ($checkAssembly.Count -ne 1 -or $checkType.Count -ne 1 -or $checkStep.Count -ne 1) { throw "Validacao final falhou: assembly, PluginType ou step nao ficou unico." }
if ([int]$checkStep[0].mode -ne 1 -or [int]$checkStep[0].stage -ne 40 -or [bool]$checkStep[0].asyncautodelete) { throw "Validacao final falhou: step nao esta assincrono PostOperation sem auto-delete." }
if ($AddExistingToSolution) {
  if (@(Get-SolutionComponent ([string]$solution.solutionid) $assemblyId 91).Count -ne 1 -or @(Get-SolutionComponent ([string]$solution.solutionid) $stepId 92).Count -ne 1) { throw "Validacao final falhou: componentes nao estao na solucao." }
}
Write-Step "REGISTRO E VALIDACAO OK. Assembly=$assemblyId; PluginType=$pluginTypeId; Step=$stepId"
