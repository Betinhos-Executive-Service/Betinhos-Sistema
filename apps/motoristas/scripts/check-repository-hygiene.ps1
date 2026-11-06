$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Regras em tests/repositoryHygiene.test.ts; o comando fica só em package.json (check:hygiene).
Push-Location (Join-Path $PSScriptRoot "..")
try {
  npm run check:hygiene
  if ($LASTEXITCODE -ne 0) { throw "Repositorio reprovado na higiene: veja a saida do teste acima." }
  Write-Host "[hygiene] OK: sem exports, binarios, ZIPs ou URLs credenciadas versionadas."
}
finally {
  Pop-Location
}
