param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  [Parameter(Mandatory = $true)] [string] $Foto,
  [Parameter(Mandatory = $true)] [string] $Saida,
  [switch] $DesligarNovos
)

# Depois do import: devolve a cada fluxo e step o estado (ligado/desligado) que a foto de antes registrou. O import com
# --activate-plugins liga o que o ambiente tinha desligado de proposito (ex.: fluxos desativados no PROD por erro conhecido).
# Fluxo ou step novo (sem registro na foto) fica como o import deixou; com -DesligarNovos (TEST travado) e desligado. Grava em $Saida o que mudou; falha se algo nao pode ser mudado.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  # Switch por splat: com -File, "-DesligarNovos:True" (como o Core serializa) e recusado pelo Windows PowerShell.
  $extra = @(); if ($DesligarNovos) { $extra += "-DesligarNovos" }
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Alvo $Alvo -Foto $Foto -Saida $Saida @extra
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$Saida = Initialize-ArquivoDeSaida $Saida
$foto = Read-JsonFile $Foto
$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
if (([string] $foto.ambiente).TrimEnd("/") -ne $dv.Url) { throw "A foto e de $($foto.ambiente), nao de $($dv.Url)." }
$r = Restore-Estados $dv $Alvo $foto -DesligarNovos:$DesligarNovos
Write-JsonFile $Saida ([ordered]@{ mudancas = @($r.Mudancas); falhas = @($r.Falhas) })
Write-Step "estados restaurados em ${Alvo}: $($r.Mudancas.Count) mudanca(s), $($r.Falhas.Count) falha(s); detalhes em $Saida"
$r.Mudancas | ForEach-Object { Write-Step ("  {0} {1}: {2} -> {3}" -f $_.tipo, $_.nome, $_.de, $_.para) }
$r.Falhas | ForEach-Object { Write-Warning $_ }
if ($r.Falhas.Count) { exit 1 }
