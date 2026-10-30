param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  [switch] $Aplicar
)

# Antes do import: variavel de ambiente que no alvo so tem valor padrao (sem valor atual) ganha um valor atual igual ao padrao.
# O pacote do DEV traz a definicao com o padrao de la (vazio para segredos retirados da solucao em 10/2026) e substituiria o
# padrao do alvo; o valor atual nao viaja em solucao e sobrevive. Ensaio de 30/10/2026: Cielo, Graph e Jev perderiam o valor.
# Nunca imprime valores, so os nomes. Sem -Aplicar, so lista (codigo 0: e informativo).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
$alvos = @()
foreach ($v in @(Read-DvAll $dv "environmentvariabledefinitions?`$select=environmentvariabledefinitionid,schemaname,defaultvalue&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)")) {
  # So variaveis proprias: as msdyn_* sao da Microsoft e nao vem no pacote do DEV.
  if (-not $v.defaultvalue -or [string] $v.schemaname -notmatch "^(cr40f|new)_") { continue }
  $valores = @($v.environmentvariabledefinition_environmentvariablevalue)
  if ($valores.Count -and $valores[0].value) { continue }
  $alvos += $v
}
Write-Step "variaveis so com valor padrao em $($dv.Host): $($alvos.Count)"
$alvos | ForEach-Object { Write-Step "  $($_.schemaname)" }
if (-not $Aplicar -or $alvos.Count -eq 0) { return }

$falhas = @()
foreach ($v in $alvos) {
  $corpo = @{ schemaname = [string] $v.schemaname; value = [string] $v.defaultvalue; "EnvironmentVariableDefinitionId@odata.bind" = "/environmentvariabledefinitions($($v.environmentvariabledefinitionid))" }
  try { Invoke-RestMethod -Method Post -Uri "$($dv.Api)/environmentvariablevalues" -Headers $dv.Headers -Body (ConvertTo-Json $corpo -Compress) -ContentType "application/json; charset=utf-8" | Out-Null }
  catch { $falhas += "$($v.schemaname): $((Get-ErroDv $_).Substring(0, 200))" }
}
Write-Step "valores atuais criados: $($alvos.Count - $falhas.Count); falhas: $($falhas.Count)"
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
