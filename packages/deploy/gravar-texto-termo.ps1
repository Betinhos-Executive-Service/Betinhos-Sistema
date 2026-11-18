param(
  [Parameter(Mandatory)] [string] $EnvironmentUrl,
  [Parameter(Mandatory)] [string] $Versao,
  [switch] $Apply
)
# Grava os textos do termo e do aditivo (docs/multas/termo-<versao>.md e aditivo-<versao>.md) em new_textotermomulta,
# marca os dois como vigentes e desmarca os outros do mesmo tipo. Idempotente: texto igual nao regrava.
# Os registros nao vao nas solucoes: no PROD roda a mao na virada. Sem -Apply so mostra o que faria.
. "$PSScriptRoot\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
$raiz = Resolve-Path "$PSScriptRoot\..\..\docs\multas"
$tipos = @(@{ Arquivo = "termo"; Tipo = 100000000 }, @{ Arquivo = "aditivo"; Tipo = 100000001 })
foreach ($t in $tipos) {
  $caminho = Join-Path $raiz "$($t.Arquivo)-$Versao.md"
  if (-not (Test-Path $caminho)) { throw "Falta $caminho" }
  $texto = ([IO.File]::ReadAllText($caminho, [Text.Encoding]::UTF8) -replace '(?s)^<!--.*?-->\s*', '').Trim()
  $todos = @(Get-Rows "new_textotermomultas" "new_textotermomultaid,new_versao,new_texto,new_vigente" "new_tipo eq $($t.Tipo) and statecode eq 0")
  $atual = $todos | Where-Object { $_.new_versao -eq $Versao } | Select-Object -First 1
  if (-not $Apply) { Write-Step "DRY RUN $($t.Arquivo) ${Versao}: $(if ($atual) { 'atualizaria' } else { 'criaria' }); desmarcaria $(@($todos | Where-Object { $_.new_vigente -and $_.new_versao -ne $Versao }).Count) vigente(s)"; continue }
  if (-not $atual) {
    Invoke-Dv "POST" "new_textotermomultas" @{ new_name = "$($t.Arquivo) $Versao"; new_versao = $Versao; new_tipo = $t.Tipo; new_texto = $texto; new_vigente = $true } | Out-Null
    Write-Step "criado $($t.Arquivo) $Versao"
  } elseif ($atual.new_texto -ne $texto -or -not $atual.new_vigente) {
    Invoke-Dv "PATCH" "new_textotermomultas($($atual.new_textotermomultaid))" @{ new_texto = $texto; new_vigente = $true } | Out-Null
    Write-Step "atualizado $($t.Arquivo) $Versao"
  } else { Write-Step "$($t.Arquivo) $Versao ja igual e vigente" }
  foreach ($o in @($todos | Where-Object { $_.new_vigente -and $_.new_versao -ne $Versao })) {
    Invoke-Dv "PATCH" "new_textotermomultas($($o.new_textotermomultaid))" @{ new_vigente = $false } | Out-Null
    Write-Step "desmarcado $($t.Arquivo) $($o.new_versao)"
  }
}
