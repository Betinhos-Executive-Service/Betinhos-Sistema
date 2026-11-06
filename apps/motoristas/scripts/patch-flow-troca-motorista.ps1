param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply,
  [switch] $DeviceCode
)

. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

# PROVISORIO: sai com a solucao definitiva (tabela new_avisomotorista + plugin), que nao depende da audit.
#
# Na troca de motorista, tres flows leem a tabela audit para confirmar a troca e terminam Cancelled sem agir:
# "Novo Servico" perde a linha quando o DriverRecordSharing grava o veiculo depois (o modifiedon avanca e a linha
# sai da janela de -2 s); "Retirado da Agenda" e "Resetar" leem so top 1, sem espera, e pegam a linha errada.
# Este script faz os tres esperarem 20 s e procurarem a linha do motorista numa janela que comeca 60 s antes do
# modifiedon, da mais nova para a mais antiga. Preserva o estado de cada flow (rascunho continua rascunho).
# Dry-run por padrao. Idempotente. Com -Apply grava backup do clientdata em backup/flow-troca-motorista/.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$WaitSeconds = 20
$WindowStartSeconds = -60
$WindowEndSeconds = 60
$AuditTop = 50
$WindowStartExpression = "@formatDateTime(addSeconds(outputs('Audit_Hora_Base'), $WindowStartSeconds), 'yyyy-MM-ddTHH:mm:ssZ')"
$WindowEndExpression = "@formatDateTime(addSeconds(outputs('Audit_Hora_Base'), $WindowEndSeconds), 'yyyy-MM-ddTHH:mm:ssZ')"
$WindowFilter = " and createdon ge @{outputs('Audit_Janela_Inicio')} and createdon le @{outputs('Audit_Janela_Fim')}"

# IDs iguais no DEV e no PROD (flows de solucao). A busca por ID evita depender dos nomes acentuados.
$flowIds = @(
  "4fb94870-aed9-f011-8543-000d3a886267", # Flow Notificacao Novo Servico | Motoristas
  "3912fce1-ec26-f111-88b4-7ced8da87663", # Flow Notificacao Servico Retirado da Agenda | Motoristas
  "777f3cf7-6529-f111-88b4-7ced8da86705"  # Flow Resetar "Visualizacao do Motorista" e "Foi Programado" ... 2 | Geral
)

function Write-Step([string] $Message) { Write-Host "[flow-troca-motorista] $Message" }

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$scope = "$baseUrl/user_impersonation"
$token = if ($DeviceCode) { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken } else { try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken } }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }

function Request([string] $Method, [string] $Path, [object] $Body) {
  $params = @{ Method = $Method; Uri = "$api/$Path"; Headers = $headers; ContentType = "application/json; charset=utf-8" }
  if ($Method -eq "PATCH") { $params.Headers = $headers.Clone(); $params.Headers["If-Match"] = "*" }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 100 -Compress)) }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}

function Get-Action($Actions, [string] $Name) {
  $property = $Actions.PSObject.Properties[$Name]
  if (-not $property) { throw "Acao '$Name' ausente." }
  return $property.Value
}

function New-Compose([string] $Expression, $RunAfter) {
  return [pscustomobject]@{ type = "Compose"; inputs = $Expression; runAfter = $RunAfter }
}

function RunAfter-Succeeded([string] $Name) {
  $runAfter = New-Object PSObject
  $runAfter | Add-Member -NotePropertyName $Name -NotePropertyValue @("Succeeded")
  return $runAfter
}

