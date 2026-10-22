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

function Write-Step([string] $message) { Write-Host "[acesso:plugin:$EnvironmentName] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; rode manualmente apos a aprovacao.' }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.Acesso.Plugin\Cr40f.Acesso.Plugin.csproj'
$testsProject = Join-Path $root 'packages\plugins\Cr40f.Acesso.Plugin.Tests\Cr40f.Acesso.Plugin.Tests.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.Acesso.Plugin\bin\Release\net462\Cr40f.Acesso.Plugin.dll'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Acesso.Registrar\Cr40f.Acesso.Registrar.csproj'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Acesso.Plugin.snk'

if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) {
  Write-Step "criando chave persistente de assinatura em $signingKeyPath"
  [IO.Directory]::CreateDirectory((Split-Path -Parent $signingKeyPath)) | Out-Null
  $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
  try { [IO.File]::WriteAllBytes($signingKeyPath, $rsa.ExportCspBlob($true)) } finally { $rsa.Dispose() }
}

Write-Step 'rodando testes do plugin'
& $dotnet.Source test $testsProject
if ($LASTEXITCODE -ne 0) { throw "Testes do plugin falharam. Codigo: $LASTEXITCODE" }

Write-Step 'compilando plugin'
& $dotnet.Source build $pluginProject --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar plugin. Codigo: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dllPath)) { throw "DLL nao encontrada apos o build: $dllPath" }

$token = [BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName($dllPath).GetPublicKeyToken()).Replace('-', '').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($token)) { throw "DLL gerada sem assinatura: $dllPath" }
Write-Step "DLL assinada com public key token $token"

$dotEnv = @{}; $envPath = Join-Path $root '.env'
if (Test-Path $envPath) { foreach ($line in [IO.File]::ReadAllLines($envPath)) { if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $dotEnv[$Matches[1]] = $Matches[2].Trim('"') } } }
foreach ($k in 'ACESSO_TENANT_ID','ACESSO_CLIENT_ID','ACESSO_LICENSE_SKU_ID','ACESSO_GROUP_ID','ACESSO_APP_URL') { if (-not $dotEnv[$k]) { throw "$k ausente no .env (configuracao nao segura do plugin de acesso)." } }
$config = @{ tenantId = $dotEnv.ACESSO_TENANT_ID; clientId = $dotEnv.ACESSO_CLIENT_ID; licenseSkuId = $dotEnv.ACESSO_LICENSE_SKU_ID; groupId = $dotEnv.ACESSO_GROUP_ID; appUrl = $dotEnv.ACESSO_APP_URL; dominio = 'betinhos.com.br' } | ConvertTo-Json -Compress

# Windows PowerShell 5.1 remove aspas duplas de argumentos nativos: escapa para o JSON chegar integro.
$configArg = $config -replace '"', '\"'
Write-Step 'registrando assembly, Custom APIs e steps e publicando'
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --config $configArg --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }

Write-Step 'concluido'
