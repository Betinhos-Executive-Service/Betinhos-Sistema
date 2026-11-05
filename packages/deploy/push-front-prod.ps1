param(
  [string] $AppDir = "apps/shell",
  [string] $ResourceName = "cr40f_SistemaBetinhos.html",
  [string] $DisplayName = "Sistema Betinhos",
  [string] $LoaderName = "cr40f_SistemaBetinhosLoader.html"
)

# Caminho "front" do PROD (workflow Producao, so na main): compila a tela e atualiza os WebResources dela no PROD.
# So a tela: nada de schema, flow ou plugin (esses vao pelas solucoes, com ensaio no TEST).
# No PROD as solucoes sao gerenciadas: a atualizacao vira camada Active por cima do gerenciado (sem cabecalho de solucao,
# sem AddSolutionComponent). O proximo publicar.yml remove as camadas Active depois de importar a versao nova.
# So roda com a conta de servico (DV_CLIENT_SECRET) e confere host e organizacao do PROD antes de gravar.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -AppDir $AppDir -ResourceName $ResourceName -DisplayName $DisplayName -LoaderName $LoaderName
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$appRoot = Join-Path $root $AppDir

$ProdHost = "orgf261ae8e.crm2.dynamics.com"
$ProdOrgId = "9e4ef53e-8bfc-f011-89f6-6045bd3ad1ec"

function Write-Step([string] $Message) { Write-Host "[push-front-prod] $Message" }
function Escape-OData([string] $Value) { return $Value.Replace("'", "''") }
function Require-Env([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name ausente (environment prod-front do GitHub)." }
  return $value
}

$environmentBaseUrl = (Require-Env "DV_ENVIRONMENT_URL").TrimEnd("/")
if (([Uri] $environmentBaseUrl).Host.ToLowerInvariant() -ne $ProdHost) { throw "Este script publica apenas no PROD ($ProdHost)." }
$tenant = Require-Env "DV_TENANT_ID"
$clientId = Require-Env "DV_CLIENT_ID"
$clientSecret = Require-Env "DV_CLIENT_SECRET"
$commit = Require-Env "GITHUB_SHA"
if ($commit -notmatch '^[0-9a-f]{40}$') { throw "GITHUB_SHA invalido." }

$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
Write-Step "autenticacao em $ProdHost"
$tokenBody = @{ grant_type = "client_credentials"; client_id = $clientId; client_secret = $clientSecret; scope = "$environmentBaseUrl/.default" }
$accessToken = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" -Body $tokenBody).access_token
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw "Falha ao obter token do PROD." }
$headers = @{ Authorization = "Bearer $accessToken"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }

$who = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/WhoAmI" -Headers $headers
if ($who.OrganizationId -ne $ProdOrgId) { throw "A API nao respondeu pela organizacao PROD. Nada foi gravado." }

