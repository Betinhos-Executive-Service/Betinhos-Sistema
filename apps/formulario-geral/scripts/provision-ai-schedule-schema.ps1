param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $TenantId = "organizations",
  [string] $ClientId = "",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $DeviceCode,
  [switch] $WhatIf
)

try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
function Step([string]$Message) { Write-Host "[provision-ai-schema] $Message" }
function Escape-OData([string]$Value) { $Value.Replace("'", "''") }
function Label([string]$Text) { @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $Text; LanguageCode = 1046 }) } }
function StatusCode($ErrorRecord) { try { [int]$ErrorRecord.Exception.Response.StatusCode } catch { 0 } }

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$environmentBaseUrl = $EnvironmentUrl.TrimEnd("/")
if ($environmentBaseUrl -notmatch "org23b93544\.crm2\.dynamics\.com$") { throw "Provisionamento bloqueado: somente DEV org23b93544." }

if ($WhatIf) {
  Step "dry-run: validaria solution $SolutionUniqueName"
  Step "dry-run: criaria/atualizaria a tabela cr40f_conversaiaagendamento e seus campos"
  Step "dry-run: adicionaria lookup, ordinal, chave de idempotência e alternate key em cr40f_reservadeveculos"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ClientId)) { $ClientId = if ($env:DV_CLIENT_ID) { $env:DV_CLIENT_ID } else { "51f81489-12ee-4a9e-aaae-a2591f45987d" } }
