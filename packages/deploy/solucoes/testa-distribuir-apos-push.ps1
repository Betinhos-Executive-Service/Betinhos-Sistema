# Testa distribuir-apos-push.ps1 com distribuidores falsos: o push nunca falha e o aviso so aparece quando a distribuicao nao zera.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$alvo = Join-Path $PSScriptRoot 'distribuir-apos-push.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("testa-apos-push-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }
function Roda([string] $corpo) {
  $falso = Join-Path $tmp ("falso-" + [guid]::NewGuid() + ".ps1")
  Set-Content -Path $falso -Value $corpo -Encoding ASCII
  # O push chama com Stop; aqui o 2>&1 so serve para capturar a saida, sem transformar stderr em erro do teste.
  $ErrorActionPreference = 'Continue'
  $saida = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $alvo -Distribuidor $falso 2>&1 | Out-String
  return @{ Codigo = $LASTEXITCODE; Saida = $saida }
}
try {
  $r = Roda 'param([switch] $Aplicar) if (-not $Aplicar) { exit 9 }; Write-Host "fake ok"; exit 0'
  Confere ($r.Codigo -eq 0 -and $r.Saida -match 'fake ok' -and $r.Saida -notmatch 'ATENCAO') 'distribuicao em zero: sai 0 sem aviso e passa -Aplicar'
  $r = Roda 'exit 1'
  Confere ($r.Codigo -eq 0 -and $r.Saida -match 'ATENCAO') 'conferencia com pendencia: sai 0 com aviso'
  $r = Roda 'throw "quebrou"'
  Confere ($r.Codigo -eq 0 -and $r.Saida -match 'ATENCAO') 'distribuidor que lanca erro: sai 0 com aviso'
  $r = Roda 'exit 0'
  Confere ($r.Codigo -eq 0) 'mutex liberado entre execucoes'
}
finally { Remove-Item -Recurse -Force $tmp }
if ($falhas) { throw "$falhas teste(s) falharam" }
