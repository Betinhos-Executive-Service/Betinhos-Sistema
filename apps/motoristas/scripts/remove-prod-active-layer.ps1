param(
  [Parameter(Mandatory = $true)] [string] $WebResourceName,
  [string] $EnvironmentUrl = "https://orgf261ae8e.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply
)

# Remove a camada "Active" (nao gerenciada) de um web resource, para ele voltar a servir a versao da
# solucao gerenciada. So age se a camada logo abaixo for a propria solucao (nenhuma outra gerenciada no meio),
# e salva antes o conteudo atual em backup\prod-active-layers\. Sem -Apply, so mostra o que faria.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[remove-active-layer] $Message" }
function Get-Version([string] $Base64) { return [regex]::Match([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64)), '\d+\.\d+\.\d+(?=["''])').Value }

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$scope = "$baseUrl/user_impersonation"
$token = try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }
function Read-Dv([string] $Path) { return Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers }
function Get-Layers([string] $Id) { return @((Read-Dv "msdyn_componentlayers?`$filter=(msdyn_componentid eq '$Id' and msdyn_solutioncomponentname eq 'WebResource')&`$select=msdyn_order,msdyn_solutionname,msdyn_componentjson").value | Sort-Object msdyn_order) }

$rows = @((Read-Dv "webresourceset?`$select=webresourceid,content&`$filter=name eq '$($WebResourceName.Replace("'", "''"))'").value)
if ($rows.Count -ne 1) { throw "Web resource $WebResourceName ausente ou duplicado." }
$id = [string]$rows[0].webresourceid
$layers = Get-Layers $id
Write-Step ("camadas: " + (($layers | ForEach-Object { $_.msdyn_solutionname }) -join " > "))
if ($layers.Count -lt 2 -or $layers[-1].msdyn_solutionname -ne "Active") { Write-Step "sem camada Active no topo; nada a fazer."; return }
if ($layers[-2].msdyn_solutionname -ne $SolutionUniqueName) { throw "Abaixo da Active esta '$($layers[-2].msdyn_solutionname)', nao $SolutionUniqueName. Remover agora serviria a versao dessa outra solucao; resolva-a antes." }
$managedContent = (($layers[-2].msdyn_componentjson | ConvertFrom-Json).Attributes | Where-Object { $_.Key -eq "content" }).Value
Write-Step ("versao atual (Active) {0}; versao que passa a servir ({1}) {2}" -f (Get-Version $rows[0].content), $SolutionUniqueName, (Get-Version $managedContent))
if (-not $Apply) { Write-Step "DRY RUN: use -Apply para remover a camada Active."; return }

$backupDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "backup\prod-active-layers"
New-Item -ItemType Directory -Force $backupDir | Out-Null
$backup = Join-Path $backupDir ("{0}-{1}.html" -f ($WebResourceName -replace '[\\/:*?"<>|]', '_'), (Get-Date -Format "yyyyMMdd-HHmmss"))
[IO.File]::WriteAllBytes($backup, [Convert]::FromBase64String($rows[0].content))
Write-Step "backup: $backup"
Invoke-RestMethod -Method Post -Uri "$api/RemoveActiveCustomization" -Headers $headers -ContentType "application/json" -Body (@{ LogicalName = "webresource"; Id = $id } | ConvertTo-Json -Compress) | Out-Null
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json" -Body (@{ ParameterXml = "<importexportxml><webresources><webresource>{$id}</webresource></webresources></importexportxml>" } | ConvertTo-Json -Compress) | Out-Null
$after = Get-Layers $id
$served = Get-Version (Read-Dv "webresourceset($id)?`$select=content").content
Write-Step ("removida; camadas: {0}; versao servida {1}" -f (($after | ForEach-Object { $_.msdyn_solutionname }) -join " > "), $served)
