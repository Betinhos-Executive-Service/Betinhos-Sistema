param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona as tabelas de equipamentos (cr40f_tipoequipamento, cr40f_equipamento, cr40f_fotoequipamento) no Dataverse DEV e inclui na solucao do .env.
# Idempotente: cria so o que falta e semeia os tipos por nome. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Privilegios ficam em conceder-privilegios-equipamentos.ps1 (rodar depois deste, com -Apply).
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[equipamentos] $Message" }
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
# O Dataverse tambem ignora CanStoreFullImage (e pode ignorar MaxSizeInKB/IsPrimaryImage) no POST da coluna de imagem;
# a doc permite mudar os tres depois da criacao: acerta por PUT da metadata completa, no molde do Ensure-NameAttribute.
function Ensure-ImageAttribute([string] $Entity, [string] $Logical, [int] $MaxKB) {
  $attr = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='$Logical')/Microsoft.Dynamics.CRM.ImageAttributeMetadata"
  if ($attr.CanStoreFullImage -eq $true -and $attr.MaxSizeInKB -eq $MaxKB -and $attr.IsPrimaryImage -eq $true) { return }
  $de = "CanStoreFullImage $($attr.CanStoreFullImage)/MaxSizeInKB $($attr.MaxSizeInKB)/IsPrimaryImage $($attr.IsPrimaryImage)"
  if (-not $Apply) { Write-Step "DRY RUN mudaria $Entity.$Logical de $de para CanStoreFullImage True/MaxSizeInKB $MaxKB/IsPrimaryImage True"; return }
  foreach ($name in @($attr.PSObject.Properties | Where-Object { $_.Name -like "@odata.*" } | ForEach-Object { $_.Name })) { $attr.PSObject.Properties.Remove($name) }
  $attr | Add-Member -NotePropertyName "@odata.type" -NotePropertyValue "Microsoft.Dynamics.CRM.ImageAttributeMetadata" -Force
  $attr.CanStoreFullImage = $true
  $attr.MaxSizeInKB = $MaxKB
  $attr.IsPrimaryImage = $true
  Invoke-Dataverse "PUT" "EntityDefinitions(LogicalName='$Entity')/Attributes(LogicalName='$Logical')" $attr -ExtraHeaders @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "$Entity.$Logical de $de para CanStoreFullImage True/MaxSizeInKB $MaxKB/IsPrimaryImage True"
}
# Coluna primaria cr40f_name: tamanho, obrigatoriedade e rotulo por tabela (spec secao 4: tipo 100, equipamento 200, obrigatoria).
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
# Coluna de imagem das fotos: primaria (so a imagem primaria aceita o base64 no POST que cria o registro, como o shell envia),
# guarda a imagem grande (o shell abre $value?size=full) e aceita ate 10 MB (o shell limita a 5 MB, como a foto do funcionario).
function ImagePrimary([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.ImageAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; IsPrimaryImage = $true; CanStoreFullImage = $true; MaxSizeInKB = 10240 }
}

# Moeda (BRL da organizacao), nunca negativa (spec secao 4.2).
function Money([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = 0; MaxValue = 1000000000; Precision = 2; PrecisionSource = 2 }
}

if (-not (Get-EntityId "cr40f_funcionarios")) { throw "Tabela cr40f_funcionarios nao existe neste ambiente." }

$tipo = "cr40f_tipoequipamento"; $equip = "cr40f_equipamento"; $foto = "cr40f_fotoequipamento"
$relTipo = "cr40f_tipoequipamento_cr40f_equipamento_tipo"; $relResponsavel = "cr40f_funcionarios_cr40f_equipamento_responsavel"
$relFoto = "cr40f_equipamento_cr40f_fotoequipamento_equipamento"
$tipoId = Ensure-Table $tipo "cr40f_TipoEquipamento" "Tipo de equipamento" "Tipos de equipamento" "Catálogo de tipos (Notebook, Monitor, Máquina de cartão…)" 100 "ApplicationRequired"
$equipId = Ensure-Table $equip "cr40f_Equipamento" "Equipamento" "Equipamentos" "Equipamento da empresa e o funcionário com ele agora." 200 "ApplicationRequired" "Descrição" "Descrição curta do item"
# Fotos do equipamento (spec de fotos): varias por item, como os anexos do Planner; cr40f_name guarda o nome do arquivo.
$fotoId = Ensure-Table $foto "cr40f_FotoEquipamento" "Foto de equipamento" "Fotos de equipamento" "Fotos do equipamento; a marcada como capa aparece na lista." 200 "ApplicationRequired" "Nome do arquivo" "Nome do arquivo da foto"
if (-not $Apply -and (-not $tipoId -or -not $equipId)) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

