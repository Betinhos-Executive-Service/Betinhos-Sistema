param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $projectRoot ".env.waha.local"
$sessionsPath = Join-Path $projectRoot ".waha-sessions"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker nao foi encontrado. Instale o Docker Desktop e ative o backend WSL2."
}

if (-not (Test-Path -LiteralPath $envPath)) {
  $apiKey = (([Guid]::NewGuid().ToString("N")) + ([Guid]::NewGuid().ToString("N")))
  $dashboardPassword = (([Guid]::NewGuid().ToString("N")) + ([Guid]::NewGuid().ToString("N")))
  $content = @("WAHA_API_KEY=$apiKey", "WAHA_DASHBOARD_USERNAME=betinhos", "WAHA_DASHBOARD_PASSWORD=$dashboardPassword") -join [Environment]::NewLine
  [IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
  Write-Host "Criado .env.waha.local com chaves aleatorias. Nao compartilhe esse arquivo."
}

New-Item -ItemType Directory -Force -Path $sessionsPath | Out-Null
docker compose version | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Docker Compose nao esta disponivel ou o Docker Desktop nao esta acessivel." }

$composePath = Join-Path $projectRoot "docker-compose.waha.yml"
docker compose --env-file $envPath -f $composePath pull
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel baixar a imagem oficial do WAHA." }

docker compose --env-file $envPath -f $composePath up -d
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel iniciar o WAHA." }

Write-Host "WAHA iniciado em http://127.0.0.1:3000. Dashboard: http://127.0.0.1:3000/dashboard"
