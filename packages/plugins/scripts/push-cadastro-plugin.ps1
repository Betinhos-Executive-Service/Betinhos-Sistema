param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  [string] $SolutionUniqueName = 'appbetinhos',

  # URL do gatilho HTTP do "Flow - Consultar Arquivos Sharepoint" (configuracao segura do step de new_ObterFotoPassageiro).
  # Opcional: sem ela (e sem $env:CADASTRO_FOTO_FLOW_URL), a configuracao segura ja gravada no step e mantida. Nunca versionar.
  [string] $FotoFlowUrl = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $message) { Write-Host "[cadastro:plugin:$EnvironmentName] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; rode manualmente apos a aprovacao.' }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.Cadastro.Plugin\Cr40f.Cadastro.Plugin.csproj'
$testsProject = Join-Path $root 'packages\plugins\Cr40f.Cadastro.Plugin.Tests\Cr40f.Cadastro.Plugin.Tests.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.Cadastro.Plugin\bin\Release\net462\Cr40f.Cadastro.Plugin.dll'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Cadastro.Registrar\Cr40f.Cadastro.Registrar.csproj'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Cadastro.Plugin.snk'

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

Write-Step 'registrando assembly e Custom APIs e publicando'
# Passa a URL ao registrador por variavel de ambiente do processo (nao aparece na linha de comando nem no log).
if ($FotoFlowUrl) { $env:CADASTRO_FOTO_FLOW_URL = $FotoFlowUrl }
if ($env:CADASTRO_FOTO_FLOW_URL) { Write-Step 'URL do flow de foto recebida (oculta); sera gravada na configuracao segura' }
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }

Write-Step 'concluido'
