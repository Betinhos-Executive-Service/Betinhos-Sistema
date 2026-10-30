param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  [string] $Padrao = "^cr40f_AI.*V2$",
  [string] $Backup = "",
  [switch] $Aplicar
)

# Pre-requisito do import com upgrade: as Custom APIs cr40f_AI*V2 nao gerenciadas (legado do pacote OperationsAI, que saiu do DEV
# em 21/10/2026) fazem o stage-and-upgrade falhar. Lista as que batem com -Padrao e, com -Aplicar, guarda o JSON (API, parametros e
# propriedades de resposta) em -Backup e exclui. Nunca toca em Custom API gerenciada. Sem -Aplicar, so lista (codigo 1 se houver).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
$apis = @(Read-DvAll $dv "customapis?`$select=customapiid,uniquename,ismanaged,modifiedon" | Where-Object { -not $_.ismanaged -and [string] $_.uniquename -match $Padrao })
Write-Step "Custom APIs nao gerenciadas que batem com $Padrao em $($dv.Host): $($apis.Count)"
$apis | ForEach-Object { Write-Step "  $($_.uniquename) (modificada em $($_.modifiedon))" }
if ($apis.Count -eq 0) { return }
if (-not $Aplicar) { Write-Step "simulacao: use -Aplicar para excluir."; exit 1 }

if (-not $Backup) { $Backup = Join-Path (Get-Location) "backup\solucoes\custom-apis-legado\$($dv.Host)" }
$Backup = (New-Item -ItemType Directory -Force (Join-Path $Backup (Get-Date -Format "yyyyMMdd-HHmmss"))).FullName
$falhas = @()
foreach ($a in $apis) {
  $id = [string] $a.customapiid
  $copia = [ordered]@{
    api = @(Read-DvAll $dv "customapis?`$filter=customapiid eq $id")[0]
    parametros = @(Read-DvAll $dv "customapirequestparameters?`$filter=_customapiid_value eq $id")
    respostas = @(Read-DvAll $dv "customapiresponseproperties?`$filter=_customapiid_value eq $id")
  }
  Write-JsonFile (Join-Path $Backup "$($a.uniquename).json") $copia
  try { Invoke-RestMethod -Method Delete -Uri "$($dv.Api)/customapis($id)" -Headers $dv.Headers | Out-Null }
  catch { $falhas += "$($a.uniquename): $(Get-ErroDv $_)" }
}
Write-Step "excluidas: $($apis.Count - $falhas.Count); falhas: $($falhas.Count); backup em $Backup"
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
