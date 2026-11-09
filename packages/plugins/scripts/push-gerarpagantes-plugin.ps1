param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  [string] $SolutionUniqueName = 'appbetinhos',

  # Aceito por push-plugins-dev.ps1; este plugin ainda nao tem testes.
  [switch] $SemTestes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $message) { Write-Host "[gerarpagantes:plugin:$EnvironmentName] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; rode manualmente apos a aprovacao.' }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.GerarPagantes.Plugin\Cr40f.GerarPagantes.Plugin.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.GerarPagantes.Plugin\bin\Release\net462\Cr40f.GerarPagantes.Plugin.V2.dll'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.GerarPagantes.Registrar\Cr40f.GerarPagantes.Registrar.csproj'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.GerarPagantes.Plugin.snk'

# A chave e a do assembly Cr40f.GerarPagantes.Plugin.V2 ja registrado: outra mudaria o public key token, e o Dataverse
# trataria o plugin como outro assembly. No CI ela vem do secret do environment dev.
if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) { throw "Chave de assinatura ausente: $signingKeyPath" }

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
