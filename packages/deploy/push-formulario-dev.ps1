param([string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL)

# Publica no DEV o WebResource do Formulario Geral (apps/formulario-geral), pelo workflow Deploy.
# O webresource.html nao e versionado: nasce aqui, do build (scripts/build_webresource.js), que sobe o PATCH da versao.
# A descricao do recurso guarda "vX.Y.Z <sha>": pendentes-dev.ps1 e a trava do PROD comparam com ela.
# Schema, connector e flows da agenda IA (scripts/provision-*) continuam a mao, do checkout principal: nada disso roda aqui.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $EnvironmentUrl) { throw 'DV_ENVIRONMENT_URL ausente.' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
if ($env:GITHUB_SHA -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido: esta publicacao so roda no workflow Deploy.' }
$solucao = if ($env:DV_SOLUTION) { $env:DV_SOLUTION } else { 'AppBetinhos' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$app = Join-Path $root 'apps\formulario-geral'
$api = "$base/api/data/v9.2"
$nome = 'new_formulario_geral.html'

function Write-Step([string] $Message) { Write-Host "[formulario] $Message" }

$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
if (-not $token) { throw 'Falha ao obter token do DEV.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }

function Invoke-Dv([string] $Method, [string] $Path, $Body = $null) {
  $pedido = @{ Method = $Method; Uri = "$api/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $pedido.ContentType = 'application/json; charset=utf-8'
    $pedido.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress))
  }
  Invoke-RestMethod @pedido
}

$rows = @((Invoke-Dv 'Get' "webresourceset?`$select=webresourceid,description&`$filter=name eq '$nome'").value)
if ($rows.Count -gt 1) { throw "Web resource duplicado: $nome" }
$existe = if ($rows.Count) { $rows[0] } else { $null }

# A versao nunca retrocede: parte da maior entre a do repo (version.json) e a publicada; o build sobe o PATCH.
$versionJson = Join-Path $app 'version.json'
$doRepo = [version]((Get-Content -Raw $versionJson | ConvertFrom-Json).version)
if ($existe -and "$($existe.description)" -match '^v(\d+\.\d+\.\d+)') {
  $publicada = [version]$Matches[1]
  if ($publicada -gt $doRepo) {
    [IO.File]::WriteAllText($versionJson, (@{ version = "$publicada" } | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    Write-Step "versao publicada ($publicada) e maior que a do repo ($doRepo): o build parte dela"
  }
}

Write-Step 'compilando o WebResource'
Push-Location $app
try { & node scripts/build_webresource.js }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Falha no build do Formulario Geral. Codigo: $LASTEXITCODE" }
$versao = (Get-Content -Raw $versionJson | ConvertFrom-Json).version
$arquivo = Join-Path $app 'webresource.html'
if (-not (Test-Path -LiteralPath $arquivo)) { throw 'webresource.html nao foi gerado.' }
if ((Get-Content -Raw -LiteralPath $arquivo) -match '(?i)sig=') { throw 'webresource.html traz URL assinada (sig=): URLs de flow vem so de variavel de ambiente.' }

$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($arquivo))
$descricao = "v$versao $($env:GITHUB_SHA)"
if ($existe) {
  $id = $existe.webresourceid
  Invoke-Dv 'Patch' "webresourceset($id)" @{ content = $content; description = $descricao } | Out-Null
}
else {
  $id = [guid]::NewGuid().ToString()
  Invoke-Dv 'Post' 'webresourceset' @{ webresourceid = $id; name = $nome; displayname = 'Formulário Geral - Agendar por IA'; webresourcetype = 1; content = $content; description = $descricao } | Out-Null
}
try { Invoke-Dv 'Post' 'AddSolutionComponent' @{ ComponentId = $id; ComponentType = 61; SolutionUniqueName = $solucao; AddRequiredComponents = $false } | Out-Null }
catch { if ("$($_.ErrorDetails.Message) $($_.Exception.Message)" -notmatch '(?i)already|exists|ja existe') { throw } }

Invoke-Dv 'Post' 'PublishXml' @{ ParameterXml = "<importexportxml><webresources><webresource>$id</webresource></webresources></importexportxml>" } | Out-Null

Write-Step "publicado v${versao} em $nome"