$clientGuid = [Guid]::Empty
if (-not [Guid]::TryParse($ClientId, [ref]$clientGuid)) { throw "ClientId inválido: '$ClientId'." }
if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Módulo MSAL.PS não encontrado. Instale com Install-Module MSAL.PS -Scope CurrentUser." }
Import-Module MSAL.PS -ErrorAction Stop
$scope = "$environmentBaseUrl/user_impersonation"
$client = New-MsalClientApplication -ClientId $clientGuid.ToString() -TenantId $TenantId -RedirectUri ([Uri]"http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
try { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent }
catch { if ($DeviceCode) { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode } else { $tokenResult = Get-MsalToken -PublicClientApplication $client -Scopes $scope -Interactive } }
if ([string]::IsNullOrWhiteSpace($tokenResult.AccessToken)) { throw "Falha ao obter token MSAL para $scope" }
$headers = @{ Authorization = "Bearer $($tokenResult.AccessToken)"; Accept = "application/json"; "Content-Type" = "application/json; charset=utf-8"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
function Request([string]$Uri, [string]$Method = "Get", $Body = $null) {
  $params = @{ Uri = $Uri; Method = $Method; Headers = $headers; ErrorAction = "Stop" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 30 -Compress) }
  return Invoke-RestMethod @params
}
function Get-Entity([string]$LogicalName) {
  try { return Request "$apiBaseUrl/EntityDefinitions(LogicalName='$(Escape-OData $LogicalName)')?`$select=MetadataId,LogicalName,EntitySetName,PrimaryNameAttribute" }
  catch { if ((StatusCode $_) -eq 404) { return $null }; throw }
}
function Get-Attribute([string]$Entity, [string]$LogicalName) {
  try { return Request "$apiBaseUrl/EntityDefinitions(LogicalName='$(Escape-OData $Entity)')/Attributes(LogicalName='$(Escape-OData $LogicalName)')?`$select=LogicalName" }
  catch { if ((StatusCode $_) -eq 404) { return $null }; throw }
}
function MetadataPost([string]$Uri, $Body, [string]$LabelText) {
  if ($WhatIf) { Step "dry-run: criaria $LabelText"; return }
  Request $Uri "Post" $Body | Out-Null
}
function Ensure-Entity([string]$LogicalName, [string]$SchemaName, [string]$PrimaryName, [string]$DisplayName, [string]$CollectionName) {
  $entity = Get-Entity $LogicalName
  if (-not $entity) {
    $body = @{ "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; DisplayCollectionName = Label $CollectionName; Description = Label "Sessão de agendamento conversacional por IA."; OwnershipType = "OrganizationOwned"; IsActivity = $false; HasActivities = $false; HasNotes = $false; PrimaryNameAttribute = $PrimaryName; Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $PrimaryName; DisplayName = Label "Nome"; RequiredLevel = @{ Value = "ApplicationRequired" }; MaxLength = 100; IsPrimaryName = $true }) }
    MetadataPost "$apiBaseUrl/EntityDefinitions" $body $LogicalName
    $entity = Get-Entity $LogicalName
  }
  if (-not $entity) { throw "A tabela $LogicalName não ficou disponível." }
  if ($entity.PrimaryNameAttribute -ne $PrimaryName.ToLowerInvariant()) { throw "A tabela $LogicalName usa primary name '$($entity.PrimaryNameAttribute)', esperado '$PrimaryName'." }
  return $entity
}
function Ensure-String([string]$Entity, [string]$SchemaName, [string]$DisplayName, [int]$MaxLength = 500) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; MaxLength = $MaxLength } "$Entity.$logical"
}
function Ensure-Memo([string]$Entity, [string]$SchemaName, [string]$DisplayName) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; MaxLength = 1048576 } "$Entity.$logical"
}
function Ensure-Integer([string]$Entity, [string]$SchemaName, [string]$DisplayName) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; MinValue = -2147483648; MaxValue = 2147483647; Format = "None" } "$Entity.$logical"
}
function Ensure-Boolean([string]$Entity, [string]$SchemaName, [string]$DisplayName) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; OptionSet = @{ TrueOption = @{ Value = 1; Label = Label "Sim" }; FalseOption = @{ Value = 0; Label = Label "Não" } } } "$Entity.$logical"
}
function Ensure-DateTime([string]$Entity, [string]$SchemaName, [string]$DisplayName) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } } "$Entity.$logical"
}
function Ensure-Choice([string]$Entity, [string]$SchemaName, [string]$DisplayName, $Options) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $Entity $logical) { return }
  $optionValues = @($Options | ForEach-Object { @{ Value = $_.Value; Label = Label $_.Label } })
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" }; OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; Options = $optionValues } } "$Entity.$logical"
}
function Ensure-Lookup([string]$ReferencingEntity, [string]$SchemaName, [string]$ReferencedEntity, [string]$DisplayName) {
  $logical = $SchemaName.ToLowerInvariant(); if (Get-Attribute $ReferencingEntity $logical) { return }
  $body = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $SchemaName; ReferencedEntity = $ReferencedEntity; ReferencingEntity = $ReferencingEntity; Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $SchemaName; DisplayName = Label $DisplayName; RequiredLevel = @{ Value = "None" } }; CascadeConfiguration = @{ Delete = "RemoveLink"; Assign = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade"; Merge = "NoCascade"; Reparent = "NoCascade" } }
  MetadataPost "$apiBaseUrl/RelationshipDefinitions" $body "$ReferencingEntity.$logical -> $ReferencedEntity"
}
function Ensure-Key([string]$Entity, [string]$SchemaName, [string]$DisplayName, [string[]]$Attributes) {
  $keys = Request "$apiBaseUrl/EntityDefinitions(LogicalName='$(Escape-OData $Entity)')/Keys?`$select=SchemaName,KeyAttributes"
  $match = @($keys.value | Where-Object { @($_.KeyAttributes) -join '|' -eq ($Attributes -join '|') })
  if ($match.Count -gt 0 -or $WhatIf) { if ($WhatIf) { Step "dry-run: criaria chave $SchemaName" }; return }
  MetadataPost "$apiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Keys" @{ SchemaName = $SchemaName; DisplayName = Label $DisplayName; KeyAttributes = $Attributes } "$Entity.$SchemaName"
}

Step "validando solution $SolutionUniqueName"
$solution = Request "$apiBaseUrl/solutions?`$select=solutionid,uniquename&`$filter=uniquename eq '$(Escape-OData $SolutionUniqueName)'"
if (-not $solution.value -or $solution.value.Count -ne 1) { throw "Solution $SolutionUniqueName não encontrada de forma única." }

