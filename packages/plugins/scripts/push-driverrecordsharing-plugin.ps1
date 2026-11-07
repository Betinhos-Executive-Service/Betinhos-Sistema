param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  # CI (workflow Deploy): os testes ja rodaram no PR (job plugins do ci.yml).
  [switch] $SemTestes
)

# Publica o codigo do plugin Betinhos.DriverRecordSharing no DEV: troca so o conteudo (content) e a descricao (commit) do
# assembly que ja existe. Nao registra assembly novo e nao cria nem altera steps, tipos de plugin ou Custom APIs: isso
# continua nas solucoes (e nos scripts de registro do app-motoristas-v2, ainda nao migrados).
# A chave de assinatura e fixa: nunca se gera uma para publicar. O public key token da DLL tem de ser o ja publicado.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Assembly = 'Betinhos.DriverRecordSharing'
$TokenEsperado = '9b3305f5ee59a061'
$DevHost = 'org23b93544.crm2.dynamics.com'
$DevOrgId = '7e5f59f4-efce-f011-89f6-000d3ac0a3e1'

function Write-Step([string] $message) { Write-Host "[driverrecordsharing:plugin:${EnvironmentName}] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; o PROD recebe o assembly do DEV pelo workflow Producao.' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host.ToLowerInvariant() -ne $DevHost) { throw "Somente DEV: $base" }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root "packages\plugins\$Assembly\$Assembly.csproj"
$testsProject = Join-Path $root "packages\plugins\$Assembly.Tests\$Assembly.Tests.csproj"
$dllPath = Join-Path $root "packages\plugins\$Assembly\bin\Release\net462\$Assembly.dll"
$signingKeyPath = Join-Path $env:USERPROFILE ".codex\keys\$Assembly.snk"

# A chave vem do secret PLUGIN_SNK_DRIVERRECORDSHARING (CI) ou ja esta na maquina. Gerar outra mudaria o public key token,
# e o Dataverse trataria o plugin como outro assembly: o script nunca cria chave.
if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) { throw "Chave de assinatura ausente: $signingKeyPath. Nao gere outra: o token publicado e $TokenEsperado." }

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

$nome = [Reflection.AssemblyName]::GetAssemblyName($dllPath)
$token = [BitConverter]::ToString($nome.GetPublicKeyToken()).Replace('-', '').ToLowerInvariant()
if ($token -ne $TokenEsperado) { throw "Public key token da DLL ($token) difere do publicado ($TokenEsperado). Nada foi gravado." }
Write-Step "DLL assinada com public key token $token, versao $($nome.Version)"

# Commit na descricao: so o workflow Deploy grava (pendentes-dev.ps1 e a trava do PROD leem isso). Publicacao local grava
# vazio, e a trava do PROD recusa ate o Deploy da develop publicar de novo.
$commit = ''
if ($env:GITHUB_ACTIONS -eq 'true') {
  $commit = "$env:GITHUB_SHA"
  if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido.' }
}

$api = "$base/api/data/v9.2"
$accessToken = $null
if ($env:DV_CLIENT_ID -and $env:DV_CLIENT_SECRET) {
  $tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
  $accessToken = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
}
elseif ($env:DV_ACCESS_TOKEN) { $accessToken = $env:DV_ACCESS_TOKEN }
else { $accessToken = & az account get-access-token --resource "$base/" --query accessToken -o tsv }
if (-not $accessToken) { throw 'Token do Dataverse DEV indisponivel (conta de servico do CI, DV_ACCESS_TOKEN ou az login).' }
$headers = @{ Authorization = "Bearer $accessToken"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
$who = Invoke-RestMethod -Uri "$api/WhoAmI" -Headers $headers
if ($who.OrganizationId -ne $DevOrgId) { throw 'A API nao respondeu pela organizacao DEV. Nada foi gravado.' }

$rows = @((Invoke-RestMethod -Uri "$api/pluginassemblies?`$select=pluginassemblyid,version,publickeytoken&`$filter=name eq '$Assembly'" -Headers $headers).value)
if ($rows.Count -ne 1) { throw "$Assembly ausente ou duplicado no DEV (achei $($rows.Count)). Assembly novo vai pelo registrador, nao por este script." }
if ($rows[0].publickeytoken -ne $TokenEsperado) { throw "$Assembly no DEV tem token $($rows[0].publickeytoken), esperado $TokenEsperado. Nada foi gravado." }
if ([string]$rows[0].version -ne [string]$nome.Version) { throw "$Assembly no DEV esta na versao $($rows[0].version) e a DLL e $($nome.Version): troca de versao nao e so de conteudo. Nada foi gravado." }

$bytes = [IO.File]::ReadAllBytes($dllPath)
$corpo = '{"content":"' + [Convert]::ToBase64String($bytes) + '","description":"' + $commit + '"}'
Write-Step 'atualizando conteudo e descricao do assembly'
Invoke-RestMethod -Method Patch -Uri "$api/pluginassemblies($($rows[0].pluginassemblyid))" -Headers ($headers + @{ 'If-Match' = '*' }) -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) -TimeoutSec 300 | Out-Null

$depois = Invoke-RestMethod -Uri "$api/pluginassemblies($($rows[0].pluginassemblyid))?`$select=content,description,version,publickeytoken" -Headers $headers -TimeoutSec 300
$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace('-', '')
$shaRemoto = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String([string]$depois.content))).Replace('-', '')
if ($shaRemoto -ne $sha) { throw 'Gravacao nao confirmada: o conteudo no DEV difere da DLL compilada.' }
if ([string]$depois.description -ne $commit) { throw 'Gravacao nao confirmada: descricao do assembly difere do commit.' }
if ($depois.publickeytoken -ne $TokenEsperado -or [string]$depois.version -ne [string]$nome.Version) { throw 'Gravacao nao confirmada: versao ou token do assembly mudou.' }

Write-Step "concluido (versao $($depois.version), commit $(if ($commit) { $commit.Substring(0, 7) } else { 'vazio (local)' }))"
