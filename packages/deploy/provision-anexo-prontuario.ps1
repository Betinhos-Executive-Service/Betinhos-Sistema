param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona a tabela cr40f_liberacaoanexo (liberacao de uso unico para o Claude anexar no prontuario) no Dataverse DEV
# e inclui na solucao do .env. Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz.
# Tabela de propriedade organizacional e SEM privilegio para os papeis comuns: so o plugin (sistema) grava e so quem
# tem prvWritecr40f_liberacaoanexo (administrador / conta do flow) executa a cr40f_ConsumirAnexoProntuario.
# As Custom APIs NAO sao criadas aqui: o registrar do push do plugin (pnpm push:plugin:prontuario:dev) cria e amarra.
# Rode este script antes do push do plugin. Arquivo salvo com BOM (Windows PowerShell 5.1 le os rotulos acentuados).

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[anexo-prontuario] $Message" }
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
# Data e hora em UTC (comportamento UserLocal grava e devolve UTC pela Web API).
function DateTimeUtc([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
}
function Int([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "None"; MinValue = 0; MaxValue = 1000000 }
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
# O Dataverse ignora MaxLength e RequiredLevel do atributo primario no POST da tabela: acerta depois por PUT da metadata completa.
function Ensure-NameAttribute([string] $Entity, [int] $Max, [string] $Required) {
  $attr = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='cr40f_name')/Microsoft.Dynamics.CRM.StringAttributeMetadata"
  if ($attr.MaxLength -eq $Max -and $attr.RequiredLevel.Value -eq $Required) { return }
  if (-not $Apply) { Write-Step "DRY RUN mudaria $Entity.cr40f_name de MaxLength $($attr.MaxLength)/$($attr.RequiredLevel.Value) para $Max/$Required"; return }
  foreach ($name in @($attr.PSObject.Properties | Where-Object { $_.Name -like "@odata.*" } | ForEach-Object { $_.Name })) { $attr.PSObject.Properties.Remove($name) }
  $attr | Add-Member -NotePropertyName "@odata.type" -NotePropertyValue "Microsoft.Dynamics.CRM.StringAttributeMetadata" -Force
  $attr.MaxLength = $Max
  $attr.RequiredLevel.Value = $Required
  Invoke-Dataverse "PUT" "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='cr40f_name')" $attr -ExtraHeaders @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "cr40f_name de $Entity com MaxLength $Max e RequiredLevel $Required"
}
# Propriedade organizacional: a liberacao nao pertence a um usuario; acesso so pelo plugin (sistema) e pelo flow.
function Ensure-Table([string] $Logical, [string] $Schema, [string] $Display, [string] $Plural, [string] $Description, [int] $NameMax, [string] $NameRequired, [string] $NameDisplay, [string] $NameDescription) {
  $id = Get-EntityId $Logical
  if (-not $id -and $Apply) {
    Invoke-Dataverse "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema; DisplayName = Label $Display; DisplayCollectionName = Label $Plural
      Description = Label $Description; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = $NameMax; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = $NameRequired }; DisplayName = Label $NameDisplay; Description = Label $NameDescription })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical (propriedade organizacional)" }
  if ($id) {
    $ownership = (Invoke-Dataverse "GET" "EntityDefinitions($id)?`$select=OwnershipType").OwnershipType
    if ($ownership -ne "OrganizationOwned") { Write-Step "AVISO: $Logical ja existe com propriedade $ownership (esperado OrganizationOwned); o tipo nao muda depois de criada." }
    Ensure-NameAttribute $Logical $NameMax $NameRequired
    Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents
  }
  return $id
}
$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
function Ensure-Lookup([string] $Relationship, [string] $Referenced, [string] $Referencing, [string] $Schema, [string] $Display, [string] $Description, [string] $Delete, [string] $Required = "None") {
  $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  if ($rows.Count -eq 0 -and $Apply) {
    Invoke-Dataverse "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $Relationship
      ReferencedEntity = $Referenced; ReferencedAttribute = "${Referenced}id"; ReferencingEntity = $Referencing
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = $Delete; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = $Required } }
    } | Out-Null
    Write-Step "lookup criado $Referencing.$($Schema.ToLowerInvariant())"
    $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  }
  elseif ($rows.Count -eq 0) { Write-Step "DRY RUN criaria lookup $Referencing.$($Schema.ToLowerInvariant())" }
  if ($rows.Count -eq 1) {
    Add-SolutionComponent $rows[0].MetadataId 10 "relacionamento $Relationship"
    Add-SolutionComponent (Get-AttributeId $Referencing $Schema.ToLowerInvariant()) 2 "$Referencing.$($Schema.ToLowerInvariant())"
  }
}

