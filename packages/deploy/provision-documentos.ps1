param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona as tabelas de gestao de documentos (cr40f_tipodocumento, cr40f_documento, cr40f_avisodestinatario) no Dataverse DEV e inclui na solucao do .env.
# Idempotente: cria so o que falta e semeia os tipos por cr40f_codigo. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os rotulos acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[documentos] $Message" }
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
      Description = Label $Description; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
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

foreach ($required in @("cr40f_funcionarios", "cr40f_veiculos")) { if (-not (Get-EntityId $required)) { throw "Tabela $required nao existe neste ambiente." } }

$tipo = "cr40f_tipodocumento"; $doc = "cr40f_documento"; $dest = "cr40f_avisodestinatario"
$tipoId = Ensure-Table $tipo "cr40f_TipoDocumento" "Tipo de documento" "Tipos de documento" "Catálogo de documentos controlados (CNH, ASO, CRLV…)"
$docId = Ensure-Table $doc "cr40f_Documento" "Documento" "Documentos" "Documento emitido de funcionário ou veículo, com validade e histórico."
$destId = Ensure-Table $dest "cr40f_AvisoDestinatario" "Destinatário de aviso" "Destinatários de aviso" "Quem recebe os avisos de vencimento por categoria."
if (-not $Apply -and (-not $tipoId -or -not $docId -or -not $destId)) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

# Tipo de documento — valores espelham domain/codes.ts
Ensure-AttributeOn $tipo (Text "cr40f_Codigo" "Código" "Código curto e nome da subpasta (CNH, ASO, CRLV…)" 40)
Ensure-AttributeOn $tipo (Picklist "cr40f_Categoria" "Categoria" "Pessoas ou Frota" @("Pessoas", "Frota") "ApplicationRequired")
Ensure-AttributeOn $tipo (YesNo "cr40f_TemValidade" "Tem validade" "O documento vence?")
Ensure-AttributeOn $tipo @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_ValidadePadraoMeses"; DisplayName = Label "Validade padrão (meses)"; Description = Label "Sugere a validade a partir da emissão"; MinValue = 1; MaxValue = 240; Format = "None" }
Ensure-AttributeOn $tipo (MultiPicklist "cr40f_ObrigatorioPara" "Obrigatório para" "Quem precisa ter este documento" @("Motorista", "Administrativo", "Próprio", "Terceiro", "Aluguel"))
Ensure-AttributeOn $tipo @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Ordem"; DisplayName = Label "Ordem"; Description = Label "Ordem no checklist"; MinValue = 0; MaxValue = 999; Format = "None" }

# Documento
Ensure-AttributeOn $doc (Text "cr40f_Numero" "Número" "Número do documento" 100)
Ensure-AttributeOn $doc (DateOnly "cr40f_Emissao" "Emissão" "Data de emissão")
Ensure-AttributeOn $doc (DateOnly "cr40f_Validade" "Validade" "Data de vencimento")
Ensure-AttributeOn $doc (Picklist "cr40f_Situacao" "Situação" "Vigente ou substituído por renovação" @("Vigente", "Substituído") "ApplicationRequired")
Ensure-AttributeOn $doc (Text "cr40f_Pasta" "Pasta" "Caminho da pasta no SharePoint" 400)
Ensure-AttributeOn $doc @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Observacao"; DisplayName = Label "Observação"; Description = Label "Seguradora, valor do IPVA etc."; MaxLength = 2000; Format = "TextArea" }
Ensure-AttributeOn $doc (Picklist "cr40f_UltimoMarcoAvisado" "Último marco avisado" "Controle anti-repetição dos e-mails" @("60 dias", "30 dias", "7 dias", "Vencido"))
Ensure-AttributeOn $doc @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_UltimoAvisoEm"; DisplayName = Label "Último aviso em"; Description = Label "Quando o último e-mail foi enviado"; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
# Tipo obrigatorio (spec): todo documento pertence a um tipo do catalogo.
Ensure-Lookup "cr40f_tipodocumento_cr40f_documento_tipo" $tipo $doc "cr40f_Tipo" "Tipo" "Tipo do documento" "Restrict" "ApplicationRequired"
Ensure-Lookup "cr40f_funcionarios_cr40f_documento_funcionario" "cr40f_funcionarios" $doc "cr40f_Funcionario" "Funcionário" "Dono do documento (pessoas)" "Cascade"
# Dataverse aceita uma unica relacao parental (Cascade) por tabela: a do funcionario. Veiculo usa Restrict.
Ensure-Lookup "cr40f_veiculos_cr40f_documento_veiculo" "cr40f_veiculos" $doc "cr40f_Veiculo" "Veículo" "Dono do documento (frota)" "Restrict"

