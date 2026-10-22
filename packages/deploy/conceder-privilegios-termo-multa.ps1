param(
  [switch] $Apply,
  [switch] $DeviceCode,
  # Gestao/escritorio. Equipes de gestao de frota e DP nao existem no DEV (22/10/2026); o acesso vem pelo papel.
  [string[]] $GestaoRoles = @("DEV - Usuário"),
  # Papel dos motoristas no App Motoristas v2 (o mesmo de scripts/grant-checklists-role.ps1 daquele repo).
  [string] $MotoristaRole = "Acesso-Motoristas",
  # Membros do perfil de campo (domainname). Vazio = so o usuario do token (teste), ate existir equipe de frota/DP.
  [string[]] $MembrosPerfil = @()
)

# Task A2 do termo de multa: privilegios das 3 tabelas e column security de selfie/latitude/longitude.
# Gestao: Read/Create/Write/Append/AppendTo Global nas 3 tabelas; Delete so em new_textotermomulta (a trava real e o plugin).
# Motorista: so Read Basic em new_termomulta e new_parcelamultafolha; o acesso aos registros vem do compartilhamento feito pelo plugin.
# Nunca reduz profundidade existente nem remove privilegio. Sem -Apply roda em DRY RUN. Idempotente.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os nomes acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[privilegios-termo-multa] $Message" }
function Escape-OData([string] $Value) { $Value.Replace("'", "''") }
function Label([string] $Text) { @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1046 }) } }

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
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw "DV_ENVIRONMENT_URL ausente no .env." }
$script:baseUrl = $environmentUrl.TrimEnd("/")
$environmentHost = ([Uri] $script:baseUrl).Host.ToLowerInvariant()
# PROD bloqueado no codigo, alem do DV_BLOCKED_HOSTS: este script so roda no DEV.
$prodHost = "orgf261ae8e.crm2.dynamics.com"
if ($environmentHost -eq $prodHost) { throw "$environmentHost e o PROD: este script nunca roda em PROD." }
$blockedHosts = @((Get-Setting "DV_BLOCKED_HOSTS") -split "," | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw "DV_BLOCKED_HOSTS ausente. Informe o host de PROD." }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost esta bloqueado (PROD exige pedido explicito)." }
$SolutionUniqueName = Get-Setting "DV_SOLUTION"
if ([string]::IsNullOrWhiteSpace($SolutionUniqueName)) { throw "DV_SOLUTION ausente no .env." }
$clientId = Get-Setting "DV_CLIENT_ID"
$clientGuid = [Guid]::Empty
if (-not [Guid]::TryParse($clientId, [ref] $clientGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env." }

function Get-AccessToken {
  $secret = Get-Setting "DV_CLIENT_SECRET"
  if (-not [string]::IsNullOrWhiteSpace($secret)) {
    $tenant = Get-Setting "DV_TENANT_ID"
    $body = @{ grant_type = "client_credentials"; client_id = $clientId; client_secret = $secret; scope = "$script:baseUrl/.default" }
    return (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" -Body $body).access_token
  }
  if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Modulo MSAL.PS nao encontrado. Install-Module MSAL.PS -Scope CurrentUser" }
  Import-Module MSAL.PS -ErrorAction Stop
  $client = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
  Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
  $scope = "$script:baseUrl/user_impersonation"
  try { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken }
  catch {
    if ($DeviceCode) { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken }
    return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Interactive).AccessToken
  }
}

Write-Step "autenticacao em $environmentHost"
$script:token = Get-AccessToken
if ([string]::IsNullOrWhiteSpace($script:token)) { throw "Token Dataverse nao obtido." }

function Invoke-Dataverse {
  param([string] $Method, [string] $Path, [object] $Body, [hashtable] $ExtraHeaders = @{})
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
  foreach ($key in $ExtraHeaders.Keys) { $headers[$key] = $ExtraHeaders[$key] }
  $params = @{ Method = $Method; Uri = "$script:baseUrl/api/data/v9.2/$Path"; Headers = $headers; ContentType = "application/json; charset=utf-8" }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)) }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}

