param(
  [string] $Distribuidor = (Join-Path $PSScriptRoot "distribuir-solucoes.ps1"),
  [string] $EnvironmentUrl = "",
  [string] $CaixaDeEntrada = "",
  [int] $EsperaMinutos = 10
)

# Roda no fim de toda publicacao no DEV feita pelo push-dev.ps1 (pnpm push local e deploy do CI):
# distribui nas 4 solucoes o que entrou na caixa de entrada e confere. Nunca derruba o push, porque a
# publicacao ja aconteceu; se a conferencia acusar, avisa em destaque. O export e o deploy por solucao
# barram sozinhos enquanto a conferencia nao der zero.
# Um mutex evita dois distribuidores ao mesmo tempo quando varios pushes rodam juntos na maquina.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

# Continue: quem chama (push-dev) usa Stop, e o stderr do distribuidor nao pode virar erro que derruba o push.
$ErrorActionPreference = "Continue"
$mutex = New-Object System.Threading.Mutex($false, "Local\BetinhosDistribuirSolucoes")
$ok = $false
try {
  # Dono anterior encerrado a forca (Ctrl+C) deixa o mutex "abandonado": o WaitOne lanca, mas a posse e nossa.
  $adquirido = $false
  try { $adquirido = $mutex.WaitOne([TimeSpan]::FromMinutes($EsperaMinutos)) }
  catch [System.Threading.AbandonedMutexException] { $adquirido = $true }
  if (-not $adquirido) {
    Write-Warning "[distribuir-apos-push] outro distribuidor ocupado ha $EsperaMinutos min; nada distribuido agora (o proximo push distribui)."
    exit 0
  }
  try {
    Write-Host "[distribuir-apos-push] distribuindo nas 4 solucoes o que entrou na AppBetinhos do DEV"
    # Processo filho: o distribuidor usa StrictMode, ErrorActionPreference Stop e exit, que nao podem vazar para o push.
    # Mesmo ambiente e mesma caixa de entrada do push (o distribuidor recusa host que nao seja o DEV conhecido).
    $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Distribuidor, "-Aplicar")
    if ($EnvironmentUrl) { $argumentos += @("-EnvironmentUrl", $EnvironmentUrl) }
    if ($CaixaDeEntrada) { $argumentos += @("-CaixaDeEntrada", $CaixaDeEntrada) }
    & powershell.exe @argumentos
    $ok = ($LASTEXITCODE -eq 0)
  }
  finally { $mutex.ReleaseMutex() }
}
catch { Write-Warning "[distribuir-apos-push] $($_.Exception.Message)" }
finally { $mutex.Dispose() }

if (-not $ok) {
  Write-Host ""
  Write-Host "ATENCAO: a distribuicao nas 4 solucoes nao ficou em zero (detalhes acima)." -ForegroundColor Yellow
  Write-Host "A publicacao valeu; o export para TEST/PROD fica barrado ate a conferencia zerar." -ForegroundColor Yellow
  Write-Host "Veja a skill verificar-solucoes (causas e o que fazer em cada caso)." -ForegroundColor Yellow
}
exit 0
