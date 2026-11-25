# Grava o token da Infleet como segredo do Worker sem exibi-lo.
# Usa o .env do conector Infleet se existir; senão pede para colar.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot)
$envMcp = Join-Path (Split-Path (Get-Location)) 'Skill Agendamento\infleet-mcp\.env'
if (Test-Path $envMcp) {
  $t = ((Get-Content $envMcp -Raw) -replace '^INFLEET_TOKEN=', '').Trim()
  Write-Host 'Usando o token do .env do conector Infleet.'
} else {
  $sec = Read-Host 'Cole o Bearer token da Infleet' -AsSecureString
  $t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim() -replace '^(?i)bearer\s+', ''
}
if (-not $t) { Write-Host 'Token vazio.' -ForegroundColor Red; exit 1 }
$t | npx wrangler secret put INFLEET_TOKEN
