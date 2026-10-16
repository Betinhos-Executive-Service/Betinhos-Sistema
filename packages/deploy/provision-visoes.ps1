param(
  [switch] $Apply,
  [switch] $DeviceCode,
  # .env alternativo (worktree nao tem .env: aponte para o do checkout principal).
  [string] $EnvFile,
  # Papeis comuns que leem todas as visoes e gerenciam so as proprias.
  [string[]] $Roles = @("Acesso-Betinhos-Canvas", "Acesso-Betinhos-MDA", "DEV - Usuário")
)

# Provisiona as visoes salvas de tabela (Design System 1.6.0, secao 10.9.1) no Dataverse DEV e inclui na solucao do .env:
# tabela cr40f_visaodetabela, papel "Gestor de visoes" (publica), papel da equipe e equipe "Visoes publicas" (dona das publicas),
# e os privilegios dos papeis comuns. Idempotente. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[visoes] $Message" }
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
$dotEnv = Read-DotEnv $(if ($EnvFile) { $EnvFile } else { Join-Path $root ".env" })
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

$solution = @(Get-Rows "solutions" "solutionid,ismanaged" "uniquename eq '$(Escape-OData $SolutionUniqueName)'")
if ($solution.Count -ne 1 -or [bool]$solution[0].ismanaged) { throw "Solucao $SolutionUniqueName nao e unmanaged unica." }
$solutionId = $solution[0].solutionid

function Add-SolutionComponent([object] $ComponentId, [int] $ComponentType, [string] $Label, [switch] $IncludeSubcomponents) {
  if (-not $Apply -or -not $ComponentId) { return }
  $filter = "_solutionid_value eq $solutionId and objectid eq $ComponentId and componenttype eq $ComponentType"
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" $filter).Count -gt 0) { return }
  Invoke-Dataverse "POST" "AddSolutionComponent" @{ ComponentId = $ComponentId; ComponentType = $ComponentType; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = -not $IncludeSubcomponents } | Out-Null
  Write-Step "na solucao: $Label"
}

function Get-EntityId([string] $LogicalName) {
  $rows = @((Invoke-Dataverse "GET" "EntityDefinitions?`$select=MetadataId&`$filter=LogicalName eq '$LogicalName'").value)
  if ($rows.Count -eq 1) { return $rows[0].MetadataId }
  return $null
}
function Get-AttributeId([string] $Entity, [string] $LogicalName) {
  $rows = @(Get-Rows "EntityDefinitions(LogicalName='$Entity')/Attributes" "MetadataId" "LogicalName eq '$LogicalName'")
  if ($rows.Count -eq 1) { return $rows[0].MetadataId }
  return $null
}

function Text([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function YesNo([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; DefaultValue = $false
     OptionSet = @{ TrueOption = @{ Value = 1; Label = Label "Sim" }; FalseOption = @{ Value = 0; Label = Label "Não" } } }
}
function Ensure-AttributeOn([string] $Entity, [hashtable] $Payload) {
  $logical = $Payload.SchemaName.ToLowerInvariant()
  $id = Get-AttributeId $Entity $logical
  if (-not $id) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $Entity.$logical"; return }
    if (-not $Payload.ContainsKey("RequiredLevel")) { $Payload.RequiredLevel = @{ Value = "None" } }
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$Entity')/Attributes" $Payload | Out-Null
    Write-Step "coluna criada $Entity.$logical"
    $id = Get-AttributeId $Entity $logical
  }
  Add-SolutionComponent $id 2 "$Entity.$logical"
}
function Ensure-Table([string] $Logical, [string] $Schema, [string] $Display, [string] $Plural, [string] $Description) {
  $id = Get-EntityId $Logical
  if (-not $id -and $Apply) {
    Invoke-Dataverse "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema; DisplayName = Label $Display; DisplayCollectionName = Label $Plural
      Description = Label $Description; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = 850; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = "None" }; DisplayName = Label "Nome"; Description = Label "Nome exibido" })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical" }
  if ($id) { Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents }
  return $id
}
function Integer([string] $Schema, [string] $Display, [string] $Description, [int] $Min, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = $Min; MaxValue = $Max; Format = "None" }
}

