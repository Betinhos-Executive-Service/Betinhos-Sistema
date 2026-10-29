param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona o schema do portal de validacao do cliente: tabelas cr40f_validacaoservico (uma por reserva), cr40f_validadorcliente, cr40f_mensagemvalidacao, cr40f_codigoacesso e cr40f_dispositivoconfiavel, e o campo cr40f_portalhabilitado em cr40f_clientes1; inclui na solucao do .env (BetinhosCore pela regra de tipo 1/2/10 em solucoes/regras.json).
# Idempotente: cria so o que falta e semeia os tipos por nome. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Spec: docs/superpowers/specs/2026-10-28-portal-validacao-cliente-design.md. Privilegios do usuario de aplicacao do portal ficam para o plano do Worker.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[portal-cliente] $Message" }
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

# $Default: valor padrao do choice (DefaultFormValue, usado pelo formulario); $null = sem padrao.
function Picklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels, [string] $Required = "None", [object] $Default = $null) {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  $payload = @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = $Required }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
  if ($null -ne $Default) { $payload.DefaultFormValue = [int] $Default }
  return $payload
}
function Text([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function DateOnly([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
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
# O Dataverse ignora MaxLength e RequiredLevel do atributo primario no POST da tabela (nasce com 850 e opcional):
# acerta depois por PUT da metadata completa, como Ensure-LookupRequired. Vale para tabela nova e ja existente.
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
# Coluna primaria cr40f_name: tamanho, obrigatoriedade e rotulo por tabela.
function Ensure-Table([string] $Logical, [string] $Schema, [string] $Display, [string] $Plural, [string] $Description, [int] $NameMax = 850, [string] $NameRequired = "None", [string] $NameDisplay = "Nome", [string] $NameDescription = "Nome exibido") {
  $id = Get-EntityId $Logical
  if (-not $id -and $Apply) {
    Invoke-Dataverse "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema; DisplayName = Label $Display; DisplayCollectionName = Label $Plural
      Description = Label $Description; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = $NameMax; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = $NameRequired }; DisplayName = Label $NameDisplay; Description = Label $NameDescription })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical" }
  if ($id) {
    Ensure-NameAttribute $Logical $NameMax $NameRequired
    Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents
  }
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

function YesNo([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; DefaultValue = $false
     OptionSet = @{ TrueOption = @{ Value = 1; Label = Label "Sim" }; FalseOption = @{ Value = 0; Label = Label "Não" } } }
}
# Moeda (BRL da organizacao), nunca negativa.
function Money([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = 0; MaxValue = 1000000000; Precision = 2; PrecisionSource = 2 }
}

function DateTimeUser([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
}
function Memo([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; Format = "TextArea" }
}

foreach ($e in @("cr40f_reservadeveculos", "cr40f_clientes1", "systemuser")) { if (-not (Get-EntityId $e)) { throw "Tabela $e nao existe neste ambiente." } }

# Campo do cliente: so clientes com portal habilitado podem ter servicos liberados (hoje so a Tenaris).
Ensure-AttributeOn "cr40f_clientes1" (YesNo "cr40f_PortalHabilitado" "Portal habilitado" "Cliente valida os serviços no portal de validação")

$val = "cr40f_validacaoservico"
$relReserva = "cr40f_reservadeveculos_cr40f_validacaoservico_reserva"
$relCliente = "cr40f_clientes1_cr40f_validacaoservico_cliente"
$relLiberadoPor = "cr40f_systemuser_validacaoservico_liberadopor"
$valId = Ensure-Table $val "cr40f_ValidacaoServico" "Validação de serviço" "Validações de serviço" "Serviço liberado para o cliente validar no portal; um registro por reserva, reativado ao liberar de novo." 100 "None" "Código" "Código da reserva liberada"
if (-not $valId) {
  Write-Step "DRY RUN criaria em ${val}: lookups cr40f_reserva (reserva, chave alternativa unica), cr40f_cliente e cr40f_liberadopor; status (Liberado, Em dúvida, Respondido, Aprovado, Aprovado automaticamente, Retirado); liberado em, observacao, valor liberado, valor anterior, prazo da tacita, aprovado em/por e incluir no fechamento (Sim/Nao/Pendente); depois cr40f_validadorcliente, cr40f_mensagemvalidacao, cr40f_codigoacesso e cr40f_dispositivoconfiavel"
  Write-Step "DRY RUN OK; use -Apply"
  exit 0
}

# Status: valores espelham apps/shell/src/pages/geral/domain/portal.ts (STATUS_VALIDACAO).
Ensure-AttributeOn $val (Picklist "cr40f_Status" "Status" "Situação da validação pelo cliente" @("Liberado", "Em dúvida", "Respondido", "Aprovado", "Aprovado automaticamente", "Retirado") "ApplicationRequired" 100000000)
Ensure-AttributeOn $val (DateTimeUser "cr40f_LiberadoEm" "Liberado em" "Última vez que o serviço foi liberado (ou voltou a Liberado)")
Ensure-AttributeOn $val (Memo "cr40f_Observacao" "Observação para o cliente" "Observação da Betinhos exibida no portal" 2000)
Ensure-AttributeOn $val (Money "cr40f_ValorLiberado" "Valor liberado" "Valor total da composição no momento da liberação")
Ensure-AttributeOn $val (Money "cr40f_ValorAnterior" "Valor anterior" "Valor antes da última mudança de preço")
# Somente data: o prazo e um dia util (yyyy-mm-dd) calculado em America/Sao_Paulo.
Ensure-AttributeOn $val (DateOnly "cr40f_PrazoTacita" "Prazo da aprovação automática" "5 dias úteis após liberar ou responder, sem feriados nacionais")
Ensure-AttributeOn $val (DateTimeUser "cr40f_AprovadoEm" "Aprovado em" "Quando o cliente aprovou (ou a aprovação automática venceu)")
Ensure-AttributeOn $val (Text "cr40f_AprovadoPor" "Aprovado por" "E-mail do validador que aprovou; vazio na aprovação automática" 200)
Ensure-AttributeOn $val (Picklist "cr40f_IncluirFechamento" "Incluir no fechamento" "Decisão do financeiro no fechamento mensal" @("Pendente", "Sim", "Não") "None" 100000000)
# Excluir a reserva apaga a validacao; cliente e usuario so limpam o lookup.
Ensure-Lookup $relReserva "cr40f_reservadeveculos" $val "cr40f_Reserva" "Reserva" "Serviço liberado" "Cascade" "ApplicationRequired"
Ensure-Lookup $relCliente "cr40f_clientes1" $val "cr40f_Cliente" "Cliente" "Cliente que valida o serviço" "RemoveLink" "ApplicationRequired"
Ensure-Lookup $relLiberadoPor "systemuser" $val "cr40f_LiberadoPor" "Liberado por" "Usuário que liberou" "RemoveLink"

# Uma validacao por reserva: liberar de novo reativa o registro (upsert pela chave), nunca duplica.
$chave = "cr40f_reservaunica"
$temChave = @(Get-Rows "EntityDefinitions(LogicalName='$val')/Keys" "LogicalName" "LogicalName eq '$chave'").Count -eq 1
if (-not $temChave) {
  if ($Apply -and (Get-AttributeId $val "cr40f_reserva")) {
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$val')/Keys" @{ "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = "cr40f_ReservaUnica"; DisplayName = Label "Reserva única"; KeyAttributes = @("cr40f_reserva") } | Out-Null
    Write-Step "chave alternativa criada $val.$chave"
  }
  else { Write-Step "DRY RUN criaria a chave alternativa $val.$chave (cr40f_reserva)" }
}

# ---------- Validador, mensagem, código de acesso e dispositivo confiável (Worker do portal e tela #/validacao-cliente) ----------
# Nomes e valores espelham apps/portal-cliente/worker/schema.ts e apps/shell/src/pages/validacao-cliente/data/queries.ts.
function WholeNumber([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = 0; MaxValue = 1000; Format = "None" }
}
function Ensure-Key([string] $Entity, [string] $Schema, [string] $Display, [string[]] $Attributes) {
  $logical = $Schema.ToLowerInvariant()
  if (@(Get-Rows "EntityDefinitions(LogicalName='$Entity')/Keys" "LogicalName" "LogicalName eq '$logical'").Count -eq 1) { return }
  if ($Apply -and @($Attributes | Where-Object { -not (Get-AttributeId $Entity $_) }).Count -eq 0) {
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$Entity')/Keys" @{ "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = $Schema; DisplayName = Label $Display; KeyAttributes = $Attributes } | Out-Null
    Write-Step "chave alternativa criada $Entity.$logical"
  }
  else { Write-Step "DRY RUN criaria a chave alternativa $Entity.$logical ($($Attributes -join ', '))" }
}

$vdr = "cr40f_validadorcliente"
$vdrId = Ensure-Table $vdr "cr40f_ValidadorCliente" "Validador do cliente" "Validadores do cliente" "Pessoa do cliente que valida os serviços no portal (e-mail + app autenticador)." 100 "ApplicationRequired" "Nome" "Nome do validador"
if ($vdrId) {
  Ensure-AttributeOn $vdr (Text "cr40f_Email" "E-mail" "E-mail de acesso ao portal (único)" 200)
  Ensure-AttributeOn $vdr (YesNo "cr40f_Ativo" "Ativo" "Desativado não entra no portal")
  Ensure-AttributeOn $vdr (DateTimeUser "cr40f_UltimoAcesso" "Último acesso" "Último login no portal")
  # Cifrado pelo Worker (AES-GCM); o Dataverse nunca guarda o segredo em claro.
  Ensure-AttributeOn $vdr (Text "cr40f_SegredoTotp" "Segredo do autenticador (cifrado)" "Vazio = ler QR code no próximo acesso" 500)
  Ensure-AttributeOn $vdr (DateTimeUser "cr40f_TotpCadastradoEm" "Autenticador cadastrado em" "Quando o validador leu o QR code")
  Ensure-Lookup "cr40f_clientes1_cr40f_validadorcliente_cliente" "cr40f_clientes1" $vdr "cr40f_Cliente" "Cliente" "Cliente do validador" "RemoveLink" "ApplicationRequired"
  Ensure-Key $vdr "cr40f_EmailUnico" "E-mail único" @("cr40f_email")
}

$msg = "cr40f_mensagemvalidacao"
$msgId = Ensure-Table $msg "cr40f_MensagemValidacao" "Mensagem de validação" "Mensagens de validação" "Conversa de uma dúvida do cliente sobre um serviço liberado." 100 "None" "Resumo" "Início do texto"
if ($msgId) {
  Ensure-AttributeOn $msg (Picklist "cr40f_Lado" "Lado" "Quem escreveu" @("Cliente", "Betinhos") "ApplicationRequired")
  Ensure-AttributeOn $msg (Text "cr40f_Autor" "Autor" "Nome de quem escreveu" 200)
  Ensure-AttributeOn $msg (Picklist "cr40f_Motivo" "Motivo" "Só na primeira mensagem da dúvida" @("Espera", "Km/rota", "Valor", "Passageiro", "Outro"))
  Ensure-AttributeOn $msg (Memo "cr40f_Texto" "Texto" "Mensagem" 4000)
  # Excluir a validação apaga a conversa; retirar só muda o status (a conversa fica).
  Ensure-Lookup "cr40f_validacaoservico_cr40f_mensagemvalidacao_validacao" $val $msg "cr40f_Validacao" "Validação" "Serviço da conversa" "Cascade" "ApplicationRequired"
}

$cod = "cr40f_codigoacesso"
$codId = Ensure-Table $cod "cr40f_CodigoAcesso" "Código de acesso" "Códigos de acesso" "Código de 6 dígitos enviado por e-mail no login do portal (só o hash)." 100 "None" "E-mail" "E-mail do pedido"
if ($codId) {
  Ensure-AttributeOn $cod (Text "cr40f_HashCodigo" "Hash do código" "SHA-256 do código" 200)
  Ensure-AttributeOn $cod (DateTimeUser "cr40f_ExpiraEm" "Expira em" "10 minutos depois do pedido")
  Ensure-AttributeOn $cod (WholeNumber "cr40f_Tentativas" "Tentativas" "Erros de digitação")
  Ensure-AttributeOn $cod (YesNo "cr40f_Usado" "Usado" "Código já usado")
  Ensure-Lookup "cr40f_validadorcliente_cr40f_codigoacesso_validador" $vdr $cod "cr40f_Validador" "Validador" "Validador do código" "Cascade" "ApplicationRequired"
}

$dis = "cr40f_dispositivoconfiavel"
$disId = Ensure-Table $dis "cr40f_DispositivoConfiavel" "Dispositivo confiável" "Dispositivos confiáveis" "Computador lembrado por 30 dias no portal (só o hash do token)." 100 "None" "E-mail" "E-mail do validador"
if ($disId) {
  Ensure-AttributeOn $dis (Text "cr40f_HashToken" "Hash do token" "SHA-256 do token do cookie" 200)
  Ensure-AttributeOn $dis (DateTimeUser "cr40f_ExpiraEm" "Expira em" "30 dias depois do login")
  Ensure-Lookup "cr40f_validadorcliente_cr40f_dispositivoconfiavel_validador" $vdr $dis "cr40f_Validador" "Validador" "Dono do dispositivo" "Cascade" "ApplicationRequired"
}

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$val</entity><entity>cr40f_clientes1</entity><entity>$vdr</entity><entity>$msg</entity><entity>$cod</entity><entity>$dis</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $val = @("cr40f_name", "cr40f_status", "cr40f_liberadoem", "cr40f_observacao", "cr40f_valorliberado", "cr40f_valoranterior", "cr40f_prazotacita", "cr40f_aprovadoem", "cr40f_aprovadopor", "cr40f_incluirfechamento", "cr40f_reserva", "cr40f_cliente", "cr40f_liberadopor")
    $vdr = @("cr40f_name", "cr40f_email", "cr40f_ativo", "cr40f_ultimoacesso", "cr40f_segredototp", "cr40f_totpcadastradoem", "cr40f_cliente")
    $msg = @("cr40f_name", "cr40f_lado", "cr40f_autor", "cr40f_motivo", "cr40f_texto", "cr40f_validacao")
    $cod = @("cr40f_name", "cr40f_hashcodigo", "cr40f_expiraem", "cr40f_tentativas", "cr40f_usado", "cr40f_validador")
    $dis = @("cr40f_name", "cr40f_hashtoken", "cr40f_expiraem", "cr40f_validador")
  }
  $missing = @()
  foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if (-not (Get-AttributeId "cr40f_clientes1" "cr40f_portalhabilitado")) { $missing += "cr40f_clientes1.cr40f_portalhabilitado" }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @(@($val, $valId), @($vdr, $vdrId), @($msg, $msgId), @($cod, $codId), @($dis, $disId))) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $($t[1]) and componenttype eq 1").Count -eq 0) { throw "Tabela $($t[0]) nao esta na solucao $SolutionUniqueName." }
  }
  Write-Step "SCHEMA OK: $val, $vdr, $msg, $cod, $dis e cr40f_clientes1.cr40f_portalhabilitado publicados na solucao $SolutionUniqueName. Marque Portal habilitado na Tenaris."
}
else { Write-Step "DRY RUN OK; use -Apply" }
