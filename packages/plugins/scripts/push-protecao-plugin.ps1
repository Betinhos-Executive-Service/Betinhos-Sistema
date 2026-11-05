param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  [string] $SolutionUniqueName = 'appbetinhos',

  # CI (workflow Deploy): os testes ja rodaram no PR (job plugins do ci.yml).
  [switch] $SemTestes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $message) { Write-Host "[protecao:plugin:$EnvironmentName] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; rode manualmente apos a aprovacao.' }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.Protecao.Plugin\Cr40f.Protecao.Plugin.csproj'
$testsProject = Join-Path $root 'packages\plugins\Cr40f.Protecao.Plugin.Tests\Cr40f.Protecao.Plugin.Tests.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.Protecao.Plugin\bin\Release\net462\Cr40f.Protecao.Plugin.dll'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Protecao.Registrar\Cr40f.Protecao.Registrar.csproj'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Protecao.Plugin.snk'

# No CI a chave vem do secret do environment dev. Gerar outra mudaria o public key token, e o Dataverse trataria
# o plugin como outro assembly.
if ($env:GITHUB_ACTIONS -eq 'true' -and -not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) { throw "Chave de assinatura ausente no CI: $signingKeyPath" }
if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) {
  Write-Step "criando chave persistente de assinatura em $signingKeyPath"
  [IO.Directory]::CreateDirectory((Split-Path -Parent $signingKeyPath)) | Out-Null
  $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
  try { [IO.File]::WriteAllBytes($signingKeyPath, $rsa.ExportCspBlob($true)) } finally { $rsa.Dispose() }
}

if ($SemTestes) { Write-Step 'testes pulados (ja rodaram no PR)' }
else {
  Write-Step 'rodando testes do plugin'
  & $dotnet.Source test $testsProject
  if ($LASTEXITCODE -ne 0) { throw "Testes do plugin falharam. Codigo: $LASTEXITCODE" }
}

Write-Step 'compilando plugin'
& $dotnet.Source build $pluginProject --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar plugin. Codigo: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dllPath)) { throw "DLL nao encontrada apos o build: $dllPath" }

$token = [BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName($dllPath).GetPublicKeyToken()).Replace('-', '').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($token)) { throw "DLL gerada sem assinatura: $dllPath" }
Write-Step "DLL assinada com public key token $token"

Write-Step 'registrando assembly e step e publicando'
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }

Write-Step 'concluido'