# Destinatário
Ensure-AttributeOn $dest (Picklist "cr40f_Categoria" "Categoria" "Pessoas ou Frota" @("Pessoas", "Frota") "ApplicationRequired")
Ensure-Lookup "cr40f_funcionarios_cr40f_avisodestinatario_funcionario" "cr40f_funcionarios" $dest "cr40f_Funcionario" "Funcionário" "Quem recebe o aviso" "Cascade"

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$tipo</entity><entity>$doc</entity><entity>$dest</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $tipo = @("cr40f_name", "cr40f_codigo", "cr40f_categoria", "cr40f_temvalidade", "cr40f_validadepadraomeses", "cr40f_obrigatoriopara", "cr40f_ordem")
    $doc = @("cr40f_name", "cr40f_numero", "cr40f_emissao", "cr40f_validade", "cr40f_situacao", "cr40f_pasta", "cr40f_observacao", "cr40f_ultimomarcoavisado", "cr40f_ultimoavisoem", "cr40f_tipo", "cr40f_funcionario", "cr40f_veiculo")
    $dest = @("cr40f_name", "cr40f_categoria", "cr40f_funcionario")
  }
  $missing = @(); foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @($tipoId, $docId, $destId)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $t and componenttype eq 1").Count -eq 0) { throw "Tabela $t nao esta na solucao $SolutionUniqueName." }
  }

  # Seed: Pessoas 100000000 / Frota 100000001; obrigatorio: 100000000 Motorista, 100000001 Administrativo, 100000002 Proprio, 100000003 Terceiro, 100000004 Aluguel
  $set = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$tipo')?`$select=EntitySetName").EntitySetName
  $seed = @(
    @("CNH", "CNH", 100000000, $true, $null, "100000000", 1),
    @("ASO", "ASO", 100000000, $true, 12, "100000000,100000001", 2),
    @("ANTECEDENTES", "Antecedentes criminais", 100000000, $true, $null, "100000000", 3),
    @("CERTIDAO", "Certidões", 100000000, $true, $null, $null, 4),
    @("RG", "RG", 100000000, $false, $null, "100000000,100000001", 5),
    @("CPF", "CPF", 100000000, $false, $null, "100000000,100000001", 6),
    @("RESIDENCIA", "Comprovante de residência", 100000000, $false, $null, "100000000,100000001", 7),
    @("CONTRATO", "Contrato", 100000000, $false, $null, "100000000,100000001", 8),
    @("CRLV", "CRLV / Licenciamento", 100000001, $true, $null, "100000002,100000003,100000004", 1),
    @("IPVA", "IPVA", 100000001, $true, $null, "100000002", 2),
    @("SEGURO", "Seguro", 100000001, $true, $null, "100000002,100000003,100000004", 3)
  )
  foreach ($s in $seed) {
    if (@(Get-Rows $set "cr40f_tipodocumentoid" "cr40f_codigo eq '$($s[0])'").Count -gt 0) { continue }
    Invoke-Dataverse "POST" $set @{ cr40f_codigo = $s[0]; cr40f_name = $s[1]; cr40f_categoria = $s[2]; cr40f_temvalidade = $s[3]; cr40f_validadepadraomeses = $s[4]; cr40f_obrigatoriopara = $s[5]; cr40f_ordem = $s[6] } | Out-Null
    Write-Step "tipo criado $($s[0])"
  }
  Write-Step "SCHEMA OK: tabelas publicadas, na solucao $SolutionUniqueName e tipos semeados"

  # LGPD (spec secao 7): o script NAO concede privilegios. So lista (GET) os papeis que ja acessam cr40f_funcionarios.
  Write-Step "papeis de seguranca com privilegio em cr40f_funcionarios (somente leitura):"
  try {
    $privileges = @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'cr40f_funcionarios')")
    $porPapel = @{}
    foreach ($p in $privileges) {
      $acao = $p.name -replace '^prv', '' -replace 'cr40f_funcionarios$', ''
      foreach ($rp in @(Get-Rows "roleprivilegescollection" "roleid" "privilegeid eq $($p.privilegeid)")) {
        if (-not $porPapel.ContainsKey($rp.roleid)) { $porPapel[$rp.roleid] = @() }
        $porPapel[$rp.roleid] += $acao
      }
    }
    $linhas = @{}
    foreach ($roleId in $porPapel.Keys) {
      $role = @(Get-Rows "roles" "name" "roleid eq $roleId")
      if ($role.Count -eq 0) { continue }
      $nome = $role[0].name
      if (-not $linhas.ContainsKey($nome)) { $linhas[$nome] = @() }
      $linhas[$nome] = @($linhas[$nome] + $porPapel[$roleId] | Sort-Object -Unique)
    }
    if ($linhas.Count -eq 0) { Write-Step "  nenhum papel encontrado" }
    foreach ($nome in @($linhas.Keys | Sort-Object)) { Write-Step "  $nome : $($linhas[$nome] -join ', ')" }
  }
  catch { Write-Step "  nao foi possivel listar os papeis: $($_.Exception.Message)" }
  Write-Step "LEMBRETE LGPD: antes de liberar a gestao de documentos para quem nao e administrador, de a esses mesmos papeis privilegios equivalentes em cr40f_tipodocumento, cr40f_documento e cr40f_avisodestinatario (Antecedentes criminais e dado sensivel). Este script nao concede privilegios."
}
else { Write-Step "DRY RUN OK; use -Apply" }