foreach ($dep in @("cr40f_funcionarios", "systemuser")) {
  if (-not (Get-EntityId $dep)) { throw "Tabela $dep nao existe neste ambiente." }
}

$lib = "cr40f_liberacaoanexo"
$relFuncionario = "cr40f_funcionarios_cr40f_liberacaoanexo_funcionario"
$relSolicitante = "systemuser_cr40f_liberacaoanexo_solicitante"
$libId = Ensure-Table $lib "cr40f_LiberacaoAnexo" "Liberação de anexo" "Liberações de anexo" "Liberação de uso único (10 min) para o Claude anexar arquivos no prontuário do funcionário; guarda só o hash do token." 100 "ApplicationRequired" "Nome" "Identificação da liberação (funcionário)"
if (-not $libId) {
  Write-Step "DRY RUN criaria em $lib as colunas cr40f_tokenhash (texto 64), cr40f_expiraem e cr40f_usadaem (data e hora UTC), cr40f_arquivos (inteiro) e os lookups cr40f_funcionario e cr40f_solicitante"
  Write-Step "DRY RUN OK; use -Apply"
  exit 0
}

Ensure-AttributeOn $lib (Text "cr40f_TokenHash" "Hash do token" "SHA-256 (hex, 64) do token; o token puro nunca é gravado" 64)
Ensure-AttributeOn $lib (DateTimeUtc "cr40f_ExpiraEm" "Expira em" "Data e hora (UTC) em que a liberação deixa de valer")
Ensure-AttributeOn $lib (DateTimeUtc "cr40f_UsadaEm" "Usada em" "Data e hora (UTC) em que o flow consumiu a liberação; vazio = ainda não usada")
Ensure-AttributeOn $lib (Int "cr40f_Arquivos" "Arquivos" "Quantidade de arquivos recebidos no consumo")
# Excluir o funcionario apaga as liberacoes dele; o solicitante (systemuser) nao e excluido, so desativado.
Ensure-Lookup $relFuncionario "cr40f_funcionarios" $lib "cr40f_Funcionario" "Funcionário" "Funcionário em cujo prontuário o anexo entra" "Cascade" "ApplicationRequired"
Ensure-Lookup $relSolicitante "systemuser" $lib "cr40f_Solicitante" "Solicitante" "Usuário que pediu o anexo pelo Claude (InitiatingUserId)" "RemoveLink" "ApplicationRequired"

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$lib</entity></entities></importexportxml>" } | Out-Null
  $esperado = @("cr40f_name", "cr40f_tokenhash", "cr40f_expiraem", "cr40f_usadaem", "cr40f_arquivos", "cr40f_funcionario", "cr40f_solicitante")
  $missing = @($esperado | Where-Object { -not (Get-AttributeId $lib $_) })
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $libId and componenttype eq 1").Count -eq 0) { throw "Tabela $lib nao esta na solucao $SolutionUniqueName." }
  $hash = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$lib')/Attributes(LogicalName='cr40f_tokenhash')/Microsoft.Dynamics.CRM.StringAttributeMetadata?`$select=MaxLength"
  if ($hash.MaxLength -ne 64) { throw "$lib.cr40f_tokenhash esta com MaxLength $($hash.MaxLength) (esperado 64)." }
  # Concorrencia otimista: o consumo marca a liberacao com RowVersion (duas chamadas com o mesmo token nao passam).
  $meta = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$lib')?`$select=IsOptimisticConcurrencyEnabled"
  if (-not [bool]$meta.IsOptimisticConcurrencyEnabled) { throw "$lib sem concorrencia otimista (IsOptimisticConcurrencyEnabled)." }
  # O execute privilege da cr40f_ConsumirAnexoProntuario depende deste privilegio.
  if (@(Get-Rows "privileges" "privilegeid" "name eq 'prvWritecr40f_liberacaoanexo'").Count -ne 1) { throw "Privilegio prvWritecr40f_liberacaoanexo nao encontrado." }
  Write-Step "SCHEMA OK: $lib publicada e na solucao $SolutionUniqueName (sem privilegio para os papeis comuns: nao conceda). Proximo: pnpm push:plugin:prontuario:dev."
}
else { Write-Step "DRY RUN OK; use -Apply" }