$visao = "cr40f_visaodetabela"
$equipeNome = "Visões públicas"
$gestorNome = "Gestor de visões"
$equipePapelNome = "Equipe - Visões públicas"

$visaoId = Ensure-Table $visao "cr40f_VisaoDeTabela" "Visão de tabela" "Visões de tabela" "Visão salva de uma lista do Sistema Betinhos: colunas, ordem, larguras, ordenação e filtros. Pública quando pertence à equipe Visões públicas."
if (-not $Apply -and -not $visaoId) {
  Write-Step "DRY RUN criaria colunas: cr40f_tela, cr40f_publica, cr40f_configuracao, cr40f_ordem"
  Write-Step "DRY RUN criaria o papel '$gestorNome' (Global: Create/Read/Write/Delete/Append/AppendTo/Assign/Share) e '$equipePapelNome' (Read Basic)"
  Write-Step "DRY RUN criaria a equipe '$equipeNome' e daria a ela o papel '$equipePapelNome'"
  Write-Step "DRY RUN daria a $($Roles -join ', '): Read Global; Create/Write/Delete/Append/AppendTo Basic"
  foreach ($nome in $Roles) {
    if (@(Get-Rows "roles" "roleid" "name eq '$(Escape-OData $nome)' and _parentroleid_value eq null").Count -ne 1) { throw "Papel '$nome' nao encontrado (ou ambiguo) na unidade raiz." }
  }
  Write-Step "DRY RUN OK; use -Apply"
  exit 0
}

Ensure-AttributeOn $visao (Text "cr40f_Tela" "Tela" "Id estável da lista (pessoas, frota.veiculos…)" 100)
Ensure-AttributeOn $visao (YesNo "cr40f_Publica" "Pública" "Espelho para filtro; a regra real é o dono ser a equipe Visões públicas")
Ensure-AttributeOn $visao @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Configuracao"; DisplayName = Label "Configuração"; Description = Label "JSON versionado: colunas, ordem, larguras, ordenação e filtros"; MaxLength = 20000; Format = "TextArea" }
Ensure-AttributeOn $visao (Integer "cr40f_Ordem" "Ordem" "Ordem entre as visões públicas da tela" 0 9999)

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$visao</entity></entities></importexportxml>" } | Out-Null
}

# Privilegios da tabela nova, por prefixo (prvRead, prvWrite...).
$privs = @{}
foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'$visao')")) { $privs[$p.name.Substring(0, $p.name.Length - $visao.Length)] = $p.privilegeid }
foreach ($need in @("prvCreate", "prvRead", "prvWrite", "prvDelete", "prvAppend", "prvAppendTo", "prvAssign", "prvShare")) {
  if (-not $privs.ContainsKey($need)) { throw "Privilegio $need$visao nao existe apos a publicacao." }
}
$raiz = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
if ($raiz.Count -ne 1) { throw "Unidade de negocio raiz nao encontrada." }
$buId = $raiz[0].businessunitid

function Grant([object] $Role, [hashtable] $Depths) {
  $concessoes = @($Depths.Keys | ForEach-Object { @{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $privs[$_]; Depth = $Depths[$_]; BusinessUnitId = $Role._businessunitid_value; PrivilegeName = "$_$visao" } })
  $resumo = ($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN $($Role.name) receberia: $resumo"; return }
  Invoke-Dataverse "POST" "roles($($Role.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $atual = @(Get-Rows "roleprivilegescollection" "privilegeid" "roleid eq $($Role.roleid)") | Where-Object { $privs.Values -contains $_.privilegeid }
  if (@($atual).Count -lt $concessoes.Count) { throw "$($Role.name) ficou com $(@($atual).Count) de $($concessoes.Count) privilegios esperados." }
  Write-Step "$($Role.name): $resumo"
}
function Ensure-Role([string] $Name) {
  $rows = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $Name)' and _parentroleid_value eq null")
  if ($rows.Count -gt 1) { throw "Papel '$Name' ambiguo: $($rows.Count)." }
  if ($rows.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria o papel '$Name'"; return $null }
    Invoke-Dataverse "POST" "roles" @{ name = $Name; "businessunitid@odata.bind" = "/businessunits($buId)" } | Out-Null
    Write-Step "papel criado '$Name'"
    $rows = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $Name)' and _parentroleid_value eq null")
  }
  Add-SolutionComponent $rows[0].roleid 20 "papel $Name"
  return $rows[0]
}