# Status: valores espelham apps/shell/src/pages/equipamentos/domain/choices.ts (100000000 Em uso, 100000001 Disponivel, 100000002 Em manutencao, 100000003 Baixado).
$statusDisponivel = 100000001
Ensure-AttributeOn $equip (Text "cr40f_MarcaModelo" "Marca/modelo" "Marca e modelo do item" 200)
Ensure-AttributeOn $equip (Text "cr40f_NumeroSerie" "Nº de série" "Número de série do fabricante" 100)
Ensure-AttributeOn $equip (Picklist "cr40f_Status" "Status" "Situação do item" @("Em uso", "Disponível", "Em manutenção", "Baixado") "ApplicationRequired" $statusDisponivel)
# Somente data: o shell le cr40f_datacompra como AAAA-MM-DD (slice(0,10)), sem fuso.
Ensure-AttributeOn $equip (DateOnly "cr40f_DataCompra" "Data de compra" "Quando o item foi comprado")
Ensure-AttributeOn $equip (Money "cr40f_ValorCompra" "Valor de compra" "Valor pago pelo item")
Ensure-AttributeOn $equip @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Observacoes"; DisplayName = Label "Observações"; Description = Label "Acessórios e estado do item"; MaxLength = 2000; Format = "TextArea" }
# Excluir tipo ou funcionario nao apaga o equipamento: o lookup fica vazio (spec secao 4.2).
Ensure-Lookup $relTipo $tipo $equip "cr40f_Tipo" "Tipo" "Tipo do equipamento" "RemoveLink" "ApplicationRequired"
Ensure-Lookup $relResponsavel "cr40f_funcionarios" $equip "cr40f_Responsavel" "Responsável" "Funcionário com o item agora; vazio = escritório/estoque" "RemoveLink"
# Tabela de fotos ainda nao existe no dry run: as colunas so podem ser conferidas depois de criada.
if ($fotoId) {
  Ensure-AttributeOn $foto (ImagePrimary "cr40f_Imagem" "Imagem" "Foto do equipamento (miniatura e imagem grande)")
  if (Get-AttributeId $foto "cr40f_imagem") { Ensure-ImageAttribute $foto "cr40f_imagem" 10240 }
  Ensure-AttributeOn $foto (YesNo "cr40f_Capa" "Capa" "Foto exibida na lista de equipamentos; uma por item, mantida pelo shell")
  # Excluir o equipamento apaga as fotos dele (Cascade); a foto nao existe sem o item.
  Ensure-Lookup $relFoto $equip $foto "cr40f_Equipamento" "Equipamento" "Equipamento da foto" "Cascade" "ApplicationRequired"
}
else { Write-Step "DRY RUN criaria em $foto as colunas cr40f_imagem (imagem primaria, 10 MB, imagem grande) e cr40f_capa (Sim/Nao) e o lookup cr40f_equipamento (Cascade)" }

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$tipo</entity><entity>$equip</entity><entity>$foto</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $tipo = @("cr40f_name")
    $equip = @("cr40f_name", "cr40f_marcamodelo", "cr40f_numeroserie", "cr40f_status", "cr40f_datacompra", "cr40f_valorcompra", "cr40f_observacoes", "cr40f_tipo", "cr40f_responsavel")
    $foto = @("cr40f_name", "cr40f_imagem", "cr40f_capa", "cr40f_equipamento")
  }
  $missing = @(); foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @($tipoId, $equipId, $fotoId)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $t and componenttype eq 1").Count -eq 0) { throw "Tabela $t nao esta na solucao $SolutionUniqueName." }
  }
  # Excluir tipo ou funcionario so limpa o lookup (spec secao 4.2); relacionamento criado antes por outro caminho pode ter vindo diferente.
  # Fotos: excluir o equipamento apaga as fotos (Cascade).
  foreach ($rel in @(@($relTipo, "RemoveLink"), @($relResponsavel, "RemoveLink"), @($relFoto, "Cascade"))) {
    $relRows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$($rel[0])'")
    if ($relRows.Count -ne 1) { throw "Relacionamento $($rel[0]) nao encontrado apos a publicacao." }
    $exclusao = (Invoke-Dataverse "GET" "RelationshipDefinitions($($relRows[0].MetadataId))/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata").CascadeConfiguration.Delete
    if ($exclusao -ne $rel[1]) { throw "Relacionamento $($rel[0]) esta com exclusao $exclusao; o spec exige $($rel[1])." }
  }
  foreach ($e in @($tipo, $equip, $foto)) {
    $tamanhoEsperado = if ($e -eq $tipo) { 100 } else { 200 }
    $nome = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$e')/Attributes(LogicalName='cr40f_name')/Microsoft.Dynamics.CRM.StringAttributeMetadata?`$select=MaxLength,RequiredLevel"
    if ($nome.MaxLength -ne $tamanhoEsperado -or $nome.RequiredLevel.Value -ne "ApplicationRequired") { throw "$e.cr40f_name ficou com MaxLength $($nome.MaxLength)/$($nome.RequiredLevel.Value) (esperado $tamanhoEsperado/ApplicationRequired)." }
  }
  # O shell depende destes dois detalhes; coluna criada antes por outro caminho pode ter vindo diferente.
  $attrBase = "EntityDefinitions(LogicalName='$equip')/Attributes"
  $comportamento = (Invoke-Dataverse "GET" "$attrBase(LogicalName='cr40f_datacompra')/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?`$select=DateTimeBehavior").DateTimeBehavior.Value
  if ($comportamento -ne "DateOnly") { throw "$equip.cr40f_datacompra esta com comportamento $comportamento; o shell espera DateOnly." }
  $padrao = (Invoke-Dataverse "GET" "$attrBase(LogicalName='cr40f_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=DefaultFormValue").DefaultFormValue
  if ($padrao -ne $statusDisponivel) { Write-Step "AVISO: $equip.cr40f_status tem padrao $padrao (esperado $statusDisponivel Disponivel); ajuste no maker portal." }
  # O shell cria a foto com a imagem no mesmo POST (exige imagem primaria) e abre a grande por $value?size=full (exige CanStoreFullImage).
  $imagem = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$foto')/Attributes(LogicalName='cr40f_imagem')/Microsoft.Dynamics.CRM.ImageAttributeMetadata?`$select=CanStoreFullImage,MaxSizeInKB"
  if (-not $imagem.CanStoreFullImage) { throw "$foto.cr40f_imagem nao guarda a imagem grande (CanStoreFullImage); o shell abre a foto por `$value?size=full." }
  if ($imagem.MaxSizeInKB -ne 10240) { throw "$foto.cr40f_imagem esta com MaxSizeInKB $($imagem.MaxSizeInKB) (esperado 10240)." }
  $primaria = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$foto')?`$select=PrimaryImageAttribute").PrimaryImageAttribute
  if ($primaria -ne "cr40f_imagem") { throw "$foto tem imagem primaria '$primaria' (esperado cr40f_imagem); sem isso o Dataverse recusa a imagem no POST de criacao." }

  $set = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$tipo')?`$select=EntitySetName").EntitySetName
  foreach ($nome in @("Notebook", "Desktop", "Monitor", "Mouse", "Teclado", "Headset", "Celular", "Tablet", "Máquina de cartão", "Impressora", "Outro")) {
    if (@(Get-Rows $set "cr40f_tipoequipamentoid" "cr40f_name eq '$(Escape-OData $nome)'").Count -gt 0) { continue }
    Invoke-Dataverse "POST" $set @{ cr40f_name = $nome } | Out-Null
    Write-Step "tipo criado $nome"
  }
  Write-Step "SCHEMA OK: tabelas publicadas, na solucao $SolutionUniqueName e tipos semeados. Rode conceder-privilegios-equipamentos.ps1."
}
else { Write-Step "DRY RUN OK; use -Apply" }
