param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona o schema da manutencao preventiva no Dataverse DEV: colunas de hodometro em cr40f_veiculos e as tabelas cr40f_itemplanopreventivo e cr40f_baselinepreventiva, incluidas na solucao do .env.
# Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[frota-preventiva] $Message" }
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

function Picklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels, [string] $Required = "None") {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = $Required }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
}
function MultiPicklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels) {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = "None" }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
}
function Text([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function DateOnly([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
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
      Description = Label $Description; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = 850; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = "None" }; DisplayName = Label "Nome"; Description = Label "Nome exibido" })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical" }
  if ($id) { Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents }
  return $id
}
$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
# Deixa o RequiredLevel de um lookup existente igual ao esperado (PUT da metadata completa, como a Web API exige).
function Ensure-LookupRequired([string] $Entity, [string] $Logical, [string] $Required) {
  $path = "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='$Logical')/Microsoft.Dynamics.CRM.LookupAttributeMetadata"
  $attr = Invoke-Dataverse "GET" $path
  if ($attr.RequiredLevel.Value -eq $Required) { return }
  if (-not $Apply) { Write-Step "DRY RUN mudaria $Entity.$Logical para RequiredLevel $Required"; return }
  foreach ($name in @($attr.PSObject.Properties | Where-Object { $_.Name -like "@odata.*" } | ForEach-Object { $_.Name })) { $attr.PSObject.Properties.Remove($name) }
  $attr | Add-Member -NotePropertyName "@odata.type" -NotePropertyValue "Microsoft.Dynamics.CRM.LookupAttributeMetadata" -Force
  $attr.RequiredLevel.Value = $Required
  Invoke-Dataverse "PUT" "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='$Logical')" $attr -ExtraHeaders @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "RequiredLevel $Required em $Entity.$Logical"
}
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
    Ensure-LookupRequired $Referencing $Schema.ToLowerInvariant() $Required
    Add-SolutionComponent $rows[0].MetadataId 10 "relacionamento $Relationship"
    Add-SolutionComponent (Get-AttributeId $Referencing $Schema.ToLowerInvariant()) 2 "$Referencing.$($Schema.ToLowerInvariant())"
  }
}

# Opcoes do Picklist de servico: geradas do catalogo versionado (mesmos valores e rotulos usados pela tela de Frota).
function PicklistComValores([string] $Schema, [string] $Display, [string] $Description, [object[]] $Options) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = "None" }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $Options } }
}

$catalogo = Get-Content -LiteralPath (Join-Path $root "apps\shell\src\pages\frota\domain\manutencaoCatalogo.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$opcoesServico = @($catalogo.servicos | ForEach-Object { @{ Value = [int]$_.value; Label = Label $_.label } })
if ($opcoesServico.Count -eq 0) { throw "Catalogo de servicos vazio." }
Write-Step "servicos do catalogo: $($opcoesServico.Count)"

if (-not (Get-EntityId "cr40f_veiculos")) { throw "Tabela cr40f_veiculos nao existe neste ambiente." }

$veic = "cr40f_veiculos"; $item = "cr40f_itemplanopreventivo"; $base = "cr40f_baselinepreventiva"

# Tabelas primeiro (as colunas e lookups dependem delas existirem).
$itemId = Ensure-Table $item "cr40f_ItemPlanoPreventivo" "Item do plano preventivo" "Itens do plano preventivo" "Regra de manutenção preventiva da frota (intervalo em km e/ou meses)"
$baseId = Ensure-Table $base "cr40f_BaselinePreventiva" "Baseline de preventiva" "Baselines de preventiva" "Última execução conhecida de um item quando não há manutenção registrada"
if (-not $Apply -and (-not $itemId -or -not $baseId)) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

# Colunas de hodometro no veiculo
Ensure-AttributeOn $veic @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Hodometro"; DisplayName = Label "Hodômetro (km)"; Description = Label "Última leitura do odômetro na Infleet"; MinValue = 0; MaxValue = 9999999; Format = "None" }
Ensure-AttributeOn $veic @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_HodometroEm"; DisplayName = Label "Hodômetro lido em"; Description = Label "Instante da leitura do odômetro"; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }

# Item do plano preventivo
Ensure-AttributeOn $item (PicklistComValores "cr40f_Servico" "Serviço" "Serviço do catálogo de manutenção que executa este item" $opcoesServico)
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_IntervaloKm"; DisplayName = Label "Intervalo (km)"; Description = Label "Repetir a cada X km"; MinValue = 1; MaxValue = 500000; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_IntervaloMeses"; DisplayName = Label "Intervalo (meses)"; Description = Label "Repetir a cada X meses"; MinValue = 1; MaxValue = 120; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_AvisoKm"; DisplayName = Label "Avisar faltando (km)"; Description = Label "A vencer quando faltar até X km"; MinValue = 0; MaxValue = 100000; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_AvisoDias"; DisplayName = Label "Avisar faltando (dias)"; Description = Label "A vencer quando faltar até X dias"; MinValue = 0; MaxValue = 365; Format = "None" }

# Baseline de preventiva
Ensure-Lookup "cr40f_veiculos_cr40f_baselinepreventiva_veiculo" $veic $base "cr40f_Veiculo" "Veículo" "Veículo da baseline" "Restrict" "ApplicationRequired"
Ensure-Lookup "cr40f_itemplanopreventivo_cr40f_baselinepreventiva_item" $item $base "cr40f_Item" "Item do plano" "Item do plano preventivo" "Restrict" "ApplicationRequired"
Ensure-AttributeOn $base @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Km"; DisplayName = Label "Km da última execução"; Description = Label "Odômetro na última execução conhecida"; MinValue = 0; MaxValue = 9999999; Format = "None" }
Ensure-AttributeOn $base (DateOnly "cr40f_Data" "Data da última execução" "Data da última execução conhecida")

if ($Apply) {
  foreach ($t in @($item, $base)) { Add-SolutionComponent (Get-EntityId $t) 1 $t -IncludeSubcomponents }
  foreach ($a in @("cr40f_hodometro", "cr40f_hodometroem")) { Add-SolutionComponent (Get-AttributeId $veic $a) 2 "$veic.$a" }
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$veic</entity><entity>$item</entity><entity>$base</entity></entities></importexportxml>" } | Out-Null
  Write-Step "Concluido. Confira no DEV: $item, $base e as colunas de hodometro em $veic."
}
else { Write-Step "DRY RUN OK; use -Apply" }
