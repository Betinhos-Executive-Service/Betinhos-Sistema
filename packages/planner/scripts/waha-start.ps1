param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $projectRoot ".env.waha.local"
$composePath = Join-Path $projectRoot "docker-compose.waha.yml"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo .env.waha.local nao existe. Execute scripts/waha-install.ps1 uma vez."
}

docker compose --env-file $envPath -f $composePath up -d
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel iniciar o WAHA. Verifique o Docker Desktop e a imagem local." }
docker compose --env-file $envPath -f $composePath ps
