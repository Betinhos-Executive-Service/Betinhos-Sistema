param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply,
  # Religa os flows antigos que estavam ligados antes da virada (ultimo snapshot) e so entao desliga os novos.
  [switch] $Reverter,
  [switch] $DeviceCode
)

. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

# Virada do aviso ao motorista: liga "Flow Aviso Motorista | Enviar/Vigia" e so depois desliga "Novo Servico",
# "Retirado da Agenda" e "Resetar". Se alguma etapa falhar antes do desligamento, os antigos seguem ligados.
# A ordem e sempre: novo ligado antes de antigo desligado (e o inverso na reversao). Pode sair push em dobro por
# alguns segundos; nunca fica janela sem aviso. Ver docs/virada-aviso-motorista.md.
# Desligar nao apaga a definicao: os provision-*.ps1 que usam "Novo Servico" como modelo leem o clientdata, que
# continua disponivel com o flow desligado. Nao exclua esses flows.
# Dry-run por padrao. Snapshot do estado em backup/aviso-motorista/ (ignorado no git). Bloqueia PROD.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$newFlowNames = @("Flow Aviso Motorista | Enviar", "Flow Aviso Motorista | Vigia")
$oldFlowIds = @(
  "4fb94870-aed9-f011-8543-000d3a886267", # Flow Notificacao Novo Servico | Motoristas
  "3912fce1-ec26-f111-88b4-7ced8da87663", # Flow Notificacao Servico Retirado da Agenda | Motoristas
  "777f3cf7-6529-f111-88b4-7ced8da86705"  # Flow Resetar "Visualizacao do Motorista" e "Foi Programado" ... 2 | Geral
)
$noticeType = "Betinhos.DriverRecordSharing.DriverNoticePlugin"
$expectedSteps = 3
$pendente = 100000000
$semApp = 100000003
$cancelado = 100000005
$snapshotDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "backup\aviso-motorista"

function Write-Step([string] $Message) { Write-Host "[virada-aviso-motorista] $Message" }

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$scope = "$baseUrl/user_impersonation"
$token = if ($DeviceCode) { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken } else { try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken } }
if (-not $token) { throw "Token DEV indisponivel." }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }

function Request([string] $Method, [string] $Path, [object] $Body) {
  $params = @{ Method = $Method; Uri = "$api/$Path"; Headers = $headers; ContentType = "application/json; charset=utf-8" }
  if ($Method -eq "PATCH") { $params.Headers = $headers.Clone(); $params.Headers["If-Match"] = "*" }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)) }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}

function Get-Rows([string] $Set, [string] $Select, [string] $Filter) {
  return @((Request "GET" "${Set}?`$select=$Select&`$filter=$([Uri]::EscapeDataString($Filter))" $null).value)
}

function Get-FlowById([string] $Id) { return Request "GET" "workflows($Id)?`$select=workflowid,name,statecode" $null }

function Get-NewFlows {
  $flows = @()
  foreach ($name in $newFlowNames) {
    $rows = @(Get-Rows "workflows" "workflowid,name,statecode" "name eq '$name' and category eq 5")
    if ($rows.Count -eq 1) { $flows += $rows[0] }
  }
  return ,$flows
}

function Set-FlowState($Flow, [int] $State) {
  if ([int]$Flow.statecode -eq $State) { return }
  Request "PATCH" "workflows($($Flow.workflowid))" @{ statecode = $State } | Out-Null
  $verified = Get-FlowById $Flow.workflowid
  if ([int]$verified.statecode -ne $State) { throw "Flow '$($Flow.name)' nao ficou em statecode $State." }
  $Flow.statecode = $State
  Write-Step "$($Flow.name): statecode $State"
}

function Get-MissingPrerequisites {
  $missing = @()
  if (@(Get-Rows "EntityDefinitions" "LogicalName" "LogicalName eq 'new_avisomotorista'").Count -ne 1) { $missing += "tabela new_avisomotorista" }
  $types = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$noticeType'")
  if ($types.Count -ne 1) { $missing += "plugin DriverNoticePlugin (publique da main atualizada com npm run push)" }
  else {
    $steps = @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid" "_eventhandler_value eq $($types[0].plugintypeid) and statecode eq 0")
    if ($steps.Count -ne $expectedSteps) { $missing += "steps ativos do DriverNoticePlugin: $($steps.Count) de $expectedSteps" }
  }
  $newFlows = Get-NewFlows
  if ($newFlows.Count -ne $newFlowNames.Count) { $missing += "flows novos: $($newFlows.Count) de $($newFlowNames.Count) (rode packages/deploy/provision-flow-aviso-motorista.ps1 -Apply)" }
  return ,$missing
}

