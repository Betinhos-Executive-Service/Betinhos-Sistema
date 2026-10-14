param(
  [Parameter(Mandatory = $true)] [string] $SiteMapUniqueName,
  [Parameter(Mandatory = $true)] [string] $AfterSubAreaId,
  [Parameter(Mandatory = $true)] [string] $SubAreaId,
  [Parameter(Mandatory = $true)] [string] $Title,
  [Parameter(Mandatory = $true)] [string] $Url,
  [string] $VectorIcon = "/WebResources/cr40f_sitemap_clipboard_list.svg",
  [string] $TenantId = "organizations",
  [switch] $DeviceCode
)

# Insere (ou atualiza) uma SubArea no sitemap de um app model-driven no Dataverse DEV, logo apos
# outra SubArea existente, e publica o sitemap. Configuracao e autenticacao iguais ao push-dev.ps1.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-SiteMapUniqueName", $SiteMapUniqueName, "-AfterSubAreaId", $AfterSubAreaId, "-SubAreaId", $SubAreaId, "-Title", $Title, "-Url", $Url, "-VectorIcon", $VectorIcon, "-TenantId", $TenantId)
  if ($DeviceCode) { $arguments += "-DeviceCode" }
  & $windowsPowerShell @arguments
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[sitemap-dev] $Message" }
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
if ($blockedHosts.Count -eq 0) { throw "DV_BLOCKED_HOSTS ausente. Informe o host de PROD para que o script nunca altere nele." }
if ($blockedHosts -contains $environmentHost) { throw "Este script altera apenas DEV. $environmentHost esta bloqueado (PROD exige pedido explicito)." }

$clientId = Get-Setting "DV_CLIENT_ID"
$clientIdGuid = [Guid]::Empty
if (-not [Guid]::TryParse($clientId, [ref] $clientIdGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env." }
$solutionUniqueName = Get-Setting "DV_SOLUTION"
if ([string]::IsNullOrWhiteSpace($solutionUniqueName)) { throw "DV_SOLUTION ausente no .env." }
$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"

Write-Step "autenticacao em $environmentHost"
$clientSecret = Get-Setting "DV_CLIENT_SECRET"
if (-not [string]::IsNullOrWhiteSpace($clientSecret)) {
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

# Sitemap alvo (nao gerenciado).
$filter = Escape-OData $SiteMapUniqueName
$found = @((Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/sitemaps?`$select=sitemapid,sitemapnameunique,sitemapxml,ismanaged&`$filter=sitemapnameunique eq '$filter'" -Headers $headers).value)
if ($found.Count -ne 1) { throw "Sitemap $SiteMapUniqueName nao encontrado de forma unica ($($found.Count)). Abortado." }
if ($found[0].ismanaged) { throw "Sitemap $SiteMapUniqueName e gerenciado. Abortado." }
$siteMapId = $found[0].sitemapid

$xml = New-Object Xml.XmlDocument
$xml.PreserveWhitespace = $true
$xml.LoadXml([string] $found[0].sitemapxml)

$anchor = $xml.SelectSingleNode("//SubArea[@Id='$AfterSubAreaId']")
if ($null -eq $anchor) { throw "SubArea de referencia $AfterSubAreaId nao existe no sitemap. Abortado." }
$group = $anchor.ParentNode

$existing = $xml.SelectSingleNode("//SubArea[@Id='$SubAreaId']")
if ($null -ne $existing) {
  Write-Step "SubArea $SubAreaId ja existe; atualizando URL, icone e titulo"
  $existing.SetAttribute("Url", $Url)
  $existing.SetAttribute("VectorIcon", $VectorIcon)
  $titleNode = $existing.SelectSingleNode("Titles/Title[@LCID='1046']")
  if ($null -eq $titleNode) { throw "SubArea $SubAreaId sem titulo pt-BR; ajuste manualmente. Abortado." }
  $titleNode.SetAttribute("Title", $Title)
}
else {
  Write-Step "inserindo SubArea $SubAreaId ($Title) apos $AfterSubAreaId"
  $subArea = $xml.CreateElement("SubArea")
  $subArea.SetAttribute("Id", $SubAreaId)
  $subArea.SetAttribute("ResourceId", "SitemapDesigner.NewSubArea")
  $subArea.SetAttribute("VectorIcon", $VectorIcon)
  $subArea.SetAttribute("Icon", "/_imgs/imagestrips/transparent_spacer.gif")
  $subArea.SetAttribute("Url", $Url)
  $subArea.SetAttribute("Client", "All,Outlook,OutlookLaptopClient,OutlookWorkstationClient,Web")
  $subArea.SetAttribute("AvailableOffline", "true")
  $subArea.SetAttribute("PassParams", "false")
  $subArea.SetAttribute("Sku", "All,OnPremise,Live,SPLA")
  $titles = $xml.CreateElement("Titles")
  $titleNode = $xml.CreateElement("Title")
  $titleNode.SetAttribute("LCID", "1046")
  $titleNode.SetAttribute("Title", $Title)
  [void] $titles.AppendChild($titleNode)
  [void] $subArea.AppendChild($titles)
  [void] $group.InsertAfter($subArea, $anchor)
}

$newXml = $xml.OuterXml
Write-Step "gravando sitemap"
$body = @{ sitemapxml = $newXml } | ConvertTo-Json -Depth 3 -Compress
Invoke-RestMethod -Method Patch -Uri "$apiBaseUrl/sitemaps($siteMapId)" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null

Write-Step "publicando sitemap"
$publishXml = "<importexportxml><sitemaps><sitemap>$siteMapId</sitemap></sitemaps></importexportxml>"
Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $publishXml } | ConvertTo-Json) | Out-Null

$check = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/sitemaps($siteMapId)?`$select=sitemapxml" -Headers $headers
$checkXml = New-Object Xml.XmlDocument
$checkXml.LoadXml([string] $check.sitemapxml)
$node = $checkXml.SelectSingleNode("//SubArea[@Id='$SubAreaId']")
if ($null -eq $node -or $node.GetAttribute("Url") -ne $Url) { throw "Validacao pos-publicacao falhou: SubArea $SubAreaId ausente ou com URL diferente." }
if ($node.PreviousSibling -and $node.PreviousSibling.NodeType -eq "Element" -and $node.PreviousSibling.GetAttribute("Id") -ne $AfterSubAreaId) {
  Write-Step "aviso: a SubArea existia e nao esta logo apos $AfterSubAreaId"
}
Write-Host "SITEMAP CONCLUIDO: $SubAreaId ($Title) -> $Url em $SiteMapUniqueName"