# Devolve a lista de mudancas aplicadas em $Actions (vazia = ja estava certo).
function Set-AuditLookup($Actions) {
  $changes = @()
  $list = Get-Action $Actions "List_rows_auditoria"

  if (-not $Actions.PSObject.Properties["Audit_Hora_Base"]) {
    $anchor = if ($list.PSObject.Properties["runAfter"]) { $list.runAfter } else { New-Object PSObject }
    $Actions | Add-Member -NotePropertyName "Audit_Hora_Base" -NotePropertyValue (New-Compose "@coalesce(triggerOutputs()?['body/modifiedon'], utcNow())" $anchor)
    $Actions | Add-Member -NotePropertyName "Audit_Janela_Inicio" -NotePropertyValue (New-Compose $WindowStartExpression (RunAfter-Succeeded "Audit_Hora_Base"))
    $Actions | Add-Member -NotePropertyName "Audit_Janela_Fim" -NotePropertyValue (New-Compose $WindowEndExpression (RunAfter-Succeeded "Audit_Janela_Inicio"))
    $delay = [pscustomobject]@{ type = "Wait"; inputs = [pscustomobject]@{ interval = [pscustomobject]@{ count = $WaitSeconds; unit = "Second" } }; runAfter = (RunAfter-Succeeded "Audit_Janela_Fim") }
    $Actions | Add-Member -NotePropertyName "Delay" -NotePropertyValue $delay
    $list | Add-Member -Force -NotePropertyName "runAfter" -NotePropertyValue (RunAfter-Succeeded "Delay")
    $changes += "espera de $WaitSeconds s e janela criadas"
  }

  $start = Get-Action $Actions "Audit_Janela_Inicio"
  if ([string]$start.inputs -ne $WindowStartExpression) { $start.inputs = $WindowStartExpression; $changes += "janela comeca $WindowStartSeconds s" }
  $end = Get-Action $Actions "Audit_Janela_Fim"
  if ([string]$end.inputs -ne $WindowEndExpression) { $end.inputs = $WindowEndExpression; $changes += "janela termina +$WindowEndSeconds s" }
  $delayAction = Get-Action $Actions "Delay"
  if ([string]$delayAction.inputs.interval.unit -ne "Second" -or [int]$delayAction.inputs.interval.count -lt $WaitSeconds) {
    $delayAction.inputs.interval = [pscustomobject]@{ count = $WaitSeconds; unit = "Second" }
    $changes += "espera de $WaitSeconds s"
  }

  $parameters = $list.inputs.parameters
  if ([string]$parameters.'$filter' -notmatch "createdon ge") { $parameters.'$filter' = [string]$parameters.'$filter' + $WindowFilter; $changes += "filtro por janela" }
  if ([string]$parameters.'$orderby' -ne "createdon desc") { $parameters.'$orderby' = "createdon desc"; $changes += "ordem createdon desc" }
  if ([int]$parameters.'$top' -ne $AuditTop) { $parameters.'$top' = $AuditTop; $changes += "top $AuditTop" }

  # A linha do motorista vem do Filter_array sobre o resultado: nao pode mais depender da primeira linha da audit.
  $filterArray = Get-Action $Actions "Filter_array"
  if ([string]$filterArray.inputs.where -notmatch "cr40f_motorista") { throw "Filter_array nao procura cr40f_motorista." }

  return ,$changes
}

$pending = @()
foreach ($id in $flowIds) {
  $row = Request "GET" "workflows($id)?`$select=workflowid,name,statecode,clientdata,category" $null
  if ([int]$row.category -ne 5) { throw "Workflow $id nao e cloud flow." }
  $clientData = $row.clientdata | ConvertFrom-Json
  $changes = Set-AuditLookup (Get-Action $clientData.properties.definition.actions "Scope").actions
  if ($changes.Count -eq 0) { Write-Step "ja ajustado: $($row.name)"; continue }
  $wasActive = [int]$row.statecode -eq 1
  Write-Step "$(if ($Apply) { 'ajustar' } else { 'DRY RUN' }): $($row.name) (ativo: $wasActive) -> $($changes -join '; ')"
  $pending += [pscustomobject]@{ Id = $id; Name = [string]$row.name; WasActive = $wasActive; Original = [string]$row.clientdata; ClientData = $clientData }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado. Use -Apply para aplicar."; return }
if ($pending.Count -eq 0) { Write-Step "nada a fazer."; return }

$backupDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "backup\flow-troca-motorista"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
foreach ($flow in $pending) {
  [IO.File]::WriteAllText((Join-Path $backupDir "$($flow.Id)-$stamp.json"), $flow.Original, (New-Object Text.UTF8Encoding($false)))
}
Write-Step "backup em $backupDir"

foreach ($flow in $pending) {
  if ($flow.WasActive) { Request "PATCH" "workflows($($flow.Id))" @{ statecode = 0 } | Out-Null }
  try {
    Request "PATCH" "workflows($($flow.Id))" @{ clientdata = ($flow.ClientData | ConvertTo-Json -Depth 100 -Compress) } | Out-Null
  }
  finally {
    if ($flow.WasActive) { Request "PATCH" "workflows($($flow.Id))" @{ statecode = 1 } | Out-Null }
  }
  $verified = Request "GET" "workflows($($flow.Id))?`$select=statecode,clientdata" $null
  $check = Set-AuditLookup (Get-Action ($verified.clientdata | ConvertFrom-Json).properties.definition.actions "Scope").actions
  if ($check.Count -ne 0) { throw "Flow '$($flow.Name)' gravado com divergencia: $($check -join '; ')." }
  if (([int]$verified.statecode -eq 1) -ne $flow.WasActive) { throw "Flow '$($flow.Name)' mudou de estado (statecode $($verified.statecode))." }
  Write-Step "ajustado: $($flow.Name) (statecode $($verified.statecode))"
}
