param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [string] $ConnectorId = "",
  [switch] $WhatIf
)

try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
function Step([string]$Message) { Write-Host "[provision-deepseek] $Message" }
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$connectorRoot = Join-Path $root "power-platform\connector"
Set-Location $connectorRoot
$settings = Join-Path $connectorRoot "settings.json"
$definition = Join-Path $connectorRoot "deepseek-api-definition.json"
$properties = Join-Path $connectorRoot "apiProperties.json"
foreach ($path in @($settings, $definition, $properties)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Arquivo ausente: $path" } }
if ($EnvironmentUrl.TrimEnd("/") -notmatch "org23b93544\.crm2\.dynamics\.com$") { throw "Connector bloqueado: somente ambiente DEV org23b93544." }
if ($WhatIf) { Step "dry-run: criaria ou atualizaria o connector Betinhos DeepSeek na solution $SolutionUniqueName"; exit 0 }

if ($ConnectorId) {
  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ("betinhos-connector-" + [Guid]::NewGuid().ToString("N"))
  try {
    $downloadOutput = @(& pac connector download --environment $EnvironmentUrl --connector-id $ConnectorId --outputDirectory $downloadRoot 2>&1)
    $downloadText = $downloadOutput -join "`n"
    if ($LASTEXITCODE -eq 0 -and $downloadText -notmatch '(?m)^Error:') {
      $localDefinition = Get-Content -LiteralPath $definition -Raw -Encoding UTF8 | ConvertFrom-Json
      $remoteDefinition = Get-Content -LiteralPath (Join-Path $downloadRoot "apiDefinition.json") -Raw -Encoding UTF8 | ConvertFrom-Json
      $localProperties = Get-Content -LiteralPath $properties -Raw -Encoding UTF8 | ConvertFrom-Json
      $remoteProperties = Get-Content -LiteralPath (Join-Path $downloadRoot "apiProperties.json") -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($field in @("publisher", "stackOwner", "scriptOperations", "policyTemplateInstances")) {
        $localProperties.properties.PSObject.Properties.Remove($field)
        $remoteProperties.properties.PSObject.Properties.Remove($field)
      }
      $definitionSame = ($localDefinition | ConvertTo-Json -Depth 100 -Compress) -ceq ($remoteDefinition | ConvertTo-Json -Depth 100 -Compress)
      $propertiesSame = ($localProperties | ConvertTo-Json -Depth 100 -Compress) -ceq ($remoteProperties | ConvertTo-Json -Depth 100 -Compress)
      if ($definitionSame -and $propertiesSame) { Step "connector Betinhos DeepSeek já está atualizado no DEV"; return }
    }
  } finally {
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $resolvedDownload = [IO.Path]::GetFullPath($downloadRoot)
    if (-not $resolvedDownload.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { throw "Diretório temporário fora da raiz esperada: $resolvedDownload" }
    if (Test-Path -LiteralPath $resolvedDownload) { Remove-Item -LiteralPath $resolvedDownload -Recurse -Force }
  }
}

$args = @("connector", "create", "--settings-file", $settings, "--solution-unique-name", $SolutionUniqueName)
if ($ConnectorId) { $args = @("connector", "update", "--environment", $EnvironmentUrl, "--connector-id", $ConnectorId, "--api-definition-file", $definition, "--api-properties-file", $properties, "--solution-unique-name", $SolutionUniqueName) }
Step "publicando definição OpenAPI do connector Betinhos DeepSeek"
$pacOutput = @(& pac @args 2>&1)
$pacExitCode = $LASTEXITCODE
$pacOutput | ForEach-Object { Write-Host $_ }
$pacText = ($pacOutput -join "`n")
if ($pacExitCode -ne 0 -or $pacText -match '(?m)^Error:') { throw "pac connector falhou (exit code $pacExitCode). Se já existir, informe -ConnectorId para atualização." }
Step "connector Betinhos DeepSeek pronto"
