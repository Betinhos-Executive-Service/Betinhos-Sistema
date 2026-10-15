param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  [string] $SolutionUniqueName = 'appbetinhos'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $message) {
  Write-Host "[financeiro:plugin:$EnvironmentName] $message"
}

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
  throw 'dotnet SDK 8 ou superior nao encontrado. Instale-o antes de publicar o plugin.'
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.Financeiro.Plugin\Cr40f.Financeiro.Plugin.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.Financeiro.Plugin\bin\Release\net462\Cr40f.Financeiro.Plugin.dll'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Financeiro.Plugin.snk'

if (-not (Test-Path -LiteralPath $pluginProject)) { throw "Projeto do plugin nao encontrado: $pluginProject" }
if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) {
  Write-Step "criando chave persistente de assinatura em $signingKeyPath"
  $keyDirectory = Split-Path -Parent $signingKeyPath
  [IO.Directory]::CreateDirectory($keyDirectory) | Out-Null
  $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
  try {
    [IO.File]::WriteAllBytes($signingKeyPath, $rsa.ExportCspBlob($true))
  }
  finally {
    $rsa.Dispose()
  }
}

Write-Step 'compilando plugin'
& $dotnet.Source build $pluginProject --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar plugin. Codigo: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dllPath)) { throw "DLL nao encontrada apos o build: $dllPath" }

$tokenBytes = [Reflection.AssemblyName]::GetAssemblyName($dllPath).GetPublicKeyToken()
$publicKeyToken = [BitConverter]::ToString($tokenBytes).Replace('-', '').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($publicKeyToken)) {
  throw "DLL gerada sem assinatura: $dllPath"
}
Write-Step "DLL assinada com public key token $publicKeyToken"

Write-Step 'criando tabela de log, enviando assembly, vinculando Custom API e publicando'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Financeiro.Registrar\Cr40f.Financeiro.Registrar.csproj'
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }

Write-Step 'concluido'