$session = Ensure-Entity "cr40f_conversaiaagendamento" "cr40f_ConversaIAAgendamento" "cr40f_name" "Conversa IA de agendamento" "Conversas IA de agendamento"
$sessionFields = @(
  @{ t = "choice"; n = "cr40f_Status"; d = "Status"; o = @(@{Value=100000000;Label="Rascunho"},@{Value=100000001;Label="Interpretando"},@{Value=100000002;Label="Aguardando dados"},@{Value=100000003;Label="Pronto"},@{Value=100000004;Label="Agendando"},@{Value=100000005;Label="Parcial"},@{Value=100000006;Label="Agendado"},@{Value=100000007;Label="Erro"},@{Value=100000008;Label="Cancelado"}) },
  @{ t = "int"; n = "cr40f_VersaoEntrada"; d = "Versão de entrada" }, @{ t = "int"; n = "cr40f_VersaoProcessada"; d = "Versão processada" }, @{ t = "int"; n = "cr40f_VersaoConfirmada"; d = "Versão confirmada" }, @{ t = "bool"; n = "cr40f_ConfirmacaoSolicitada"; d = "Confirmação solicitada" },
  @{ t = "memo"; n = "cr40f_TextoOriginal"; d = "Texto original" }, @{ t = "memo"; n = "cr40f_MensagensJson"; d = "Mensagens JSON" }, @{ t = "memo"; n = "cr40f_PropostaJson"; d = "Proposta JSON" }, @{ t = "memo"; n = "cr40f_CamposFaltantes"; d = "Campos faltantes" }, @{ t = "memo"; n = "cr40f_Alertas"; d = "Alertas" }, @{ t = "string"; n = "cr40f_Modelo"; d = "Modelo" }, @{ t = "int"; n = "cr40f_Tentativas"; d = "Tentativas" }, @{ t = "int"; n = "cr40f_InputTokens"; d = "Tokens de entrada" }, @{ t = "int"; n = "cr40f_OutputTokens"; d = "Tokens de saída" }, @{ t = "memo"; n = "cr40f_Erro"; d = "Erro" }, @{ t = "memo"; n = "cr40f_ReservasCriadas"; d = "Reservas criadas" }, @{ t = "datetime"; n = "cr40f_ExpiraEm"; d = "Expira em" }
)
foreach ($field in $sessionFields) { switch ($field.t) { "choice" { Ensure-Choice $session.LogicalName $field.n $field.d $field.o }; "int" { Ensure-Integer $session.LogicalName $field.n $field.d }; "bool" { Ensure-Boolean $session.LogicalName $field.n $field.d }; "memo" { Ensure-Memo $session.LogicalName $field.n $field.d }; "string" { Ensure-String $session.LogicalName $field.n $field.d 200 }; "datetime" { Ensure-DateTime $session.LogicalName $field.n $field.d } } }

$reservation = Get-Entity "cr40f_reservadeveculos"
if (-not $reservation) { throw "Tabela cr40f_reservadeveculos não encontrada." }
Ensure-Lookup "cr40f_reservadeveculos" "cr40f_ConversaoIAAgendamento" "cr40f_conversaiaagendamento" "Conversa IA de agendamento"
Ensure-Integer "cr40f_reservadeveculos" "cr40f_IAOrdinalServico" "Ordinal do serviço IA"
Ensure-String "cr40f_reservadeveculos" "cr40f_IAChaveIdempotencia" "Chave de idempotência IA" 180
Ensure-Key "cr40f_reservadeveculos" "cr40f_AK_ConversaIA_Ordinal" "Conversa IA + ordinal" @("cr40f_conversaoiaagendamento", "cr40f_iaordinalservico")

if (-not $WhatIf) { Request "$apiBaseUrl/PublishXml" "Post" @{ ParameterXml = "<importexportxml><entities><entity>cr40f_conversaiaagendamento</entity><entity>cr40f_reservadeveculos</entity></entities></importexportxml>" } | Out-Null }
Step "schema da agenda IA pronto"
