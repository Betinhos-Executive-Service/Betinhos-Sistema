param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply
)

# Somente DEV: o PROD recebe a tabela pelas solucoes (BetinhosCore).
if (([Uri]$EnvironmentUrl).Host -ne "org23b93544.crm2.dynamics.com") { throw "Somente DEV." }

# Tabela new_avisomotorista: o outbox do aviso de troca de motorista. O DriverNoticePlugin grava aqui na transacao
# da reserva; os flows "Flow Aviso Motorista | Enviar" e "| Vigia" so entregam e vigiam. Ninguem le a audit.
# Aditivo e idempotente. Dry-run por padrao. Schema: roda a mao, do checkout principal na develop (requer az login).
# Nao mexe em papeis: o plugin grava com o servico de sistema e os flows usam a conexao de servico.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$table = "new_avisomotorista"
$keySchema = "new_ChaveAvisoIdempotencia"
$reservaRelationship = "new_cr40f_reservadeveculos_new_avisomotorista_Reserva"
$funcionarioRelationship = "new_cr40f_funcionarios_new_avisomotorista_Funcionario"

function Label([string] $Text) { return @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1046 }) } }
function RequiredLevel([bool] $Required) { return @{ Value = $(if ($Required) { "ApplicationRequired" } else { "None" }) } }
function Option([int] $Value, [string] $Text) { return @{ Value = $Value; Label = (Label $Text) } }
function Write-Step([string] $Message) { Write-Host "[aviso-motorista] $Message" }

$baseUrl = $EnvironmentUrl.TrimEnd("/")
$token = & az account get-access-token --resource "$baseUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token do Dataverse DEV indisponivel (rode az login)." }
$apiBase = "$baseUrl/api/data/v9.2"

function Invoke-Dv([string] $Method, [string] $Path, $Body = $null) {
  $headers = @{
    Authorization = "Bearer $token"
    Accept = "application/json"
    "OData-MaxVersion" = "4.0"
    "OData-Version" = "4.0"
    "MSCRM.SolutionUniqueName" = $SolutionUniqueName
    Prefer = "return=representation"
  }
  $params = @{ Method = $Method; Uri = "$apiBase/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 50 -Compress))
  }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}

function Get-Rows([string] $Set, [string] $Select, [string] $Filter = "") {
  $path = "${Set}?`$select=$Select"
  if ($Filter) { $path += "&`$filter=$([uri]::EscapeDataString($Filter))" }
  return @((Invoke-Dv "GET" $path).value)
}

$solutionId = (Get-Rows "solutions" "solutionid" "uniquename eq '$SolutionUniqueName'")[0].solutionid

