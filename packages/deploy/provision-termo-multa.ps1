param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona o schema do termo de multa com assinatura eletronica no Dataverse DEV e inclui na solucao do .env:
# tabelas new_termomulta, new_parcelamultafolha e new_textotermomulta; colunas novas em cr40f_multas e cr40f_funcionarios;
# auditoria nas tabelas; seed dos textos v0-placeholder (Termo e Aditivo). Spec: docs/superpowers/specs/2026-10-22-termo-multa-assinatura-design.md.
# Idempotente: cria so o que falta. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo (ou de variaveis de ambiente).
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[termo-multa] $Message" }
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
  if (In-Solution $ComponentId $ComponentType) { return }
  Invoke-Dataverse "POST" "AddSolutionComponent" @{ ComponentId = $ComponentId; ComponentType = $ComponentType; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = -not $IncludeSubcomponents } | Out-Null
  Write-Step "na solucao: $Label"
}
function In-Solution([object] $ComponentId, [int] $ComponentType) {
  @(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $ComponentId and componenttype eq $ComponentType").Count -gt 0
}

# Tabela ja na solucao com todos os subcomponentes (rootcomponentbehavior 0): coluna nova vem junto e
# AddSolutionComponent da coluna nao cria linha propria (seria repetido a cada execucao).
$script:wholeTable = @{}
function Test-WholeTable([string] $Entity) {
  if (-not $script:wholeTable.ContainsKey($Entity)) {
    $linhas = @(Get-Rows "solutioncomponents" "rootcomponentbehavior" "_solutionid_value eq $solutionId and objectid eq $(Get-EntityId $Entity) and componenttype eq 1")
    $script:wholeTable[$Entity] = ($linhas.Count -eq 1 -and [int] $linhas[0].rootcomponentbehavior -eq 0)
  }
  return $script:wholeTable[$Entity]
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

function Picklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels, [object] $Default = $null) {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  $payload = @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
  if ($null -ne $Default) { $payload.DefaultFormValue = [int] $Default }
  return $payload
}
function Text([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function Memo([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; Format = "TextArea" }
}
function Money([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = 0; MaxValue = 1000000000; Precision = 2; PrecisionSource = 2 }
}
function Int([string] $Schema, [string] $Display, [string] $Description, [int] $Min, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = $Min; MaxValue = $Max; Format = "None" }
}
function Dec([string] $Schema, [string] $Display, [string] $Description, [int] $Precision, [double] $Min, [double] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Precision = $Precision; MinValue = $Min; MaxValue = $Max }
}
function DateOnly([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
}
# Data/hora gravada pelo servidor (DateTime.UtcNow no plugin); exibida no fuso do usuario.
function DateTimeLocal([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
}
function YesNo([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; DefaultValue = $false
     OptionSet = @{ TrueOption = @{ Value = 1; Label = Label "Sim" }; FalseOption = @{ Value = 0; Label = Label "Não" } } }
}
# Imagem em tamanho cheio (prova da assinatura); nenhuma e a imagem primaria da tabela.
function Image([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.ImageAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; CanStoreFullImage = $true; IsPrimaryImage = $false; MaxSizeInKB = 10240 }
}
function File([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.FileAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxSizeInKB = 10240 }
}

# -Individual: coluna em tabela existente (cr40f_*), entra na solucao como componente proprio (tipo 2).
# Nas tabelas novas a tabela inteira ja esta na solucao com subcomponentes.
function Ensure-AttributeOn([string] $Entity, [hashtable] $Payload, [switch] $Individual) {
  $logical = $Payload.SchemaName.ToLowerInvariant()
  $id = Get-AttributeId $Entity $logical
  if (-not $id) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $Entity.$logical"; return }
    if (-not $Payload.ContainsKey("RequiredLevel")) { $Payload.RequiredLevel = @{ Value = "None" } }
    Invoke-Dataverse "POST" "EntityDefinitions(LogicalName='$Entity')/Attributes" $Payload | Out-Null
    Write-Step "coluna criada $Entity.$logical"
    $id = Get-AttributeId $Entity $logical
  }
  if ($Individual -and -not (Test-WholeTable $Entity)) { Add-SolutionComponent $id 2 "$Entity.$logical" }
}

function Ensure-Table([string] $Logical, [string] $Schema, [string] $Display, [string] $Plural, [string] $Description, [string] $NameDescription) {
  $id = Get-EntityId $Logical
  if (-not $id -and $Apply) {
    Invoke-Dataverse "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema; DisplayName = Label $Display; DisplayCollectionName = Label $Plural
      Description = Label $Description; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "new_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "new_Name"; IsPrimaryName = $true; MaxLength = 100; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = "None" }; DisplayName = Label "Nome"; Description = Label $NameDescription })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical" }
  if ($id) { Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents }
  return $id
}

$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
function Ensure-Lookup([string] $Relationship, [string] $Referenced, [string] $Referencing, [string] $Schema, [string] $Display, [string] $Description, [string] $Delete, [switch] $Individual) {
  $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  if ($rows.Count -eq 0 -and $Apply) {
    Invoke-Dataverse "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $Relationship
      ReferencedEntity = $Referenced; ReferencedAttribute = "${Referenced}id"; ReferencingEntity = $Referencing
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = $Delete; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "lookup criado $Referencing.$($Schema.ToLowerInvariant())"
    $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  }
  elseif ($rows.Count -eq 0) { Write-Step "DRY RUN criaria lookup $Referencing.$($Schema.ToLowerInvariant()) -> $Referenced" }
  if ($rows.Count -eq 1 -and $Individual -and -not (Test-WholeTable $Referencing)) {
    Add-SolutionComponent $rows[0].MetadataId 10 "relacionamento $Relationship"
    Add-SolutionComponent (Get-AttributeId $Referencing $Schema.ToLowerInvariant()) 2 "$Referencing.$($Schema.ToLowerInvariant())"
  }
}

# Liga a auditoria da tabela (PUT da metadata completa, como a Web API exige). A auditoria da organizacao nao e tocada.
function Ensure-TableAudit([string] $Entity) {
  $meta = Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$Entity')"
  if ($meta.IsAuditEnabled.Value) { return }
  if (-not $Apply) { Write-Step "DRY RUN ligaria a auditoria de $Entity"; return }
  foreach ($name in @($meta.PSObject.Properties | Where-Object { $_.Name -like "@odata.*" } | ForEach-Object { $_.Name })) { $meta.PSObject.Properties.Remove($name) }
  $meta | Add-Member -NotePropertyName "@odata.type" -NotePropertyValue "Microsoft.Dynamics.CRM.EntityMetadata" -Force
  $meta.IsAuditEnabled.Value = $true
  Invoke-Dataverse "PUT" "EntityDefinitions(LogicalName='$Entity')" $meta -ExtraHeaders @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Write-Step "auditoria ligada em $Entity"
}

$multas = "cr40f_multas"; $func = "cr40f_funcionarios"
foreach ($t in @($multas, $func)) { if (-not (Get-EntityId $t)) { throw "Tabela $t nao existe neste ambiente." } }

$termo = "new_termomulta"; $parcela = "new_parcelamultafolha"; $texto = "new_textotermomulta"
$termoId = Ensure-Table $termo "new_TermoMulta" "Termo de multa" "Termos de multa" "Termo de responsabilidade de multa assinado eletronicamente pelo motorista." "TM-<placa>-<data>"
$parcelaId = Ensure-Table $parcela "new_ParcelaMultaFolha" "Parcela de multa em folha" "Parcelas de multa em folha" "Parcela de desconto em folha gerada por um termo de multa assinado." "Identificação da parcela"
$textoId = Ensure-Table $texto "new_TextoTermoMulta" "Texto do termo" "Textos do termo" "Versões do texto do termo de multa e do aditivo contratual." "Identificação do texto"

# Colunas das tabelas novas: so dao para conferir/criar depois que a tabela existe.
if ($termoId) {
  Ensure-AttributeOn $termo (Picklist "new_Status" "Status" "Situação do termo" @("Pendente", "Assinado", "Contestado", "Expirado", "Cancelado") 100000000)
  Ensure-AttributeOn $termo (Picklist "new_FormaPagamento" "Forma de pagamento" "Como o motorista paga a multa" @("Paga a guia", "Desconto em folha"))
  Ensure-AttributeOn $termo (Int "new_Parcelas" "Parcelas" "Número de parcelas do desconto em folha (1 a 3)" 1 3)
  Ensure-AttributeOn $termo (Money "new_ValorTotal" "Valor total" "Valor total da multa assumido no termo")
  Ensure-AttributeOn $termo (Money "new_ValorParcela" "Valor da parcela" "Valor de cada parcela do desconto em folha")
  Ensure-AttributeOn $termo (DateOnly "new_PrimeiraCompetencia" "Primeira competência" "Mês do primeiro desconto (dia 1)")
  Ensure-AttributeOn $termo (Text "new_VersaoTexto" "Versão do texto" "Versão do texto do termo exibido" 20)
  Ensure-AttributeOn $termo (Memo "new_TextoTermo" "Texto do termo" "Texto exato exibido ao motorista" 20000)
  Ensure-AttributeOn $termo (Memo "new_EvidenciasJson" "Evidências (JSON)" "Placa, data/hora, local, infração, valor e InFleet congelados no envio" 20000)
  Ensure-AttributeOn $termo (Image "new_Selfie" "Selfie" "Selfie do motorista no momento da assinatura")
  Ensure-AttributeOn $termo (Memo "new_AssinaturaJson" "Assinatura (JSON)" "Traços da assinatura desenhada" 100000)
  Ensure-AttributeOn $termo (Image "new_Assinatura" "Assinatura" "Imagem PNG da assinatura gerada no servidor")
  Ensure-AttributeOn $termo (Dec "new_Latitude" "Latitude" "Latitude no momento da assinatura" 6 -90 90)
  Ensure-AttributeOn $termo (Dec "new_Longitude" "Longitude" "Longitude no momento da assinatura" 6 -180 180)
  Ensure-AttributeOn $termo (Dec "new_PrecisaoGps" "Precisão do GPS (m)" "Precisão da localização em metros" 2 0 1000000)
  Ensure-AttributeOn $termo (Text "new_Dispositivo" "Dispositivo" "User agent, plataforma e versão do app" 500)
  Ensure-AttributeOn $termo (DateTimeLocal "new_EnviadoEm" "Enviado em" "Data/hora do servidor no envio ao motorista")
  Ensure-AttributeOn $termo (DateTimeLocal "new_AssinadoEm" "Assinado em" "Data/hora do servidor na assinatura")
  Ensure-AttributeOn $termo (Memo "new_MotivoContestacao" "Motivo da contestação" "Motivo informado pelo motorista ao contestar" 2000)
  Ensure-AttributeOn $termo (File "new_Pdf" "PDF do termo" "PDF assinado gerado no servidor")
  Ensure-AttributeOn $termo (Text "new_HashPdf" "Hash do PDF" "SHA-256 do PDF assinado" 64)
  Ensure-AttributeOn $termo (DateTimeLocal "new_CopiaEnviadaEm" "Cópia enviada em" "Quando a cópia do termo foi enviada ao motorista")
  Ensure-AttributeOn $termo (Text "new_CopiaCanal" "Canal da cópia" "Canal usado para enviar a cópia" 50)
  Ensure-Lookup "new_cr40f_multas_new_termomulta_multa" $multas $termo "new_Multa" "Multa" "Multa a que o termo se refere" "RemoveLink"
  Ensure-Lookup "new_cr40f_funcionarios_new_termomulta_motorista" $func $termo "new_Motorista" "Motorista" "Motorista que assina o termo" "RemoveLink"
}
if ($parcelaId) {
  Ensure-AttributeOn $parcela (Int "new_Numero" "Número" "Número da parcela (1 a 3)" 1 3)
  Ensure-AttributeOn $parcela (DateOnly "new_Competencia" "Competência" "Mês do desconto em folha (dia 1)")
  Ensure-AttributeOn $parcela (Money "new_Valor" "Valor" "Valor da parcela")
  Ensure-AttributeOn $parcela (Picklist "new_Status" "Status" "Situação da parcela" @("Prevista", "Descontada", "Cancelada") 100000000)
  # A parcela nao existe sem o termo, e o termo assinado nunca e excluido (plugin): Restrict impede apagar termo com parcelas.
  Ensure-Lookup "new_new_termomulta_new_parcelamultafolha_termo" $termo $parcela "new_Termo" "Termo" "Termo de multa que gerou a parcela" "Restrict"
  Ensure-Lookup "new_cr40f_funcionarios_new_parcelamultafolha_motorista" $func $parcela "new_Motorista" "Motorista" "Motorista descontado" "RemoveLink"
}
if ($textoId) {
  Ensure-AttributeOn $texto (Text "new_Versao" "Versão" "Versão do texto (ex.: v1)" 20)
  Ensure-AttributeOn $texto (Memo "new_Texto" "Texto" "Texto com marcadores {motorista}, {cpf}, {placa}, {infracao}, {valor}, {forma}, {parcelas}" 20000)
  Ensure-AttributeOn $texto (Picklist "new_Tipo" "Tipo" "Termo de multa ou aditivo contratual" @("Termo", "Aditivo"))
  Ensure-AttributeOn $texto (YesNo "new_Vigente" "Vigente" "Versão usada nos próximos envios")
}

# Colunas novas em tabelas existentes: componentes individuais na solucao.
Ensure-AttributeOn $func (DateOnly "new_AditivoAssinaturaEm" "Aditivo assinado em" "Data da assinatura do aditivo contratual de multas") -Individual
Ensure-AttributeOn $func (File "new_AditivoAssinatura" "Aditivo assinado (PDF)" "PDF do aditivo contratual assinado") -Individual
Ensure-AttributeOn $multas (Money "new_ValorGuia" "Valor da guia" "Valor da guia da multa") -Individual
Ensure-AttributeOn $multas (YesNo "new_RecursoPendente" "Recurso pendente" "Há recurso em andamento: nenhuma parcela é gerada") -Individual
if ($termoId) { Ensure-Lookup "new_new_termomulta_cr40f_multas_termovigente" $termo $multas "new_TermoVigente" "Termo vigente" "Termo de multa vigente desta multa" "RemoveLink" -Individual }
else { Write-Step "DRY RUN criaria lookup $multas.new_termovigente -> $termo" }

$org = @(Get-Rows "organizations" "isauditenabled")
if ($org.Count -eq 1 -and -not [bool] $org[0].isauditenabled) { Write-Step "AVISO: auditoria da ORGANIZACAO esta desligada; ligar e decisao do Renan (nada foi alterado)." }
elseif ($org.Count -eq 1) { Write-Step "auditoria da organizacao: ligada" }

if (-not ($termoId -and $parcelaId -and $textoId)) {
  if ($Apply) { throw "Tabelas novas nao encontradas depois da criacao." }
  Ensure-TableAudit $multas
  Write-Step "DRY RUN ligaria a auditoria das 3 tabelas novas e semearia os textos v0-placeholder (Termo e Aditivo)"
  Write-Step "DRY RUN OK; use -Apply"; exit 0
}
foreach ($e in @($termo, $parcela, $texto, $multas)) { Ensure-TableAudit $e }
if (-not $Apply) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$termo</entity><entity>$parcela</entity><entity>$texto</entity><entity>$multas</entity><entity>$func</entity></entities></importexportxml>" } | Out-Null

# Seed dos textos por versao + tipo (nunca sobrescreve texto existente).
$placeholderTermo = "TERMO DE RESPONSABILIDADE POR MULTA DE TRÂNSITO (texto provisório v0-placeholder)`n`nEu, {motorista}, CPF {cpf}, reconheço a infração {infracao} cometida com o veículo {placa}, no valor de {valor}, e escolho pagar por: {forma} ({parcelas} parcela(s))."
$placeholderAditivo = "ADITIVO AO CONTRATO DE TRABALHO (texto provisório v0-placeholder)`n`nEu, {motorista}, CPF {cpf}, autorizo o desconto em folha das multas de trânsito sob minha responsabilidade, conforme o termo assinado para cada multa."
$setTexto = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$texto')?`$select=EntitySetName").EntitySetName
foreach ($seed in @(@(100000000, "Termo", $placeholderTermo), @(100000001, "Aditivo", $placeholderAditivo))) {
  if (@(Get-Rows $setTexto "new_textotermomultaid" "new_versao eq 'v0-placeholder' and new_tipo eq $($seed[0])").Count -gt 0) { continue }
  Invoke-Dataverse "POST" $setTexto @{ new_name = "$($seed[1]) v0-placeholder"; new_versao = "v0-placeholder"; new_tipo = $seed[0]; new_texto = $seed[2]; new_vigente = $true } | Out-Null
  Write-Step "texto semeado: $($seed[1]) v0-placeholder"
}

# Conferencia final.
$esperado = @{
  $termo = @("new_name", "new_multa", "new_motorista", "new_status", "new_formapagamento", "new_parcelas", "new_valortotal", "new_valorparcela", "new_primeiracompetencia", "new_versaotexto", "new_textotermo", "new_evidenciasjson", "new_selfie", "new_assinaturajson", "new_assinatura", "new_latitude", "new_longitude", "new_precisaogps", "new_dispositivo", "new_enviadoem", "new_assinadoem", "new_motivocontestacao", "new_pdf", "new_hashpdf", "new_copiaenviadaem", "new_copiacanal")
  $parcela = @("new_name", "new_termo", "new_motorista", "new_numero", "new_competencia", "new_valor", "new_status")
  $texto = @("new_name", "new_versao", "new_texto", "new_tipo", "new_vigente")
  $func = @("new_aditivoassinaturaem", "new_aditivoassinatura")
  $multas = @("new_valorguia", "new_recursopendente", "new_termovigente")
}
$missing = @(); $foraDaSolucao = @(); $total = 0
foreach ($e in $esperado.Keys) {
  foreach ($c in $esperado[$e]) {
    $total++
    $aid = Get-AttributeId $e $c
    if (-not $aid) { $missing += "$e.$c"; continue }
    if ($e -in @($func, $multas) -and -not (Test-WholeTable $e) -and -not (In-Solution $aid 2)) { $foraDaSolucao += "$e.$c" }
  }
}
if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
foreach ($t in @($termoId, $parcelaId, $textoId)) { if (-not (In-Solution $t 1)) { $foraDaSolucao += "tabela $t" } }
if ($foraDaSolucao.Count) { throw "Fora da solucao ${SolutionUniqueName}: $($foraDaSolucao -join ', ')" }
foreach ($e in @($termo, $parcela, $texto, $multas)) {
  if (-not (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$e')?`$select=IsAuditEnabled").IsAuditEnabled.Value) { throw "Auditoria desligada em $e." }
}
$seeds = @(Get-Rows $setTexto "new_textotermomultaid" "new_versao eq 'v0-placeholder' and new_vigente eq true").Count
if ($seeds -lt 2) { throw "Seed dos textos incompleto ($seeds de 2)." }
Write-Step "SCHEMA OK: $total colunas conferidas, tabelas na solucao $SolutionUniqueName, auditoria ligada, $seeds textos v0-placeholder vigentes."