function Get-Rows([string] $EntitySet, [string] $Select, [string] $Filter = "") {
  $path = "${EntitySet}?`$select=$Select"
  if ($Filter) { $path += "&`$filter=$([uri]::EscapeDataString($Filter))" }
  return @((Invoke-Dataverse "GET" $path).value)
}

$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$tabelas = @("new_termomulta", "new_parcelamultafolha", "new_textotermomulta")

$privs = @{}
foreach ($t in $tabelas) {
  foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'$t')")) { $privs[$p.name] = $p.privilegeid }
}

function Get-Papel([string] $Nome) {
  $papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $Nome)' and _parentroleid_value eq null")
  if ($papeis.Count -ne 1) { throw "Papel '$Nome' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
  return $papeis[0]
}

function Get-Profundidades($RoleId) {
  $mapa = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $RoleId")) { $mapa[[string]$rp.privilegeid] = [int]$rp.privilegedepthmask }
  return $mapa
}

# Concede so o que falta ou esta abaixo da profundidade pedida; nunca rebaixa nem remove.
function Grant-Role([string] $Nome, [hashtable] $Pedido) {
  $papel = Get-Papel $Nome
  $atual = Get-Profundidades $papel.roleid
  $concessoes = @()
  foreach ($nomePriv in @($Pedido.Keys | Sort-Object)) {
    if (-not $privs.ContainsKey($nomePriv)) { throw "Privilegio $nomePriv nao existe (rode provision-termo-multa.ps1 -Apply antes)." }
    $id = [string]$privs[$nomePriv]; $depth = $Pedido[$nomePriv]
    if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
    $concessoes += @{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $nomePriv }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$Nome ja tem tudo: nada a conceder"; return }
  $resumo = ($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN $Nome receberia: $resumo"; return }
  Invoke-Dataverse "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = Get-Profundidades $papel.roleid
  foreach ($c in $concessoes) {
    $id = [string]$c.PrivilegeId
    if (-not $depois.ContainsKey($id) -or $depois[$id] -lt $ordem[$c.Depth]) { throw "$Nome ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$Nome concedido: $resumo"
}

$gestao = @{}
foreach ($t in $tabelas) { foreach ($acao in @("prvRead", "prvCreate", "prvWrite", "prvAppend", "prvAppendTo")) { $gestao["$acao$t"] = "Global" } }
$gestao["prvDeletenew_textotermomulta"] = "Global"
foreach ($nome in $GestaoRoles) { Grant-Role $nome $gestao }

# Motorista: nenhum Write/Create/Delete. Avisa (sem remover) se o papel ja tiver algo alem de Read nessas tabelas.
Grant-Role $MotoristaRole @{ "prvReadnew_termomulta" = "Basic"; "prvReadnew_parcelamultafolha" = "Basic" }
$nomePorId = @{}; foreach ($k in $privs.Keys) { $nomePorId[[string]$privs[$k]] = $k }
foreach ($id in @((Get-Profundidades (Get-Papel $MotoristaRole).roleid).Keys)) {
  $n = $nomePorId[$id]
  if ($n -and $n -notlike "prvRead*") { Write-Step "AVISO: $MotoristaRole tem $n; o spec diz so Read (nada foi removido)." }
}

# Column security: perfil "Termo de multa - leitura" so com leitura; quem grava as 3 colunas e o plugin.
$perfilNome = "Termo de multa - leitura"
$colunas = @("new_selfie", "new_latitude", "new_longitude")
$perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$(Escape-OData $perfilNome)'")
if ($perfis.Count -gt 1) { throw "Perfil '$perfilNome' duplicado." }
$perfilId = $null
if ($perfis.Count -eq 1) { $perfilId = $perfis[0].fieldsecurityprofileid; Write-Step "perfil '$perfilNome' ja existe" }
elseif (-not $Apply) { Write-Step "DRY RUN criaria o perfil '$perfilNome'" }
else {
  $r = Invoke-Dataverse "POST" "fieldsecurityprofiles" @{ name = $perfilNome; description = "Leitura de selfie e localizacao do termo de multa (gestao de frota e DP)." } @{ Prefer = "return=representation" }
  $perfilId = $r.fieldsecurityprofileid
  Write-Step "perfil '$perfilNome' criado"
}

$alterouMetadata = $false
foreach ($col in $colunas) {
  $attr = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='new_termomulta')/Attributes(LogicalName='$col')"
  if (-not $attr.CanBeSecuredForRead) { Write-Step "AVISO: $col nao aceita IsSecured; seguindo com as demais"; continue }
  if ($attr.IsSecured) { Write-Step "$col ja e IsSecured"; continue }
  if (-not $Apply) { Write-Step "DRY RUN marcaria $col como IsSecured"; continue }
  $corpo = @{}
  foreach ($p in $attr.PSObject.Properties) { if ($p.Name -ne "@odata.context") { $corpo[$p.Name] = $p.Value } }
  $corpo["@odata.type"] = ([string]$attr.'@odata.type').TrimStart('#')
  $corpo["IsSecured"] = $true
  Invoke-Dataverse "PUT" "EntityDefinitions(LogicalName='new_termomulta')/Attributes($($attr.MetadataId))" $corpo @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  $alterouMetadata = $true
  Write-Step "$col marcado como IsSecured"
}
if ($alterouMetadata) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>new_termomulta</entity></entities></importexportxml>" } | Out-Null
  Write-Step "new_termomulta publicada"
}

if ($perfilId) {
  foreach ($col in $colunas) {
    $fp = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread" "_fieldsecurityprofileid_value eq $perfilId and entityname eq 'new_termomulta' and attributelogicalname eq '$col'")
    if ($fp.Count -eq 1 -and $fp[0].canread -eq 4) { Write-Step "leitura em $col ja concedida"; continue }
    if (-not $Apply) { Write-Step "DRY RUN daria leitura em $col"; continue }
    if ($fp.Count -eq 1) { Invoke-Dataverse "PATCH" "fieldpermissions($($fp[0].fieldpermissionid))" @{ canread = 4 } | Out-Null }
    else { Invoke-Dataverse "POST" "fieldpermissions" @{ "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"; entityname = "new_termomulta"; attributelogicalname = $col; canread = 4; cancreate = 0; canupdate = 0 } | Out-Null }
    Write-Step "leitura em $col concedida ao perfil"
  }
  $ids = @()
  if ($MembrosPerfil.Count) {
    foreach ($m in $MembrosPerfil) {
      $u = @(Get-Rows "systemusers" "systemuserid" "domainname eq '$(Escape-OData $m)'")
      if ($u.Count -ne 1) { throw "Usuario '$m' nao encontrado." }
      $ids += [string]$u[0].systemuserid
    }
  } else {
    $ids += [string](Invoke-Dataverse "GET" "WhoAmI").UserId
    Write-Step "AVISO: sem equipe de frota/DP no DEV; o unico membro do perfil e o usuario do token (teste)"
  }
  $atuais = @(@((Invoke-Dataverse "GET" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association?`$select=systemuserid").value) | ForEach-Object { [string]$_.systemuserid })
  foreach ($id in $ids) {
    if ($atuais -contains $id) { Write-Step "usuario $id ja e membro do perfil"; continue }
    if (-not $Apply) { Write-Step "DRY RUN incluiria o usuario $id no perfil"; continue }
    Invoke-Dataverse "POST" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association/`$ref" @{ "@odata.id" = "$script:baseUrl/api/data/v9.2/systemusers($id)" } | Out-Null
    Write-Step "usuario $id incluido no perfil"
  }
}
Write-Step $(if ($Apply) { "PRIVILEGIOS OK" } else { "DRY RUN OK; use -Apply" })