function Add-SolutionComponent([guid] $Id, [int] $Type, [string] $Name) {
  $existing = @(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $Id and componenttype eq $Type")
  if ($existing.Count -eq 0) {
    Invoke-Dv "POST" "AddSolutionComponent" @{ ComponentId = $Id; ComponentType = $Type; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
    Write-Step "adicionado a solucao: $Name"
  }
}

function Get-Table { return @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName,EntitySetName,OwnershipType" "LogicalName eq '$table'") }

$tableExists = @(Get-Table).Count -eq 1

function Ensure-Table {
  $found = @(Get-Table)
  if ($found.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria tabela $table"; return }
    Invoke-Dv "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
      SchemaName = "new_avisomotorista"
      DisplayName = (Label "Aviso ao motorista")
      DisplayCollectionName = (Label "Avisos ao motorista")
      Description = (Label "Outbox dos avisos de servi$([char]0xE7)o novo ou retirado do motorista, gravado pelo plugin na mesma transa$([char]0xE7)$([char]0xE3)o da reserva.")
      OwnershipType = "UserOwned"
      IsActivity = $false
      HasActivities = $false
      HasNotes = $false
      Attributes = @(@{
        "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        SchemaName = "new_Name"
        AttributeType = "String"
        AttributeTypeName = @{ Value = "StringType" }
        RequiredLevel = (RequiredLevel $true)
        MaxLength = 150
        FormatName = @{ Value = "Text" }
        DisplayName = (Label "Nome")
        IsPrimaryName = $true
      })
    } | Out-Null
    $found = @(Get-Table)
  }
  if ($found.Count -ne 1 -or [string]$found[0].OwnershipType -ne "UserOwned") { throw "Metadata da tabela $table inesperada." }
  if ($Apply) { Add-SolutionComponent ([guid]$found[0].MetadataId) 1 $table }
  Write-Step "tabela pronta: $table / $($found[0].EntitySetName)"
}

function Ensure-Column([string] $SchemaName, [string] $DisplayName, [string] $Type, [int] $MaxLength = 0, $Options = @()) {
  $logical = $SchemaName.ToLowerInvariant()
  $found = @(if ($tableExists -or $Apply) { Get-Rows "EntityDefinitions(LogicalName='$table')/Attributes" "MetadataId,LogicalName" "LogicalName eq '$logical'" })
  if ($found.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria coluna $logical ($Type)"; return }
    $body = @{ SchemaName = $SchemaName; DisplayName = (Label $DisplayName); RequiredLevel = (RequiredLevel $false) }
    switch ($Type) {
      "string" { $body["@odata.type"] = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; $body.MaxLength = $MaxLength; $body.FormatName = @{ Value = "Text" } }
      "memo" { $body["@odata.type"] = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; $body.MaxLength = $MaxLength; $body.FormatName = @{ Value = "TextArea" } }
      "datetime" { $body["@odata.type"] = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; $body.Format = "DateAndTime"; $body.DateTimeBehavior = @{ Value = "UserLocal" } }
      "integer" { $body["@odata.type"] = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; $body.MinValue = 0; $body.MaxValue = 1000; $body.Format = "None" }
      "choice" { $body["@odata.type"] = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; $body.OptionSet = @{ IsGlobal = $false; OptionSetType = "Picklist"; Options = @($Options) } }
      default { throw "Tipo desconhecido: $Type" }
    }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $body | Out-Null
    $found = @(Get-Rows "EntityDefinitions(LogicalName='$table')/Attributes" "MetadataId,LogicalName" "LogicalName eq '$logical'")
  }
  if ($found.Count -ne 1) { throw "Coluna $logical nao ficou unica." }
  if ($Apply) { Add-SolutionComponent ([guid]$found[0].MetadataId) 2 "$table.$logical" }
}

# Excluir reserva ou funcionario nao pode travar por causa de um aviso antigo: o vinculo so e removido.
function Ensure-Relationship([string] $SchemaName, [string] $Referenced, [string] $LookupSchema, [string] $LookupLabel) {
  $found = @(Get-Rows "RelationshipDefinitions" "MetadataId,SchemaName" "SchemaName eq '$SchemaName'")
  if ($found.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria relacionamento $SchemaName"; return }
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
      SchemaName = $SchemaName
      ReferencedEntity = $Referenced
      ReferencingEntity = $table
      Lookup = @{
        "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
        SchemaName = $LookupSchema
        DisplayName = (Label $LookupLabel)
        RequiredLevel = (RequiredLevel $false)
      }
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    } | Out-Null
    $found = @(Get-Rows "RelationshipDefinitions" "MetadataId,SchemaName" "SchemaName eq '$SchemaName'")
  }
  if ($found.Count -ne 1) { throw "Relacionamento $SchemaName nao ficou unico." }
  if ($Apply) { Add-SolutionComponent ([guid]$found[0].MetadataId) 10 $SchemaName }
}

function Ensure-Key {
  $found = @(if ($tableExists -or $Apply) { @((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq $keySchema } })
  if ($found.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria chave $keySchema"; return }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Keys" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"
      SchemaName = $keySchema
      DisplayName = (Label "Chave de idempot$([char]0xEA)ncia")
      KeyAttributes = @("new_chaveidempotencia")
    } | Out-Null
    $found = @(@((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq $keySchema })
  }
  if ($found.Count -ne 1) { throw "Chave $keySchema nao ficou unica." }
  if ($Apply) { Add-SolutionComponent ([guid]$found[0].MetadataId) 14 $keySchema }
  Write-Step "chave $keySchema status=$($found[0].EntityKeyIndexStatus)"
}

Ensure-Table
Ensure-Column "new_ChaveIdempotencia" "Chave de idempot$([char]0xEA)ncia" "string" 150
Ensure-Column "new_Tipo" "Tipo" "choice" 0 @((Option 100000000 "Novo"), (Option 100000001 "Retirado"))
Ensure-Column "new_Situacao" "Situa$([char]0xE7)$([char]0xE3)o" "choice" 0 @(
  (Option 100000000 "Pendente"), (Option 100000001 "Enviado"), (Option 100000002 "Falhou"),
  (Option 100000003 "Sem app"), (Option 100000004 "Visto"), (Option 100000005 "Cancelado"))
Ensure-Column "new_PrazoVisualizacao" "Prazo de visualiza$([char]0xE7)$([char]0xE3)o" "datetime"
Ensure-Column "new_EnviadoEm" "Enviado em" "datetime"
Ensure-Column "new_VistoEm" "Visto em" "datetime"
Ensure-Column "new_AlertadoEm" "Alertado em" "datetime"
Ensure-Column "new_ReenviadoEm" "Reenviado em" "datetime"
Ensure-Column "new_Tentativas" "Tentativas" "integer"
Ensure-Column "new_Erro" "Erro" "memo" 2000
Ensure-Relationship $reservaRelationship "cr40f_reservadeveculos" "new_Reserva" "Reserva"
Ensure-Relationship $funcionarioRelationship "cr40f_funcionarios" "new_Funcionario" "Funcion$([char]0xE1)rio"
Ensure-Key

if (-not $Apply) { Write-Step "dry-run: nada gravado. Use -Apply para aplicar."; return }

Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$table</entity></entities></importexportxml>" } | Out-Null

$reserva = @(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "ReferencingEntityNavigationPropertyName,SchemaName" "SchemaName eq '$reservaRelationship'")
if ($reserva.Count -ne 1 -or [string]$reserva[0].ReferencingEntityNavigationPropertyName -ne "new_Reserva") { throw "Navegacao new_Reserva inesperada: $($reserva | ConvertTo-Json -Compress)" }
Write-Step "OK: $table publicada e na solucao $SolutionUniqueName."
