param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $TechnicalUserEmail = "",
  [switch] $DeviceCode
)

if (-not $TechnicalUserEmail) {
  $TechnicalUserEmail = [Environment]::GetEnvironmentVariable("DV_PLUGIN_USER")
}

# O registro Dataverse usa MSAL.PS, que precisa do Windows PowerShell nesta máquina.
if ($PSVersionTable.PSEdition -eq "Core" -or $PSHOME -like "*codex-runtimes*") {
  $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-EnvironmentUrl", $EnvironmentUrl)
  if ($TechnicalUserEmail) { $arguments += @("-TechnicalUserEmail", $TechnicalUserEmail) }
  if ($DeviceCode) { $arguments += "-DeviceCode" }
  & $windowsPowerShell @arguments
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

function Write-Step([string] $Message) { Write-Host "[push-dev] $Message" }
function Assert-ExitCode([string] $Label) { if ($LASTEXITCODE -ne 0) { throw "$Label falhou com exit code $LASTEXITCODE." } }

Write-Step "build do WebResource"
npm run build
Assert-ExitCode "npm run build"
$generatedVersion = "v$((Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version)"
Write-Host "NOVA VERSAO GERADA: $generatedVersion"

Write-Step "testes do WebResource"
npm test
Assert-ExitCode "npm test"

Write-Step "publicacao do WebResource no Dataverse DEV: $generatedVersion"
$publishScript = Join-Path $PSScriptRoot "publish-webresource.ps1"
& $publishScript -EnvironmentUrl $EnvironmentUrl -DeviceCode:$DeviceCode
Assert-ExitCode "publish-webresource"

Write-Step "provisionamento do Flow de push Power Apps Mobile"
$flowScript = Join-Path $PSScriptRoot "create-planner-immediate-flow.ps1"
& $flowScript -EnvironmentUrl $EnvironmentUrl.TrimEnd('/')
Assert-ExitCode "provisionamento do Flow de push"

Write-Step "provisionamento do relatorio diario"
& (Join-Path $PSScriptRoot "create-planner-daily-flow.ps1") -EnvironmentUrl $EnvironmentUrl.TrimEnd('/')
Assert-ExitCode "provisionamento do relatorio diario"

Write-Step "desativacao dos canais antigos"
& (Join-Path $PSScriptRoot "disable-planner-legacy-channels.ps1") -EnvironmentUrl $EnvironmentUrl.TrimEnd('/')
Assert-ExitCode "desativacao dos canais antigos"

Write-Host "VERSAO PUBLICADA COM SUCESSO: $generatedVersion"
Write-Step "push concluido: WebResource e Flows atualizados; canais antigos desativados"
