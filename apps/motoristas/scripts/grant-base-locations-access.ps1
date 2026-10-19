param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

# Inclui a tabela Local de base (new_localdebase) no App Betinhos Interno, logo apos
# Veiculos no menu, e concede leitura aos perfis operacionais. Sem -Apply roda em DRY RUN.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$api = "$baseUrl/api/data/v9.2"
$appId = "7c7c8fda-53d0-f011-8543-6045bd3a51ea"
$entity = "new_localdebase"
$subAreaId = "subarea_localdebase"
$anchorSubAreaId = "subarea_f8e19d2d"
$roleNames = @("Acesso-Motoristas", "Acesso-Betinhos-MDA", "Acesso-Betinhos-Canvas", "DEV - Usuário")
$privilegeName = "prvReadnew_LocalDeBase"

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = (Get-MsalToken -PublicClientApplication $client -Scopes "$baseUrl/user_impersonation" -Silent).AccessToken
if (-not $token) { throw "Token indisponivel." }
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }
function Write-Step([string] $Message) { Write-Output "[base-locations-access] $Message" }
function Read-Dv([string] $Path) { return Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers }
function Rows([string] $Path) { return @((Read-Dv $Path).value) }
function Post-Dv([string] $Path, $Body) {
  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method Post -Uri "$api/$Path" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json))
}

$entityMeta = @(Rows "EntityDefinitions?`$select=MetadataId,LogicalName&`$filter=LogicalName eq '$entity'")
if ($entityMeta.Count -ne 1) { throw "Tabela $entity nao existe; rode provision-base-locations.ps1 -Apply antes." }
$entityMetadataId = [guid]$entityMeta[0].MetadataId

$app = Read-Dv "appmodules($appId)?`$select=appmoduleid,appmoduleidunique,name"
if ($app.name -ne "App Betinhos Interno") { throw "Aplicativo interno inesperado." }

# 1. Componente de tabela no app
$appEntities = @(Rows "appmodulecomponents?`$select=objectid&`$filter=_appmoduleidunique_value eq $($app.appmoduleidunique) and componenttype eq 1 and objectid eq $entityMetadataId")
$needsPublish = $false
if ($appEntities.Count -eq 0) {
  if ($Apply) {
    Post-Dv "AddAppComponents" @{ AppId = $appId; Components = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.entity"; entityid = $entityMetadataId }) } | Out-Null
    Write-Step "tabela $entity incluida no app"
    $needsPublish = $true
  } else { Write-Step "DRY RUN incluiria a tabela $entity no app" }
} else { Write-Step "tabela $entity ja esta no app" }

# 2. Entrada no menu, logo apos Veiculos
$components = @(Rows "appmodulecomponents?`$select=objectid&`$filter=_appmoduleidunique_value eq $($app.appmoduleidunique) and componenttype eq 62")
if ($components.Count -ne 1) { throw "Sitemap do aplicativo ausente ou duplicado." }
$sitemapId = [guid]$components[0].objectid
$sitemap = Read-Dv "sitemaps($sitemapId)?`$select=sitemapid,sitemapxml"
[xml]$xml = $sitemap.sitemapxml
$anchor = @($xml.SelectNodes("//SubArea[@Id='$anchorSubAreaId']"))
$existing = @($xml.SelectNodes("//SubArea[@Entity='$entity']"))
if ($anchor.Count -ne 1 -or $anchor[0].GetAttribute("Entity") -ne "cr40f_veiculos") { throw "Entrada de Veiculos nao encontrada no menu." }
if ($existing.Count -gt 1) { throw "Tabela $entity duplicada no menu." }
if ($existing.Count -eq 1) { Write-Step "menu ja contem $entity" }
elseif (-not $Apply) { Write-Step "DRY RUN incluiria Locais de base no menu apos Veiculos" }
else {
  $backupDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "backup\base-locations"
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $backupPath = Join-Path $backupDir ("sitemap-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".xml")
  [IO.File]::WriteAllText($backupPath, $sitemap.sitemapxml, [Text.Encoding]::UTF8)
  $subArea = $xml.CreateElement("SubArea")
  $subArea.SetAttribute("Id", $subAreaId)
  $subArea.SetAttribute("Entity", $entity)
  $titles = $xml.CreateElement("Titles")
  $title = $xml.CreateElement("Title")
  $title.SetAttribute("Title", "Locais de base")
  $title.SetAttribute("LCID", "1046")
  [void]$titles.AppendChild($title)
  [void]$subArea.AppendChild($titles)
  [void]$anchor[0].ParentNode.InsertAfter($subArea, $anchor[0])
  $writeHeaders = $headers.Clone()
  $writeHeaders["If-Match"] = "*"
  $body = @{ sitemapxml = $xml.OuterXml } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Patch -Uri "$api/sitemaps($sitemapId)" -Headers $writeHeaders -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  Write-Step "menu atualizado (backup: $backupPath)"
  $needsPublish = $true
}

if ($needsPublish) {
  Post-Dv "PublishXml" @{ ParameterXml = "<importexportxml><sitemaps><sitemap>$sitemapId</sitemap></sitemaps><appmodules><appmodule>$appId</appmodule></appmodules></importexportxml>" } | Out-Null
  [xml]$publishedXml = (Read-Dv "sitemaps($sitemapId)?`$select=sitemapxml").sitemapxml
  if (@($publishedXml.SelectNodes("//SubArea[@Entity='$entity']")).Count -ne 1) { throw "Menu publicado nao contem $entity." }
  Write-Step "app publicado e menu verificado"
}

# 3. Leitura nos perfis operacionais (tabela organizacional: escopo Global)
$privilege = @(Rows "privileges?`$select=privilegeid,name&`$filter=name eq '$privilegeName'")
if ($privilege.Count -ne 1) { throw "Privilegio $privilegeName ausente ou duplicado." }
$privilegeId = [guid]$privilege[0].privilegeid
foreach ($roleName in $roleNames) {
  $escaped = $roleName.Replace("'", "''")
  $roles = @(Rows "roles?`$select=roleid,_businessunitid_value&`$filter=name eq '$escaped' and _parentroleid_value eq null")
  if ($roles.Count -ne 1) { throw "Perfil $roleName ausente ou duplicado na unidade raiz." }
  $roleId = [guid]$roles[0].roleid
  $current = @(Rows "roleprivilegescollection?`$select=roleprivilegeid,privilegedepthmask&`$filter=roleid eq $roleId and privilegeid eq $privilegeId")
  if ($current.Count -ge 1) { Write-Step "$roleName ja le Locais de base (depth=$($current[0].privilegedepthmask))"; continue }
  if (-not $Apply) { Write-Step "DRY RUN concederia leitura Global de Locais de base a $roleName"; continue }
  Post-Dv "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @(@{ Depth = "Global"; PrivilegeId = $privilegeId; BusinessUnitId = [guid]$roles[0]._businessunitid_value; PrivilegeName = $privilegeName }) } | Out-Null
  $verified = @(Rows "roleprivilegescollection?`$select=roleprivilegeid&`$filter=roleid eq $roleId and privilegeid eq $privilegeId")
  if ($verified.Count -ne 1) { throw "Concessao para $roleName nao confirmada." }
  Write-Step "${roleName}: leitura Global de Locais de base concedida e verificada"
}

Write-Step $(if ($Apply) { "OK" } else { "DRY RUN OK; use -Apply para aplicar" })
