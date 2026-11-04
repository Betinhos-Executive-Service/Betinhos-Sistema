param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona a conciliacao do cartao corporativo (Banco MCP / Open Finance) no Dataverse DEV e inclui na solucao do .env:
#   cr40f_cartaocorporativo: final do cartao + conta da API -> motorista, com vigencia (um cartao por motorista).
#   cr40f_transacaocartao: cada lancamento lido da API (id externo unico), tipo, situacao da conciliacao e a despesa ligada.
#   cr40f_despesaoperacional.cr40f_conciliadacartao: Sim quando a despesa ja foi casada com uma transacao do cartao.
# Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz (ou variaveis de ambiente).
# Windows: powershell.exe (5.1). Linux/macOS: packages/deploy/rodar-linux.sh provision-conciliacao-cartao.ps1 [-Apply] (pwsh 7 + DV_ACCESS_TOKEN).
# Privilegios: rodar conceder-privilegios-conciliacao-cartao.ps1 depois deste, com -Apply.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[conciliacao-cartao] $Message" }
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
if ([string]::IsNullOrWhiteSpace((Get-Setting "DV_ACCESS_TOKEN")) -and -not [Guid]::TryParse($clientId, [ref] $clientGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env (ou informe DV_ACCESS_TOKEN)." }

function Get-AccessToken {
  $pronto = Get-Setting "DV_ACCESS_TOKEN"
  if (-not [string]::IsNullOrWhiteSpace($pronto)) { return $pronto }
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
# Moeda (BRL da organizacao); $Min negativo aceita estorno.
function Money([string] $Schema, [string] $Display, [string] $Description, [double] $Min = 0) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = $Min; MaxValue = 1000000000; Precision = 2; PrecisionSource = 2 }
}

function Int([string] $Schema, [string] $Display, [string] $Description, [int] $Max = 1000000) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "None"; MinValue = 0; MaxValue = $Max }
}
function DateTimeUtc([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
}
# Chave alternativa: impede transacao duplicada (o flow pode rodar duas vezes no mesmo dia) e indexa a busca por id externo.
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

$func = "cr40f_funcionarios"; $despesa = "cr40f_despesaoperacional"
foreach ($dep in @($func, $despesa)) { if (-not (Get-EntityId $dep)) { throw "Tabela $dep nao existe neste ambiente." } }

$cartao = "cr40f_cartaocorporativo"; $trans = "cr40f_transacaocartao"
$relCartaoMotorista = "cr40f_funcionarios_cr40f_cartaocorporativo_motorista"
$relTransCartao = "cr40f_cartaocorporativo_cr40f_transacaocartao_cartao"
$relTransDespesa = "cr40f_despesaoperacional_cr40f_transacaocartao_despesa"
$relTransMotorista = "cr40f_funcionarios_cr40f_transacaocartao_motorista"

$cartaoId = Ensure-Table $cartao "cr40f_CartaoCorporativo" "Cartão corporativo" "Cartões corporativos" "Cartão de crédito da empresa e o motorista que o usa no período." 200 "ApplicationRequired" "Nome" "Ex.: Itaú final 1234 · Nome do motorista"
$transId = Ensure-Table $trans "cr40f_TransacaoCartao" "Transação do cartão" "Transações do cartão" "Lançamento do cartão lido do Open Finance (Banco MCP) e a conciliação com a despesa do motorista." 200 "ApplicationRequired" "Descrição" "Descrição do lançamento como veio do banco"

# Despesa: Sim quando ja esta ligada a uma transacao do cartao (o flow nao casa a mesma despesa duas vezes).
Ensure-AttributeOn $despesa (YesNo "cr40f_ConciliadaCartao" "Conciliada com o cartão" "Sim quando a despesa já está ligada a uma transação do cartão corporativo")

if ($cartaoId) {
  Ensure-AttributeOn $cartao (Text "cr40f_IdConta" "Conta na API" "uuid da conta CREDIT no Banco MCP (accounts/list)" 100)
  Ensure-AttributeOn $cartao (Text "cr40f_Final" "Final do cartão" "Últimos 4 dígitos; vazio quando o banco não informa o cartão (vale para toda a conta)" 4)
  Ensure-AttributeOn $cartao (DateOnly "cr40f_InicioVigencia" "Início da vigência" "Desde quando o motorista usa este cartão")
  Ensure-AttributeOn $cartao (DateOnly "cr40f_FimVigencia" "Fim da vigência" "Até quando o motorista usou este cartão; vazio = em uso")
  # Excluir o funcionario nao apaga o historico do cartao: o lookup fica vazio.
  Ensure-Lookup $relCartaoMotorista $func $cartao "cr40f_Motorista" "Motorista" "Motorista que usa o cartão na vigência" "RemoveLink" "ApplicationRequired"
}
else { Write-Step "DRY RUN criaria em ${cartao}: cr40f_idconta, cr40f_final, cr40f_iniciovigencia, cr40f_fimvigencia e o lookup cr40f_motorista" }

if ($transId) {
  Ensure-AttributeOn $trans (Text "cr40f_IdExterno" "Id da transação" "id do lançamento no Banco MCP (único)" 100)
  Ensure-AttributeOn $trans (Text "cr40f_IdConta" "Conta na API" "uuid da conta CREDIT no Banco MCP" 100)
  Ensure-AttributeOn $trans (Text "cr40f_IdItem" "Conexão na API" "item_id da conexão bancária no Banco MCP" 100)
  Ensure-AttributeOn $trans (Text "cr40f_Fatura" "Fatura" "Mês previsto da fatura (AAAA-MM)" 20)
  Ensure-AttributeOn $trans (DateTimeUtc "cr40f_DataLancamento" "Data do lançamento" "Data e hora do lançamento informadas pelo banco")
  Ensure-AttributeOn $trans (DateOnly "cr40f_DataCompra" "Data da compra" "Dia da compra em São Paulo (nas parcelas, o dia da compra original)")
  Ensure-AttributeOn $trans (Money "cr40f_Valor" "Valor" "Valor do lançamento (negativo = estorno)" -1000000000)
  Ensure-AttributeOn $trans (Text "cr40f_Estabelecimento" "Estabelecimento" "Nome do estabelecimento quando o banco informa" 200)
  Ensure-AttributeOn $trans (Text "cr40f_Cnpj" "CNPJ" "CNPJ do estabelecimento (14 dígitos) quando o banco informa" 14)
  Ensure-AttributeOn $trans (Int "cr40f_Mcc" "MCC" "Código de categoria do estabelecimento (payeeMCC)" 9999)
  Ensure-AttributeOn $trans (Text "cr40f_Final" "Final do cartão" "Últimos 4 dígitos do cartão usado" 4)
  Ensure-AttributeOn $trans (Int "cr40f_Parcela" "Parcela" "Número da parcela" 999)
  Ensure-AttributeOn $trans (Int "cr40f_TotalParcelas" "Total de parcelas" "Quantidade de parcelas da compra" 999)
  Ensure-AttributeOn $trans (Picklist "cr40f_StatusApi" "Status no banco" "PENDING ou POSTED no Open Finance" @("Pendente", "Lançada"))
  Ensure-AttributeOn $trans (Text "cr40f_ChaveCompra" "Chave da compra" "conta|cartão|valor|data|descrição: religa a transação quando o banco troca o id ao confirmar" 400)
  Ensure-AttributeOn $trans (Picklist "cr40f_Tipo" "Tipo" "Natureza do lançamento" @("Compra", "Estorno", "Pagamento de fatura", "Encargo") "ApplicationRequired" 100000000)
  Ensure-AttributeOn $trans (Picklist "cr40f_Situacao" "Situação" "Situação da conciliação" @("Pendente", "Conciliada automática", "Conciliada manual", "Aguardando motorista", "Sem motorista", "Divergência", "Ignorada") "ApplicationRequired" 100000000)
  Ensure-AttributeOn $trans (Text "cr40f_Motivo" "Motivo" "Por que a transação ficou nesta situação" 400)
  Ensure-Key $trans "cr40f_chave_idexterno" "Id da transação" @("cr40f_idexterno")
  if ($cartaoId) { Ensure-Lookup $relTransCartao $cartao $trans "cr40f_Cartao" "Cartão" "Cartão corporativo vigente na data da compra" "RemoveLink" }
  Ensure-Lookup $relTransDespesa $despesa $trans "cr40f_Despesa" "Despesa" "Despesa do motorista conciliada com a transação" "RemoveLink"
  Ensure-Lookup $relTransMotorista $func $trans "cr40f_Motorista" "Motorista" "Motorista do cartão na data da compra" "RemoveLink"
}
else { Write-Step "DRY RUN criaria em $trans as colunas do lançamento, a chave alternativa cr40f_chave_idexterno e os lookups cr40f_cartao, cr40f_despesa e cr40f_motorista" }

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$cartao</entity><entity>$trans</entity><entity>$despesa</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $cartao = @("cr40f_name", "cr40f_idconta", "cr40f_final", "cr40f_iniciovigencia", "cr40f_fimvigencia", "cr40f_motorista")
    $trans = @("cr40f_name", "cr40f_idexterno", "cr40f_idconta", "cr40f_iditem", "cr40f_fatura", "cr40f_datalancamento", "cr40f_datacompra", "cr40f_valor", "cr40f_estabelecimento", "cr40f_cnpj", "cr40f_mcc", "cr40f_final", "cr40f_parcela", "cr40f_totalparcelas", "cr40f_statusapi", "cr40f_chavecompra", "cr40f_tipo", "cr40f_situacao", "cr40f_motivo", "cr40f_cartao", "cr40f_despesa", "cr40f_motorista")
    $despesa = @("cr40f_conciliadacartao")
  }
  $missing = @(); foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @($cartaoId, $transId)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $t and componenttype eq 1").Count -eq 0) { throw "Tabela $t nao esta na solucao $SolutionUniqueName." }
  }
  $attrBase = "EntityDefinitions(LogicalName='$cartao')/Attributes"
  foreach ($col in @("cr40f_iniciovigencia", "cr40f_fimvigencia")) {
    $comportamento = (Invoke-Dataverse "GET" "$attrBase(LogicalName='$col')/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?`$select=DateTimeBehavior").DateTimeBehavior.Value
    if ($comportamento -ne "DateOnly") { throw "$cartao.$col esta com comportamento $comportamento; o flow espera DateOnly." }
  }
  Write-Step "SCHEMA OK: tabelas publicadas e na solucao $SolutionUniqueName. Rode conceder-privilegios-conciliacao-cartao.ps1 e provision-conector-banco-mcp.ps1."
}
else { Write-Step "DRY RUN OK; use -Apply" }
