param(
  [Parameter(Mandatory = $true)] [string] $AppDir,
  [Parameter(Mandatory = $true)] [string] $ResourceName,
  [Parameter(Mandatory = $true)] [string] $DisplayName,
  [string] $LoaderName = "",
  [string] $TenantId = "organizations",
  [switch] $DeviceCode
)

# Publica o WebResource (dist/webresource.html) e o carregador opcional no Dataverse DEV,
# inclui ambos na solucao e valida o conteudo publicado. Configuracao vem do .env da raiz.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-AppDir", $AppDir, "-ResourceName", $ResourceName, "-DisplayName", $DisplayName, "-TenantId", $TenantId)
  if ($LoaderName) { $arguments += @("-LoaderName", $LoaderName) }
  if ($DeviceCode) { $arguments += "-DeviceCode" }
  & $windowsPowerShell @arguments
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$appRoot = Join-Path $root $AppDir

function Write-Step([string] $Message) { Write-Host "[push-dev] $Message" }
function Escape-OData([string] $Value) { return $Value.Replace("'", "''") }

function Read-DotEnv([string] $Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  return $values
}

$dotEnv = Read-DotEnv (Join-Path $root ".env")
function Get-Setting([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $dotEnv.ContainsKey($Name)) { $value = $dotEnv[$Name] }
  return $value
}

$environmentUrl = Get-Setting "DV_ENVIRONMENT_URL"
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw "DV_ENVIRONMENT_URL ausente. Copie .env.example para .env e preencha." }
$environmentBaseUrl = $environmentUrl.TrimEnd("/")
$environmentHost = ([Uri] $environmentBaseUrl).Host.ToLowerInvariant()
$blockedHosts = @((Get-Setting "DV_BLOCKED_HOSTS") -split "," | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw "DV_BLOCKED_HOSTS ausente. Informe o host de PROD para que o push nunca publique nele." }
if ($blockedHosts -contains $environmentHost) { throw "Este script publica apenas em DEV. $environmentHost esta bloqueado (PROD exige pedido explicito)." }

