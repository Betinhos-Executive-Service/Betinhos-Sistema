[CmdletBinding()]
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [Parameter(Mandatory = $true)] [guid] $ExchangeId,
  [Parameter(Mandatory = $true)] [guid] $Driver1AnchorAfter,
  [Parameter(Mandatory = $true)] [guid] $Driver1AnchorBefore,
  [Parameter(Mandatory = $true)] [guid] $Driver2AnchorAfter
)

# E2E do modo da janela (Entre servicos) em DEV, sobre uma troca aberta ja registrada com essas ancoras.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module MSAL.PS -ErrorAction Stop
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$api = "$baseUrl/api/data/v9.2"
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri]"http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = Get-MsalToken -PublicClientApplication $client -Scopes "$baseUrl/user_impersonation" -Silent
$headers = @{ Authorization = "Bearer $($token.AccessToken)"; Accept = "application/json"; "Content-Type" = "application/json; charset=utf-8" }

function Write-Case([string] $Name) { Write-Host "[exchange-window-e2e] $Name OK" }
function Version($Record) { ([string]$Record.'@odata.etag').Replace('W/', '').Replace('"', '') }
function Get-ErrorDetail($ErrorRecord) { ([string]$ErrorRecord.ErrorDetails.Message + " " + [string]$ErrorRecord.Exception.Message) }
function Assert-Fails([string] $Name, [string] $Pattern, [scriptblock] $Action) {
  try { & $Action; throw "$Name foi aceito indevidamente." }
  catch {
    $detail = Get-ErrorDetail $_
    if ($detail -notmatch $Pattern) { throw "$Name falhou de forma inesperada. esperado=$Pattern; detalhe=$detail" }
    Write-Case $Name
  }
}
function Get-Exchange {
  Invoke-RestMethod -Method Get -Headers $headers -Uri "$api/cr40f_trocasdecarros($ExchangeId)?`$select=cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,new_mododajanela,new_localdatroca,_new_m1antesde_value"
}
function Get-Departure([guid] $ServiceId) {
  [DateTime]::Parse((Invoke-RestMethod -Method Get -Headers $headers -Uri "$api/cr40f_reservadeveculoses($ServiceId)?`$select=cr40f_dataehorriodesada").cr40f_dataehorriodesada).ToUniversalTime()
}
function Invoke-Update([hashtable] $Payload) {
  Invoke-RestMethod -Method Post -Uri "$api/cr40f_trocasdecarros($ExchangeId)/Microsoft.Dynamics.CRM.new_AtualizarTrocaDeCarro" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 8))) | Out-Null
}
function Service([guid] $Id) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.cr40f_reservadeveculos'; cr40f_reservadeveculosid = [string]$Id } }

$current = Get-Exchange
$day = [DateTime]::Parse($current.cr40f_iniciodajaneladetroca).ToUniversalTime()

# 1. Cliente antigo (sem modo) recalcula a janela pelas ancoras atuais.
Invoke-Update @{ new_Motivo = 'E2E modo janela: recalculo'; new_VersaoEsperada = (Version $current); new_Inicio = $day.ToString('o'); new_Fim = $day.AddHours(1).ToString('o'); new_Observacao = 'TESTE Claude' }
$after = Get-Exchange
$expectedEnd = Get-Departure $Driver1AnchorBefore
$actualEnd = [DateTime]::Parse($after.cr40f_fimdajaneladetroca).ToUniversalTime()
if ($actualEnd -ne $expectedEnd) { throw "Fim esperado $expectedEnd, obtido $actualEnd." }
if ([int]$after.new_mododajanela -ne 100000001) { throw "Modo perdido no update sem modo." }
Write-Case "UPDATE SEM MODO RECALCULA PELAS ANCORAS"

# 2. Ancora de outro motorista e rejeitada.
Assert-Fails "ANCORA DE OUTRO MOTORISTA" "EXCHANGE_ANCHOR_INVALID" {
  Invoke-Update @{ new_Motivo = 'E2E erro'; new_VersaoEsperada = (Version $after); new_Inicio = $day.ToString('o'); new_Fim = $day.AddHours(1).ToString('o'); new_ModoJanela = 100000001; new_M1DepoisDe = (Service $Driver2AnchorAfter) }
}

# 3. Ordem invertida e rejeitada.
Assert-Fails "ORDEM INVERTIDA" "EXCHANGE_ANCHOR_INVALID" {
  Invoke-Update @{ new_Motivo = 'E2E erro'; new_VersaoEsperada = (Version $after); new_Inicio = $day.ToString('o'); new_Fim = $day.AddHours(1).ToString('o'); new_ModoJanela = 100000001; new_M1DepoisDe = (Service $Driver1AnchorBefore); new_M1AntesDe = (Service $Driver1AnchorAfter) }
}

# 4. Ancora em horario marcado e rejeitada.
Assert-Fails "ANCORA EM HORARIO MARCADO" "EXCHANGE_WINDOW_MODE_INVALID" {
  Invoke-Update @{ new_Motivo = 'E2E erro'; new_VersaoEsperada = (Version $after); new_Inicio = $day.ToString('o'); new_Fim = $day.AddHours(1).ToString('o'); new_ModoJanela = 100000000; new_M1AntesDe = (Service $Driver1AnchorBefore) }
}

# 5. Edicao direta de campo novo e bloqueada pelo guard.
Assert-Fails "EDICAO DIRETA DO MODO" "FORBIDDEN_LIFECYCLE" {
  Invoke-RestMethod -Method Patch -Uri "$api/cr40f_trocasdecarros($ExchangeId)" -Headers $headers -Body (@{ new_mododajanela = 100000000 } | ConvertTo-Json) | Out-Null
}

# 6. Volta para horario marcado com janela explicita e limpa ancoras.
$after = Get-Exchange
$fixedStart = $day.Date.AddHours(17); $fixedEnd = $fixedStart.AddHours(1)
Invoke-Update @{ new_Motivo = 'E2E modo janela: horario marcado'; new_VersaoEsperada = (Version $after); new_Inicio = $fixedStart.ToString('o'); new_Fim = $fixedEnd.ToString('o'); new_ModoJanela = 100000000; new_Local = 'Base Betinhos' }
$fixed = Get-Exchange
if ([int]$fixed.new_mododajanela -ne 100000000 -or $null -ne $fixed._new_m1antesde_value) { throw "Horario marcado nao limpou ancoras." }
Write-Case "TROCA PARA HORARIO MARCADO"

Write-Host "[exchange-window-e2e] TODOS OS CASOS OK"
