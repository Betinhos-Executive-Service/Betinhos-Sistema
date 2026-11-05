param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  [Parameter(Mandatory = $true)] [string] $Arquivo,
  [switch] $Restaurar
)

# A configuracao nao segura de um step viaja na solucao: o import traz a do DEV (environmentId, appUrl do DEV) e a remocao das
# camadas Active apaga a correcao feita no alvo. Caso real: steps do plugin de acesso no PROD em 03/11/2026.
# Sem -Restaurar: grava em $Arquivo a configuracao atual dos steps customizados do alvo (rode antes do import).
# Com -Restaurar: devolve essa configuracao aos steps em que o import ou a remocao das camadas Active a mudou.
# Step novo (nao existia antes) fica com a do DEV: confira a mao. Nunca imprime valores, so os nomes.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
$atuais = @(Read-DvAll $dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,configuration&`$filter=customizationlevel eq 1 and configuration ne null")

if (-not $Restaurar) {
  $mapa = [ordered]@{}
  foreach ($s in $atuais) { $mapa[[string] $s.sdkmessageprocessingstepid] = @{ nome = [string] $s.name; configuration = [string] $s.configuration } }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent ([IO.Path]::GetFullPath($Arquivo))) | Out-Null
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Arquivo), (ConvertTo-Json $mapa -Depth 3), (New-Object Text.UTF8Encoding $false))
  Write-Step "configuracao de $($mapa.Count) steps gravada em $Arquivo"
  return
}

$antes = Get-Content -Raw -Encoding UTF8 -LiteralPath $Arquivo | ConvertFrom-Json
$falhas = @(); $restaurados = 0
foreach ($s in $atuais) {
  $id = [string] $s.sdkmessageprocessingstepid
  $salvo = $antes.PSObject.Properties[$id]
  if (-not $salvo -or $salvo.Value.configuration -ceq [string] $s.configuration) { continue }
  try {
    Invoke-RestMethod -Method Patch -Uri "$($dv.Api)/sdkmessageprocessingsteps($id)" -Headers $dv.Headers -ContentType "application/json; charset=utf-8" `
      -Body ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @{ configuration = $salvo.Value.configuration } -Compress))) | Out-Null
    $restaurados++; Write-Step "  restaurada: $($s.name)"
  } catch { $e = Get-ErroDv $_; $falhas += "$($s.name): $($e.Substring(0, [Math]::Min(200, $e.Length)))" }
}
$novos = @($atuais | Where-Object { -not $antes.PSObject.Properties[[string] $_.sdkmessageprocessingstepid] } | ForEach-Object { $_.name })
Write-Step "configuracoes restauradas: $restaurados; falhas: $($falhas.Count); steps novos com a configuracao do DEV (conferir): $($novos.Count)"
$novos | ForEach-Object { Write-Step "  novo: $_" }
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