$clientId = Get-Setting "DV_CLIENT_ID"
$clientIdGuid = [Guid]::Empty
if (-not [Guid]::TryParse($clientId, [ref] $clientIdGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env." }
$solutionUniqueName = Get-Setting "DV_SOLUTION"
if ([string]::IsNullOrWhiteSpace($solutionUniqueName)) { throw "DV_SOLUTION ausente no .env." }

$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
$resourcePath = Join-Path $appRoot "dist\webresource.html"
if (-not (Test-Path -LiteralPath $resourcePath)) { throw "WebResource nao encontrado: $resourcePath. Rode o build antes." }

$targets = @()
# Code splitting: os chunks JS (dist/webresource-assets.json, gerado pelo inline-webresource) entram antes do HTML.
# Nome com hash: chunk com o mesmo conteudo do ambiente nao e reenviado (Publish-WebResource compara o base64).
# Depois de publicar, apaga os chunks que nao sao do build novo nem do build que estava publicado
# (chunk-cleanup.ps1): a aba aberta com a versao anterior ainda os encontra, e o lixo nao acumula.
$resourceHtml = [IO.File]::ReadAllText($resourcePath, [Text.Encoding]::UTF8)
$chunkManifestPath = Join-Path $appRoot "dist\webresource-assets.json"
$chunkNames = @()
if (Test-Path -LiteralPath $chunkManifestPath) {
  $chunkPrefix = ($ResourceName -replace '\.html$', '') + "/assets/"
  # Em variavel: no PowerShell 5.1 o ConvertFrom-Json devolve o array inteiro como um item so do pipeline.
  $chunkList = [IO.File]::ReadAllText($chunkManifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($chunk in $chunkList) {
    if (-not $chunk.name.StartsWith($chunkPrefix, [StringComparison]::Ordinal)) { throw "Chunk $($chunk.name) fora do prefixo $chunkPrefix. Deploy abortado." }
    if ($chunk.name -notmatch '^[A-Za-z0-9_]+(/[A-Za-z0-9.]+)+\.js$') { throw "Nome de chunk invalido para WebResource: $($chunk.name)." }
    $chunkPath = Join-Path $appRoot ("dist\" + $chunk.file.Replace("/", "\"))
    if (-not (Test-Path -LiteralPath $chunkPath)) { throw "Chunk ausente no build: $chunkPath. Deploy abortado." }
    $chunkNames += $chunk.name
    $targets += @{ Name = $chunk.name; Display = "$DisplayName - $($chunk.file)"; Path = $chunkPath; Type = 3 }
  }
  if ($chunkNames.Count -eq 0) { throw "webresource-assets.json sem chunks. Rode o build de novo." }
}
# Vale com ou sem manifesto: script externo citado no HTML precisa ser publicado junto.
foreach ($reference in [regex]::Matches($resourceHtml, '<script[^>]+src="/WebResources/([^"]+\.js)"|<link[^>]+href="/WebResources/([^"]+\.js)"')) {
  $referenced = @($reference.Groups[1].Value, $reference.Groups[2].Value) | Where-Object { $_ } | Select-Object -First 1
  if ($chunkNames -notcontains $referenced) { throw "webresource.html referencia /WebResources/$referenced, que nao esta em webresource-assets.json. Rode o build de novo." }
}
$targets += @{ Name = $ResourceName; Display = $DisplayName; Path = $resourcePath; Type = 1 }
if ($LoaderName) {
  $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "loader.template.html"), [Text.Encoding]::UTF8)
  $loaderPath = Join-Path $appRoot "dist\loader.html"
  $loaderHtml = $template.Replace("{{RESOURCE}}", $ResourceName).Replace("{{TITLE}}", $DisplayName)
  [IO.File]::WriteAllText($loaderPath, $loaderHtml, (New-Object Text.UTF8Encoding($false)))
  $targets += @{ Name = $LoaderName; Display = "$DisplayName (carregador)"; Path = $loaderPath; Type = 1 }
}

# Arquivos de apoio (icones, manifesto do app instalavel): o nome do arquivo e o nome do WebResource.
# Tipos do Dataverse: 3 = Script (nao ha tipo JSON; o manifesto vai como Script), 5 = PNG, 10 = ICO, 11 = SVG.
$assetTypes = @{ ".webmanifest" = 3; ".js" = 3; ".png" = 5; ".ico" = 10; ".svg" = 11 }
$assetsDir = Join-Path $appRoot "dist\WebResources"
if (Test-Path -LiteralPath $assetsDir) {
  foreach ($asset in Get-ChildItem -LiteralPath $assetsDir -File) {
    $extension = $asset.Extension.ToLowerInvariant()
    if (-not $assetTypes.ContainsKey($extension)) { throw "Tipo de arquivo sem mapeamento de WebResource: $($asset.Name)" }
    $targets += @{ Name = $asset.Name; Display = "$DisplayName - $($asset.BaseName)"; Path = $asset.FullName; Type = $assetTypes[$extension] }
  }
}

Write-Step "autenticacao em $environmentHost"
$clientSecret = Get-Setting "DV_CLIENT_SECRET"
if (-not [string]::IsNullOrWhiteSpace($clientSecret)) {
  # CI: service principal (application user no ambiente), sem login interativo nem MSAL.PS.
  $tenant = Get-Setting "DV_TENANT_ID"
  if ([string]::IsNullOrWhiteSpace($tenant)) { throw "DV_TENANT_ID ausente. Obrigatorio quando DV_CLIENT_SECRET esta definido." }
  $tokenBody = @{ grant_type = "client_credentials"; client_id = $clientIdGuid.ToString(); client_secret = $clientSecret; scope = "$environmentBaseUrl/.default" }
  $accessToken = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" -Body $tokenBody).access_token
}
else {
  if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Modulo MSAL.PS nao encontrado. Instale com: Install-Module MSAL.PS -Scope CurrentUser" }
  Import-Module MSAL.PS -ErrorAction Stop
  $scope = "$environmentBaseUrl/user_impersonation"
  $clientApplication = New-MsalClientApplication -ClientId $clientIdGuid.ToString() -TenantId $TenantId -RedirectUri ([Uri] "http://localhost")
  Enable-MsalTokenCacheOnDisk -PublicClientApplication $clientApplication
  try { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -Silent }
  catch {
    if ($DeviceCode) { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -DeviceCode }
    else { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -Interactive }
  }
  $accessToken = $tokenResult.AccessToken
}
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw "Falha ao obter token para $environmentHost." }

$headers = @{
  Authorization              = "Bearer $accessToken"
  Accept                     = "application/json"
  "OData-MaxVersion"         = "4.0"
  "OData-Version"            = "4.0"
  "MSCRM.SolutionUniqueName" = $solutionUniqueName
}

$solutionFilter = Escape-OData $solutionUniqueName
$solutionResponse = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/solutions?`$select=solutionid,uniquename,ismanaged&`$filter=uniquename eq '$solutionFilter'" -Headers $headers
$solutions = @($solutionResponse.value)
if ($solutions.Count -ne 1) { throw "Solucao $solutionUniqueName nao encontrada de forma unica. Deploy abortado." }
if ($solutions[0].ismanaged) { throw "Solucao $solutionUniqueName esta gerenciada neste ambiente. Deploy abortado." }
$solutionId = $solutions[0].solutionid

function Publish-WebResource([string] $Name, [string] $Display, [string] $Path, [int] $Type) {
  $escapedName = Escape-OData $Name
  $lookupUri = "$apiBaseUrl/webresourceset?`$select=webresourceid,name,webresourcetype,content&`$filter=name eq '$escapedName'"
  $found = @((Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers).value)
  if ($found.Count -gt 1) { throw "Mais de um WebResource encontrado para $Name. Deploy abortado." }
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
  if ($found.Count -eq 0) {
    Write-Step "criando $Name na solucao $solutionUniqueName"
    $body = @{ name = $Name; displayname = $Display; webresourcetype = $Type; content = $content; isenabledformobileclient = $true } | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/webresourceset" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
    $id = @((Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers).value)[0].webresourceid
  }
  else {
    if ($found[0].webresourcetype -ne $Type) { throw "$Name ja existe com outro tipo ($($found[0].webresourcetype)). Deploy abortado." }
    $id = $found[0].webresourceid
    if ($found[0].content -eq $content) { Write-Step "$Name sem mudanca" }
    else {
      Write-Step "atualizando $Name"
      $body = @{ displayname = $Display; content = $content; isenabledformobileclient = $true } | ConvertTo-Json -Depth 4
      Invoke-RestMethod -Method Patch -Uri "$apiBaseUrl/webresourceset($id)" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
    }
  }
  $componentUri = "$apiBaseUrl/solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and objectid eq $id and componenttype eq 61"
  if (@((Invoke-RestMethod -Method Get -Uri $componentUri -Headers $headers).value).Count -eq 0) {
    Write-Step "adicionando $Name a solucao $solutionUniqueName"
    $action = @{ ComponentId = $id; ComponentType = 61; SolutionUniqueName = $solutionUniqueName; AddRequiredComponents = $false } | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/AddSolutionComponent" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $action | Out-Null
  }
  return @{ Id = $id; Name = $Name; Type = $Type; Content = $content; ComponentUri = $componentUri }
}

$previousChunks = @()
if ($chunkNames.Count) {
  . (Join-Path $PSScriptRoot "chunk-cleanup.ps1")
  $previousChunks = @(Get-PublishedChunkNames $apiBaseUrl $headers $ResourceName $chunkPrefix)
  Write-Step "build publicado antes deste push: $($previousChunks.Count) chunks"
}

$resources = @($targets | ForEach-Object { Publish-WebResource $_.Name $_.Display $_.Path $_.Type })
$publishXml = "<importexportxml><webresources>" + (($resources | ForEach-Object { "<webresource>$($_.Id)</webresource>" }) -join "") + "</webresources></importexportxml>"
Write-Step "publicando WebResources"
Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $publishXml } | ConvertTo-Json) | Out-Null

foreach ($r in $resources) {
  $published = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/webresourceset($($r.Id))?`$select=name,content,webresourcetype" -Headers $headers
  if ($published.name -ne $r.Name -or $published.webresourcetype -ne $r.Type -or $published.content -ne $r.Content) { throw "Validacao pos-publicacao falhou em $($r.Name)." }
  if (@((Invoke-RestMethod -Method Get -Uri $r.ComponentUri -Headers $headers).value).Count -eq 0) { throw "$($r.Name) nao esta na solucao $solutionUniqueName apos a publicacao." }
}

if ($chunkNames.Count) {
  Write-Step "removendo chunks de builds antigos"
  Remove-ObsoleteChunks $apiBaseUrl $headers $chunkPrefix ($chunkNames + $previousChunks) | Out-Null
}

$builtVersion = (Get-Content -Raw (Join-Path $appRoot "package.json") | ConvertFrom-Json).version
$openName = $ResourceName
if ($LoaderName) { $openName = $LoaderName }
Write-Host "PUSH CONCLUIDO: v$builtVersion - $(($resources | ForEach-Object { $_.Name }) -join ', ') validados em $solutionUniqueName"
Write-Host "URL: $environmentBaseUrl/WebResources/$openName"