# Gestor: publica, altera e exclui qualquer visao (Assign e o que permite passar a visao para a equipe).
$gestor = Ensure-Role $gestorNome
if ($gestor) { Grant $gestor @{ prvCreate = "Global"; prvRead = "Global"; prvWrite = "Global"; prvDelete = "Global"; prvAppend = "Global"; prvAppendTo = "Global"; prvAssign = "Global"; prvShare = "Global" } }

# A equipe dona das visoes publicas precisa de Read na tabela para poder ser dona.
$equipePapel = Ensure-Role $equipePapelNome
if ($equipePapel) { Grant $equipePapel @{ prvRead = "Basic" } }

$equipes = @(Get-Rows "teams" "teamid,name" "name eq '$(Escape-OData $equipeNome)' and teamtype eq 0")
if ($equipes.Count -gt 1) { throw "Equipe '$equipeNome' ambigua: $($equipes.Count)." }
if ($equipes.Count -eq 0 -and $Apply) {
  $me = Invoke-Dataverse "GET" "WhoAmI"
  Invoke-Dataverse "POST" "teams" @{ name = $equipeNome; teamtype = 0; "businessunitid@odata.bind" = "/businessunits($buId)"; "administratorid@odata.bind" = "/systemusers($($me.UserId))"; description = "Dona das visões públicas de tabela do Sistema Betinhos. Não adicione membros." } | Out-Null
  Write-Step "equipe criada '$equipeNome'"
  $equipes = @(Get-Rows "teams" "teamid,name" "name eq '$(Escape-OData $equipeNome)' and teamtype eq 0")
}
elseif ($equipes.Count -eq 0) { Write-Step "DRY RUN criaria a equipe '$equipeNome'" }
if ($equipes.Count -eq 1 -and $equipePapel) {
  $temPapel = @((Invoke-Dataverse "GET" "teams($($equipes[0].teamid))/teamroles_association?`$select=roleid").value | Where-Object { $_.roleid -eq $equipePapel.roleid })
  if ($temPapel.Count -eq 0) {
    if ($Apply) {
      Invoke-Dataverse "POST" "teams($($equipes[0].teamid))/teamroles_association/`$ref" @{ "@odata.id" = "$script:baseUrl/api/data/v9.2/roles($($equipePapel.roleid))" } | Out-Null
      Write-Step "papel '$equipePapelNome' na equipe '$equipeNome'"
    }
    else { Write-Step "DRY RUN daria o papel '$equipePapelNome' a equipe '$equipeNome'" }
  }
}

# Usuarios comuns: leem todas (publicas e, via API, pessoais de outros: risco aceito em 15/10/2026) e mexem so nas proprias. Sem Assign: nao publicam.
foreach ($nome in $Roles) {
  $papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $nome)' and _parentroleid_value eq null")
  if ($papeis.Count -ne 1) { throw "Papel '$nome' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
  Grant $papeis[0] @{ prvCreate = "Basic"; prvRead = "Global"; prvWrite = "Basic"; prvDelete = "Basic"; prvAppend = "Basic"; prvAppendTo = "Basic" }
}

if ($Apply) {
  $missing = @(@("cr40f_name", "cr40f_tela", "cr40f_publica", "cr40f_configuracao", "cr40f_ordem") | Where-Object { -not (Get-AttributeId $visao $_) })
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $visaoId and componenttype eq 1").Count -eq 0) { throw "Tabela $visao nao esta na solucao $SolutionUniqueName." }
  foreach ($r in @($gestor, $equipePapel)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $($r.roleid) and componenttype eq 20").Count -eq 0) { throw "Papel $($r.name) nao esta na solucao $SolutionUniqueName." }
  }
  Write-Step "SCHEMA OK: $visao publicada e na solucao $SolutionUniqueName; papeis e equipe '$equipeNome' prontos"
  Write-Step "LEMBRETE: a equipe nao e componente de solucao. No PROD, rode este script (ou crie a equipe e de a ela o papel '$equipePapelNome')."
  Write-Step "LEMBRETE: atribua o papel '$gestorNome' aos gestores; System Administrator ja publica."
}
else { Write-Step "DRY RUN OK; use -Apply" }
