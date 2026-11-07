param([string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL)

# Publica no DEV os WebResources da Tela Gerar Pagantes e o gerador de recibo (apps/gerar-pagantes), pelo workflow Deploy.
# A descricao de Tela_GerarPagantes/index.html guarda "vX.Y.Z <sha>": pendentes-dev.ps1 e a trava do PROD comparam com ela.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $EnvironmentUrl) { throw 'DV_ENVIRONMENT_URL ausente.' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
if ($env:GITHUB_SHA -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido: esta publicacao so roda no workflow Deploy.' }
$solucao = if ($env:DV_SOLUTION) { $env:DV_SOLUTION } else { 'AppBetinhos' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$app = Join-Path $root 'apps\gerar-pagantes'
$api = "$base/api/data/v9.2"

function Write-Step([string] $Message) { Write-Host "[webresources] $Message" }

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

function Get-WebResource([string] $Name) {
  $rows = @((Invoke-Dv 'Get' "webresourceset?`$select=webresourceid,description,content&`$filter=name eq '$Name'").value)
  if ($rows.Count -gt 1) { throw "Web resource duplicado: $Name" }
  if ($rows.Count) { $rows[0] } else { $null }
}

$atual = Get-WebResource 'Tela_GerarPagantes/index.html'
if ($atual -and "$($atual.description)" -match '^v(\d+\.\d+\.\d+)') { $env:PUBLISHED_VERSION = $Matches[1] }

Write-Step 'compilando a tela'
& pnpm --filter '@betinhos/gerar-pagantes' build
if ($LASTEXITCODE -ne 0) { throw "Falha no build da tela. Codigo: $LASTEXITCODE" }
$versao = (Get-Content -Raw (Join-Path $app 'package.json') | ConvertFrom-Json).version

$dist = Join-Path $app 'dist'
$script = Join-Path $app 'webresources\Script_GerarPagantes.js'
$recursos = @(
  @{ Nome = 'Tela_GerarPagantes/index.html'; Exibicao = 'Tela - Gerar Pagantes'; Arquivo = (Join-Path $dist 'index.html'); Tipo = 1; Descricao = "v$versao $($env:GITHUB_SHA)" }
  @{ Nome = 'Tela_Script_GerarPagantes.js'; Exibicao = 'Tela - Script Gerar Pagantes'; Arquivo = $script; Tipo = 3 }
  @{ Nome = 'Script_AbrirTelaGerarPagantes.js'; Exibicao = 'Script - Abrir Tela Gerar Pagantes'; Arquivo = $script; Tipo = 3 }
  @{ Nome = 'cr40f_GerarRecibo'; Exibicao = 'Gerar Recibo'; Arquivo = (Join-Path $app 'webresources\cr40f_GerarRecibo.js'); Tipo = 3 }
)
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $dist 'assets') -File | Where-Object { $_.Extension -in '.js', '.css' }) {
  $tipo = if ($f.Extension -eq '.css') { 2 } else { 3 }
  $recursos += @{ Nome = "Tela_GerarPagantes/assets/$($f.Name)"; Exibicao = "Tela - Gerar Pagantes - $($f.Name)"; Arquivo = $f.FullName; Tipo = $tipo }
}

$ids = New-Object System.Collections.Generic.List[string]
foreach ($r in $recursos) {
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($r.Arquivo))
  $existe = Get-WebResource $r.Nome
  if ($existe) {
    $id = $existe.webresourceid
    # O index sempre grava: a descricao dele e o commit que o DEV registra.
    if ($r.ContainsKey('Descricao')) { Invoke-Dv 'Patch' "webresourceset($id)" @{ content = $content; description = $r.Descricao } | Out-Null }
    elseif ($existe.content -ne $content) { Invoke-Dv 'Patch' "webresourceset($id)" @{ content = $content } | Out-Null }
    else { Write-Step "sem mudanca: $($r.Nome)" }
  }
  else {
    $id = [guid]::NewGuid().ToString()
    $novo = @{ webresourceid = $id; name = $r.Nome; displayname = $r.Exibicao; webresourcetype = $r.Tipo; content = $content }
    if ($r.ContainsKey('Descricao')) { $novo.description = $r.Descricao }
    Invoke-Dv 'Post' 'webresourceset' $novo | Out-Null
  }
  try { Invoke-Dv 'Post' 'AddSolutionComponent' @{ ComponentId = $id; ComponentType = 61; SolutionUniqueName = $solucao; AddRequiredComponents = $false } | Out-Null }
  catch { if ("$($_.ErrorDetails.Message) $($_.Exception.Message)" -notmatch '(?i)already|exists|ja existe') { throw } }
  $ids.Add($id)
}

$xml = '<importexportxml><webresources>' + (($ids | ForEach-Object { "<webresource>$_</webresource>" }) -join '') + '</webresources></importexportxml>'
Invoke-Dv 'Post' 'PublishXml' @{ ParameterXml = $xml } | Out-Null

Write-Step "publicado v${versao}: $($recursos.Count) web resources"