# Versao: parte da maior entre a do repo e a publicada no PROD (descricao do HTML), como no DEV.
$publishedDescription = @((Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/webresourceset?`$select=description&`$filter=name eq '$(Escape-OData $ResourceName)'" -Headers $headers).value | ForEach-Object { $_.description })
if ($publishedDescription.Count -ne 1) { throw "$ResourceName ausente ou duplicado no PROD. Publique pelas solucoes primeiro." }
$env:PUBLISHED_VERSION = if ($publishedDescription[0] -match '^v(\d+\.\d+\.\d+)') { $Matches[1] } else { "" }
Write-Step "versao publicada no PROD: $(if ($env:PUBLISHED_VERSION) { "v$env:PUBLISHED_VERSION" } else { 'desconhecida' })"
Push-Location $appRoot
try { & pnpm build; if ($LASTEXITCODE -ne 0) { throw "pnpm build falhou ($LASTEXITCODE)." } }
finally { Pop-Location; Remove-Item Env:PUBLISHED_VERSION -ErrorAction SilentlyContinue }

$resourcePath = Join-Path $appRoot "dist\webresource.html"
if (-not (Test-Path -LiteralPath $resourcePath)) { throw "WebResource nao encontrado: $resourcePath." }
$resourceHtml = [IO.File]::ReadAllText($resourcePath, [Text.Encoding]::UTF8)

$targets = @()
$chunkPrefix = ($ResourceName -replace '\.html$', '') + "/assets/"
$chunkNames = @()
$chunkManifestPath = Join-Path $appRoot "dist\webresource-assets.json"
if (Test-Path -LiteralPath $chunkManifestPath) {
  $chunkList = [IO.File]::ReadAllText($chunkManifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($chunk in $chunkList) {
    if (-not $chunk.name.StartsWith($chunkPrefix, [StringComparison]::Ordinal)) { throw "Chunk $($chunk.name) fora do prefixo $chunkPrefix." }
    if ($chunk.name -notmatch '^[A-Za-z0-9_]+(/[A-Za-z0-9.]+)+\.js$') { throw "Nome de chunk invalido para WebResource: $($chunk.name)." }
    $chunkPath = Join-Path $appRoot ("dist\" + $chunk.file.Replace("/", "\"))
    if (-not (Test-Path -LiteralPath $chunkPath)) { throw "Chunk ausente no build: $chunkPath." }
    $chunkNames += $chunk.name
    $targets += @{ Name = $chunk.name; Display = "$DisplayName - $($chunk.file)"; Path = $chunkPath; Type = 3; Description = "" }
  }
  if ($chunkNames.Count -eq 0) { throw "webresource-assets.json sem chunks." }
}
foreach ($reference in [regex]::Matches($resourceHtml, '<script[^>]+src="/WebResources/([^"]+\.js)"|<link[^>]+href="/WebResources/([^"]+\.js)"')) {
  $referenced = @($reference.Groups[1].Value, $reference.Groups[2].Value) | Where-Object { $_ } | Select-Object -First 1
  if ($chunkNames -notcontains $referenced) { throw "webresource.html referencia /WebResources/$referenced, que nao esta em webresource-assets.json." }
}
$builtVersion = (Get-Content -Raw (Join-Path $appRoot "package.json") | ConvertFrom-Json).version
# O HTML entra por ultimo: so passa a apontar para os chunks novos depois de todos publicados.
$targets += @{ Name = $ResourceName; Display = $DisplayName; Path = $resourcePath; Type = 1; Description = "v$builtVersion $commit" }
if ($LoaderName) {
  $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "loader.template.html"), [Text.Encoding]::UTF8)
  $loaderPath = Join-Path $appRoot "dist\loader.html"
  [IO.File]::WriteAllText($loaderPath, $template.Replace("{{RESOURCE}}", $ResourceName).Replace("{{TITLE}}", $DisplayName), (New-Object Text.UTF8Encoding($false)))
  $targets += @{ Name = $LoaderName; Display = "$DisplayName (carregador)"; Path = $loaderPath; Type = 1; Description = "" }
}
$assetTypes = @{ ".webmanifest" = 3; ".js" = 3; ".png" = 5; ".ico" = 10; ".svg" = 11 }
$assetsDir = Join-Path $appRoot "dist\WebResources"
if (Test-Path -LiteralPath $assetsDir) {
  foreach ($asset in Get-ChildItem -LiteralPath $assetsDir -File) {
    $extension = $asset.Extension.ToLowerInvariant()
    if (-not $assetTypes.ContainsKey($extension)) { throw "Tipo de arquivo sem mapeamento de WebResource: $($asset.Name)" }
    $targets += @{ Name = $asset.Name; Display = "$DisplayName - $($asset.BaseName)"; Path = $asset.FullName; Type = $assetTypes[$extension]; Description = "" }
  }
}

function Publish-WebResource([string] $Name, [string] $Display, [string] $Path, [int] $Type, [string] $Description) {
  $lookupUri = "$apiBaseUrl/webresourceset?`$select=webresourceid,name,webresourcetype,content&`$filter=name eq '$(Escape-OData $Name)'"
  $found = @((Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers).value)
  if ($found.Count -gt 1) { throw "Mais de um WebResource encontrado para $Name." }
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
  $fields = @{ displayname = $Display; content = $content; isenabledformobileclient = $true }
  if ($Description) { $fields.description = $Description }
  if ($found.Count -eq 0) {
    Write-Step "criando $Name"
    $fields.name = $Name
    $fields.webresourcetype = $Type
    Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/webresourceset" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($fields | ConvertTo-Json -Depth 4) | Out-Null
    $id = @((Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers).value)[0].webresourceid
  }
  else {
    if ($found[0].webresourcetype -ne $Type) { throw "$Name ja existe com outro tipo ($($found[0].webresourcetype))." }
    $id = $found[0].webresourceid
    if ($found[0].content -eq $content -and -not $Description) { Write-Step "$Name sem mudanca" }
    else {
      Write-Step "atualizando $Name"
      Invoke-RestMethod -Method Patch -Uri "$apiBaseUrl/webresourceset($id)" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($fields | ConvertTo-Json -Depth 4) | Out-Null
    }
  }
  return @{ Id = $id; Name = $Name; Type = $Type; Content = $content }
}

. (Join-Path $PSScriptRoot "chunk-cleanup.ps1")
$previousChunks = @(Get-PublishedChunkNames $apiBaseUrl $headers $ResourceName $chunkPrefix)
Write-Step "build publicado antes: $($previousChunks.Count) chunks"

$resources = @($targets | ForEach-Object { Publish-WebResource $_.Name $_.Display $_.Path $_.Type $_.Description })
$publishXml = "<importexportxml><webresources>" + (($resources | ForEach-Object { "<webresource>$($_.Id)</webresource>" }) -join "") + "</webresources></importexportxml>"
Write-Step "publicando WebResources"
Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $publishXml } | ConvertTo-Json) | Out-Null

foreach ($r in $resources) {
  $published = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/webresourceset($($r.Id))?`$select=name,content,webresourcetype" -Headers $headers
  if ($published.name -ne $r.Name -or $published.webresourcetype -ne $r.Type -or $published.content -ne $r.Content) { throw "Validacao pos-publicacao falhou em $($r.Name)." }
}

if ($chunkNames.Count) {
  Write-Step "removendo chunks antigos nao gerenciados"
  Remove-ObsoleteChunks $apiBaseUrl $headers $chunkPrefix ($chunkNames + $previousChunks) -SomenteNaoGerenciados | Out-Null
}

Write-Host "PUSH PROD CONCLUIDO: v$builtVersion ($commit)"
Write-Host "URL: $environmentBaseUrl/WebResources/$(if ($LoaderName) { $LoaderName } else { $ResourceName })"
