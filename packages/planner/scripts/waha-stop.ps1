param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $projectRoot ".env.waha.local"
$composePath = Join-Path $projectRoot "docker-compose.waha.yml"

if (Test-Path -LiteralPath $envPath) {
  docker compose --env-file $envPath -f $composePath stop
}
