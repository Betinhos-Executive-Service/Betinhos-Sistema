param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona a tabela cr40f_linkcadastro (link publico de cadastro do passageiro) no Dataverse DEV e inclui na solucao do .env.
# Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# A Custom API new_GerarLinkCadastro NAO e criada aqui: o registrar do push do plugin (Cr40f.Cadastro) cria a API e amarra ao plugin,
# como no push-acesso-plugin.ps1. Rode este script antes do push do plugin.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[link-cadastro] $Message" }
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

# Choice local com valores explicitos (1..N): o plugin e o flow comparam cr40f_status com 1 Ativo, 2 Usado parcialmente, 3 Expirado, 4 Revogado.
function Picklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels, [string] $Required = "None", [object] $Default = $null) {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = $i + 1; Label = Label $Labels[$i] } }
  $payload = @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = $Required }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
  if ($null -ne $Default) { $payload.DefaultFormValue = [int] $Default }
  return $payload
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
# Propriedade organizacional: o link nao pertence a um usuario; acesso so pelo plugin (sistema) e pelo flow.
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
# Chave alternativa em cr40f_tokenhash: impede hash duplicado e indexa a busca do flow (filtro por hash).
function Ensure-Key([string] $Entity, [string] $Schema, [string] $Display, [string[]] $Attributes) {
  $keys = @(Get-Rows "EntityDefinitions(LogicalName='$Entity')/Keys" "MetadataId,EntityKeyIndexStatus" "SchemaName eq '$Schema'")
  if ($keys.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria a chave alternativa $Schema ($($Attributes -join ','))"; return }
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$Entity')/Keys" @{ SchemaName = $Schema; DisplayName = Label $Display; KeyAttributes = $Attributes } | Out-Null
    Write-Step "chave alternativa criada $Schema (o indice e montado em segundo plano)"
    $keys = @(Get-Rows "EntityDefinitions(LogicalName='$Entity')/Keys" "MetadataId,EntityKeyIndexStatus" "SchemaName eq '$Schema'")
  }
  if ($keys.Count -eq 1) {
    if ($keys[0].EntityKeyIndexStatus -eq "Failed") { throw "Chave $Schema com indice em falha; reative no maker portal." }
    Add-SolutionComponent $keys[0].MetadataId 14 "chave $Schema"
  }
}

foreach ($dep in @("cr40f_reservadeveculos", "cr40f_bancodedados")) {
  if (-not (Get-EntityId $dep)) { throw "Tabela $dep nao existe neste ambiente." }
}

$link = "cr40f_linkcadastro"
$relReserva = "cr40f_reservadeveculos_cr40f_linkcadastro_reserva"
$relPassageiro = "cr40f_bancodedados_cr40f_linkcadastro_passageiro"
$linkId = Ensure-Table $link "cr40f_LinkCadastro" "Link de cadastro" "Links de cadastro" "Link público para o passageiro enviar foto, telefone e e-mail; guarda só o hash do token." 100 "ApplicationRequired" "Nome" "Identificação do link (serviço e data)"
if (-not $linkId) {
  Write-Step "DRY RUN criaria em $link as colunas cr40f_tokenhash (texto 64, chave alternativa), cr40f_expiraem e cr40f_ultimouso (data e hora UTC), cr40f_status (1 Ativo, 2 Usado parcialmente, 3 Expirado, 4 Revogado), cr40f_envios (inteiro) e os lookups cr40f_reserva e cr40f_passageiro"
  Write-Step "DRY RUN OK; use -Apply"
  exit 0
}

$statusAtivo = 1
Ensure-AttributeOn $link (Text "cr40f_TokenHash" "Hash do token" "SHA-256 (hex, 64) do token do link; o token puro nunca é gravado" 64)
Ensure-AttributeOn $link (DateTimeUtc "cr40f_ExpiraEm" "Expira em" "Data e hora (UTC) em que o link deixa de valer")
Ensure-AttributeOn $link (Picklist "cr40f_Status" "Status" "Situação do link" @("Ativo", "Usado parcialmente", "Expirado", "Revogado") "ApplicationRequired" $statusAtivo)
Ensure-AttributeOn $link (Int "cr40f_Envios" "Envios" "Quantidade de envios recebidos pelo link")
Ensure-AttributeOn $link (DateTimeUtc "cr40f_UltimoUso" "Último uso" "Data e hora (UTC) do último envio")
# Excluir o servico apaga os links dele (o link nao existe sem a reserva); excluir o passageiro so limpa o lookup.
Ensure-Lookup $relReserva "cr40f_reservadeveculos" $link "cr40f_Reserva" "Serviço" "Serviço (reserva) do link" "Cascade" "ApplicationRequired"
Ensure-Lookup $relPassageiro "cr40f_bancodedados" $link "cr40f_Passageiro" "Passageiro" "Passageiro do link; vazio = todos os passageiros do serviço" "RemoveLink"
Ensure-Key $link "cr40f_linkcadastro_tokenhash" "Hash do token" @("cr40f_tokenhash")

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$link</entity></entities></importexportxml>" } | Out-Null
  $esperado = @("cr40f_name", "cr40f_tokenhash", "cr40f_expiraem", "cr40f_status", "cr40f_envios", "cr40f_ultimouso", "cr40f_reserva", "cr40f_passageiro")
  $missing = @($esperado | Where-Object { -not (Get-AttributeId $link $_) })
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $linkId and componenttype eq 1").Count -eq 0) { throw "Tabela $link nao esta na solucao $SolutionUniqueName." }
  $hash = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$link')/Attributes(LogicalName='cr40f_tokenhash')/Microsoft.Dynamics.CRM.StringAttributeMetadata?`$select=MaxLength"
  if ($hash.MaxLength -ne 64) { throw "$link.cr40f_tokenhash esta com MaxLength $($hash.MaxLength) (esperado 64)." }
  $opcoes = @((Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$link')/Attributes(LogicalName='cr40f_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)").OptionSet.Options | ForEach-Object { [int] $_.Value })
  if (($opcoes -join ",") -ne "1,2,3,4") { throw "$link.cr40f_status com valores $($opcoes -join ',') (esperado 1,2,3,4)." }
  Write-Step "SCHEMA OK: $link publicada e na solucao $SolutionUniqueName. Proximo: push do plugin Cr40f.Cadastro (cria a Custom API new_GerarLinkCadastro)."
}
else { Write-Step "DRY RUN OK; use -Apply" }
