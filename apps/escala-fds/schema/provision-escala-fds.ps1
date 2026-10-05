param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona a tabela cr40f_escalafds (Escala Fim de Semana) no Dataverse DEV e inclui na solucao do .env.
# Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

function Write-Step([string] $Message) { Write-Host "[escala-fds] $Message" }
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
  param([string] $Method, [string] $Path, [object] $Body)
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
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

$entity = "cr40f_escalafds"
if (-not (Get-EntityId "cr40f_funcionarios")) { throw "Tabela cr40f_funcionarios nao existe neste ambiente." }

# 1. Tabela
$entityId = Get-EntityId $entity
if (-not $entityId) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $entity com colunas, lookup e chave"; Write-Step "DRY RUN OK; use -Apply"; exit 0 }
  Invoke-Dataverse "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
    SchemaName = "cr40f_EscalaFds"
    DisplayName = Label "Escala Fim de Semana"
    DisplayCollectionName = Label "Escalas Fim de Semana"
    Description = Label "Situação de cada motorista por data: trabalha, plantão, folga ou indisponível."
    OwnershipType = "UserOwned"
    HasActivities = $false
    HasNotes = $false
    IsActivity = $false
    PrimaryNameAttribute = "cr40f_name"
    Attributes = @(@{
      "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
      SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = 100; FormatName = @{ Value = "Text" }
      RequiredLevel = @{ Value = "None" }
      DisplayName = Label "Título"; Description = Label "Motorista e data, gerado pela tela"
    })
  } | Out-Null
  Write-Step "tabela criada $entity"
  $entityId = Get-EntityId $entity
}
Add-SolutionComponent $entityId 1 "tabela $entity" -IncludeSubcomponents

# 2. Colunas
function Ensure-Attribute([hashtable] $Payload) {
  $logical = $Payload.SchemaName.ToLowerInvariant()
  $id = Get-AttributeId $entity $logical
  if (-not $id) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $entity.$logical"; return }
    if (-not $Payload.ContainsKey("RequiredLevel")) { $Payload.RequiredLevel = @{ Value = "None" } }
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$entity')/Attributes" $Payload | Out-Null
    Write-Step "coluna criada $entity.$logical"
    $id = Get-AttributeId $entity $logical
  }
  Add-SolutionComponent $id 2 "$entity.$logical"
}
function Picklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels, [string] $Required = "None") {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = $Required }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
}

# Valores das choices espelham STATUS_VALUE e MOTIVO_VALUE em src/domain/escala.ts.
Ensure-Attribute @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_Data"; DisplayName = Label "Data"; Description = Label "Dia da escala"; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" }; RequiredLevel = @{ Value = "ApplicationRequired" } }
Ensure-Attribute (Picklist "cr40f_Status" "Situação" "Trabalha, plantão, folga ou indisponível" @("Trabalha", "Plantão", "Folga", "Indisponível") "ApplicationRequired")
Ensure-Attribute (Picklist "cr40f_Motivo" "Motivo" "Motivo da indisponibilidade" @("Médico", "Pessoal", "Férias", "Outro"))
Ensure-Attribute (Picklist "cr40f_Turno" "Turno" "Turno de trabalho, quando parcial" @("Integral", "Manhã", "Tarde", "Noite"))
Ensure-Attribute @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Observacao"; DisplayName = Label "Observação"; Description = Label "Compromisso ou detalhe do dia"; MaxLength = 2000; Format = "TextArea" }

# 3. Lookup do motorista
$relationship = "cr40f_funcionarios_cr40f_escalafds_motorista"
$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
$rel = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$relationship'")
if ($rel.Count -eq 0 -and $Apply) {
  Invoke-Dataverse "POST" "RelationshipDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    SchemaName = $relationship; ReferencedEntity = "cr40f_funcionarios"; ReferencedAttribute = "cr40f_funcionariosid"; ReferencingEntity = $entity
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Cascade"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_Motorista"; DisplayName = Label "Motorista"; Description = Label "Motorista escalado"; RequiredLevel = @{ Value = "ApplicationRequired" } }
  } | Out-Null
  Write-Step "lookup criado $entity.cr40f_motorista"
  $rel = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$relationship'")
}
elseif ($rel.Count -eq 0) { Write-Step "DRY RUN criaria lookup $entity.cr40f_motorista" }
if ($rel.Count -eq 1) {
  Add-SolutionComponent $rel[0].MetadataId 10 "relacionamento $relationship"
  Add-SolutionComponent (Get-AttributeId $entity "cr40f_motorista") 2 "$entity.cr40f_motorista"
}

# 4. Chave alternativa motorista + data (impede duas linhas para o mesmo dia)
$keyName = "cr40f_escalafds_motorista_data"
$keysPath = "EntityDefinitions(LogicalName='$entity')/Keys"
$keys = @(Get-Rows $keysPath "MetadataId,EntityKeyIndexStatus" "SchemaName eq '$keyName'")
if ($keys.Count -eq 0 -and $Apply) {
  Invoke-Dataverse "POST" $keysPath @{ SchemaName = $keyName; DisplayName = Label "Motorista e data"; KeyAttributes = @("cr40f_motorista", "cr40f_data") } | Out-Null
  Write-Step "chave alternativa criada $keyName (indice montado em segundo plano)"
  $keys = @(Get-Rows $keysPath "MetadataId,EntityKeyIndexStatus" "SchemaName eq '$keyName'")
}
elseif ($keys.Count -eq 0) { Write-Step "DRY RUN criaria chave $keyName" }
if ($keys.Count -eq 1) { Add-SolutionComponent $keys[0].MetadataId 14 "chave $keyName"; Write-Step "chave ${keyName}: $($keys[0].EntityKeyIndexStatus)" }

# 5. Publicacao e validacao
if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>" } | Out-Null
  $missing = @(@("cr40f_name", "cr40f_data", "cr40f_status", "cr40f_motivo", "cr40f_turno", "cr40f_observacao", "cr40f_motorista") | Where-Object { -not (Get-AttributeId $entity $_) })
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $entityId and componenttype eq 1").Count -eq 0) { throw "$entity nao esta na solucao $SolutionUniqueName." }
  Write-Step "SCHEMA OK: $entity publicado e na solucao $SolutionUniqueName"
}
else { Write-Step "DRY RUN OK; use -Apply" }