if ($Reverter) {
  $snapshots = @(Get-ChildItem -LiteralPath $snapshotDir -Filter "estado-*.json" -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
  if ($snapshots.Count -eq 0) { throw "Sem snapshot em ${snapshotDir}: nao ha como saber quais flows antigos estavam ligados." }
  $snapshot = [IO.File]::ReadAllText($snapshots[0].FullName) | ConvertFrom-Json
  $wereActive = @($snapshot.flows | Where-Object { [int]$_.statecode -eq 1 })
  $newFlows = Get-NewFlows
  Write-Step "$(if ($Apply) { 'revertendo' } else { 'DRY RUN' }) com $($snapshots[0].Name): religa $($wereActive.Count) antigo(s), depois desliga $($newFlows.Count) novo(s)."
  if (-not $Apply) { return }
  foreach ($flow in $wereActive) { Set-FlowState (Get-FlowById $flow.workflowid) 1 }
  foreach ($flow in $newFlows) { Set-FlowState $flow 0 }
  Write-Step "REVERTIDO. Os steps do plugin seguem ativos: a visualizacao continua zerando na troca e os avisos acumulam Pendente sem entrega; a proxima virada cancela esse acumulado."
  return
}

$oldFlows = @($oldFlowIds | ForEach-Object { Get-FlowById $_ })
$missing = Get-MissingPrerequisites
$toDisable = @($oldFlows | Where-Object { [int]$_.statecode -eq 1 })

if (-not $Apply) {
  Write-Step "DRY RUN: flows antigos a desligar:"
  foreach ($flow in $oldFlows) { Write-Step "  $($flow.name) (statecode $($flow.statecode))" }
  if ($missing.Count) { Write-Step "BLOQUEADO, faltam: $($missing -join '; ')." } else { Write-Step "pre-requisitos OK; use -Apply." }
  return
}
if ($missing.Count) { throw "Virada bloqueada, faltam: $($missing -join '; ')." }

# Repetir a virada com os antigos ja desligados nao pode sobrescrever o snapshot que a reversao usa.
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
if ($toDisable.Count -gt 0 -or @(Get-ChildItem -LiteralPath $snapshotDir -Filter "estado-*.json").Count -eq 0) {
  $snapshotPath = Join-Path $snapshotDir ("estado-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
  $snapshotJson = @{ flows = @($oldFlows | ForEach-Object { @{ workflowid = [string]$_.workflowid; name = [string]$_.name; statecode = [int]$_.statecode } }) } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($snapshotPath, $snapshotJson, (New-Object Text.UTF8Encoding($false)))
  Write-Step "snapshot em $snapshotPath"
}

# 1. Liga o Enviar. Antigos intactos: se isto falhar, nada mudou para o motorista.
#    O corte vem antes: aviso gravado com o Enviar ja ligado esta em entrega e nao pode ser cancelado no passo 2.
$newFlows = Get-NewFlows
$activating = @($newFlows | Where-Object { [int]$_.statecode -eq 0 }).Count -gt 0
$cutoff = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
foreach ($flow in @($newFlows | Where-Object { $_.name -like "*Enviar" })) { Set-FlowState $flow 1 }

# 2. Avisos gravados antes de o Enviar ligar nunca dispararam e foram atendidos pelos flows antigos: sem isto a
#    Vigia acusaria todos como nao entregues. "Sem app" entra junto para nao virar rajada de alertas.
#    Repetir a virada com os novos ja ligados (ex.: depois de falha no passo 3) nao tem acumulado a cancelar.
if ($activating) {
  $backlog = @(Get-Rows "new_avisomotoristas" "new_avisomotoristaid" "(new_situacao eq $pendente or new_situacao eq $semApp) and createdon lt $cutoff")
  foreach ($row in $backlog) { Request "PATCH" "new_avisomotoristas($($row.new_avisomotoristaid))" @{ new_situacao = $cancelado } | Out-Null }
  Write-Step "avisos Pendente ou Sem app anteriores a virada cancelados: $($backlog.Count)"
}

# 3. A Vigia liga depois do passo 2: antes, tomaria o acumulado por nao entregue, alertaria a operacao e reenviaria.
foreach ($flow in @($newFlows | Where-Object { $_.name -like "*Vigia" })) { Set-FlowState $flow 1 }

# 4. So agora desliga os antigos. Falhou no meio: religa os que ja desligou.
$disabled = @()
try {
  foreach ($flow in $toDisable) { Set-FlowState $flow 0; $disabled += $flow }
}
catch {
  foreach ($flow in $disabled) { Set-FlowState $flow 1 }
  throw "Desligamento dos flows antigos falhou; os antigos foram religados e os novos seguem ligados (push em dobro ate corrigir): $($_.Exception.Message)"
}

Write-Step "VIRADA OK: $($newFlows.Count) flows novos ligados, $($toDisable.Count) antigos desligados."
