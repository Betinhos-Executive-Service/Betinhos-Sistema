param([string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL)

# Publica no DEV o Formulario Geral (WebResource new_formulario_geral.html, apps/formulario-geral), pelo workflow Deploy.
# A descricao do WebResource guarda "vX.Y.Z <sha>": pendentes-dev.ps1 e a trava do PROD comparam com ela.
# A versao parte da maior entre a do repo (version.json) e a publicada (lida da descricao), entao nunca retrocede.
# Nao provisiona schema nem flows da agenda por IA (scripts/provision-*.ps1 do app): isso continua a mao.
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
# Nome de exibicao que o DEV ja tem (herdado do push antigo); so vale na criacao, o existente nao muda.
$exibicao = 'Formul' + [char]0x00E1 + 'rio Geral - Agendar por IA'

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
if ($existe -and "$($existe.description)" -match '^v(\d+\.\d+\.\d+)') { $env:PUBLISHED_VERSION = $Matches[1] }

Write-Step 'compilando o WebResource'
Push-Location $app
try {
  & node scripts/build_webresource.js
  if ($LASTEXITCODE -ne 0) { throw "Falha no build do Formulario Geral. Codigo: $LASTEXITCODE" }
}
finally { Pop-Location }
$versao = (Get-Content -Raw (Join-Path $app 'version.json') | ConvertFrom-Json).version
$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $app 'webresource.html')))
$descricao = "v$versao $($env:GITHUB_SHA)"

if ($existe) {
  $id = $existe.webresourceid
  Invoke-Dv 'Patch' "webresourceset($id)" @{ content = $content; description = $descricao } | Out-Null
}
else {
  $id = [guid]::NewGuid().ToString()
  Invoke-Dv 'Post' 'webresourceset' @{ webresourceid = $id; name = $nome; displayname = $exibicao; webresourcetype = 1; content = $content; description = $descricao } | Out-Null
}
try { Invoke-Dv 'Post' 'AddSolutionComponent' @{ ComponentId = $id; ComponentType = 61; SolutionUniqueName = $solucao; AddRequiredComponents = $false } | Out-Null }
catch { if ("$($_.ErrorDetails.Message) $($_.Exception.Message)" -notmatch '(?i)already|exists|ja existe') { throw } }

Invoke-Dv 'Post' 'PublishXml' @{ ParameterXml = "<importexportxml><webresources><webresource>$id</webresource></webresources></importexportxml>" } | Out-Null
Write-Step "publicado v${versao}: $nome"
