param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Prova de captura de midia do App Motoristas (fase 1): tabela cr40f_provamidia, uma linha por foto ou video enviado pela
# camera do app. So o plugin grava (Custom API new_ProvaMidia, como SYSTEM): o papel do motorista nao recebe privilegio.
# Os papeis da operacao que leem os anexos (os mesmos das visoes e documentos) recebem leitura (Organizacao).
# Os valores das choices sao o contrato do ProvaMidiaHandler (ordem fixa; a fase 2 so acrescenta opcoes).
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_provamidia"
$leitores = @("Acesso-Betinhos-Canvas", "Acesso-Betinhos-MDA", "DEV - Usu$([char]0xE1)rio")

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = $Min; $c.MaxValue = 2147483647; return $c
}
function Decimal([string] $Schema, [string] $Nome, [string] $Desc, [int] $Precisao, [double] $Min, [double] $Max) {
  $c = Base "DecimalAttributeMetadata" $Schema $Nome $Desc; $c.Precision = $Precisao; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
}
function DataHora([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateAndTime"; $c.DateTimeBehavior = @{ Value = "UserLocal" }; return $c
}
function Escolha([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc, [string[]] $Rotulos) {
  $c = Base $Tipo $Schema $Nome $Desc
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label $r) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

$colunas = @(
  (Escolha "PicklistAttributeMetadata" "cr40f_tela" "Tela" "Tela do app onde a m$([char]0xED)dia foi capturada." @(
    "Despesa", "Recebimento", "Manuten$([char]0xE7)$([char]0xE3)o", "Finalizar manuten$([char]0xE7)$([char]0xE3)o", "Colis$([char]0xE3)o", "Checklist")),
  (Texto "cr40f_tabelaorigem" "Tabela de origem" "Nome l$([char]0xF3)gico da tabela do registro que recebeu o anexo." 100),
  (Texto "cr40f_registroorigemid" "Registro de origem" "Id do registro que recebeu o anexo." 100),
  (Texto "cr40f_link" "Link do arquivo" "Link do arquivo no SharePoint, devolvido pelo flow de salvar arquivos." 2000),
  (Escolha "PicklistAttributeMetadata" "cr40f_tipomidia" "Tipo de m$([char]0xED)dia" "" @("Foto", "V$([char]0xED)deo")),
  (Inteiro "cr40f_tamanhobytes" "Tamanho (bytes)" "Tamanho do arquivo enviado." 0),
  (Decimal "cr40f_duracaosegundos" "Dura$([char]0xE7)$([char]0xE3)o (s)" "Dura$([char]0xE7)$([char]0xE3)o do v$([char]0xED)deo em segundos." 1 0 100000),
  (Texto "cr40f_sha256" "SHA-256" "Impress$([char]0xE3)o digital dos bytes enviados (hex)." 64),
  (Escolha "PicklistAttributeMetadata" "cr40f_origemcaptura" "Origem da captura" "C$([char]0xE2)mera ao vivo do app ou c$([char]0xE2)mera nativa pelo app. A fase 2 acrescenta galeria." @(
    "C$([char]0xE2)mera ao vivo do app", "C$([char]0xE2)mera nativa pelo app")),
  (Texto "cr40f_codigo" "C$([char]0xF3)digo" "C$([char]0xF3)digo curto impresso no carimbo da foto." 20),
  (DataHora "cr40f_emitidoem" "Emitido em" "Hora do servidor em que a c$([char]0xE2)mera abriu e o c$([char]0xF3)digo foi emitido. Vazio sem rede."),
  (DataHora "cr40f_capturadoem" "Capturado em" "Hora do celular na captura (declarada pelo app)."),
  (DataHora "cr40f_recebidoem" "Recebido em" "Hora do servidor em que a prova foi registrada."),
  (Inteiro "cr40f_atrasominutos" "Atraso (min)" "Recebido menos emitido (ou menos capturado, sem rede)." -2147483648),
  (Decimal "cr40f_latitude" "Latitude" "" 7 -90 90),
  (Decimal "cr40f_longitude" "Longitude" "" 7 -180 180),
  (Decimal "cr40f_precisaometros" "Precis$([char]0xE3)o (m)" "Precis$([char]0xE3)o informada pelo celular." 1 0 1000000),
  (Escolha "PicklistAttributeMetadata" "cr40f_estadolocalizacao" "Estado da localiza$([char]0xE7)$([char]0xE3)o" "" @("Registrada", "Negada", "Indispon$([char]0xED)vel")),
  (Escolha "MultiSelectPicklistAttributeMetadata" "cr40f_selos" "Selos" "Alertas da prova. A fase 2 acrescenta outros." @(
    "Capturada sem rede", "C$([char]0xF3)digo inv$([char]0xE1)lido", "C$([char]0xF3)digo n$([char]0xE3)o assinado"))
)

# Tabela
$entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
if ($entidade.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $table com $($colunas.Count) colunas, o lookup cr40f_motorista e leitura para $($leitores -join ', ')."; return }
  $primaria = Texto "cr40f_Name" "Nome" "C$([char]0xF3)digo e tela." 100
  $primaria.IsPrimaryName = $true
  Invoke-Dv "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = "cr40f_ProvaMidia"
    DisplayName = (Label "Prova de m$([char]0xED)dia"); DisplayCollectionName = (Label "Provas de m$([char]0xED)dia")
    Description = (Label "Prova de captura de cada foto e v$([char]0xED)deo do App Motoristas. Gravada s$([char]0xF3) pelo plugin (Custom API new_ProvaMidia).")
    PrimaryNameAttribute = "cr40f_name"; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false
    Attributes = @($primaria)
  } | Out-Null
  $entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
  if ($entidade.Count -ne 1) { throw "Tabela $table nao apareceu depois do POST." }
  Write-Step "criada a tabela $table"
}
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  $found = Get-Coluna $table $logical
  if (-not $found) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical."; continue }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
    $found = Get-Coluna $table $logical
    if (-not $found) { throw "Coluna $logical nao foi criada." }
    Write-Step "criada $table.$logical"
  }
}

# Lookup do motorista (cr40f_funcionarios)
$rel = "cr40f_funcionarios_cr40f_provamidia_motorista"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.cr40f_motorista." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = "cr40f_funcionarios"; ReferencedAttribute = "cr40f_funcionariosid"; ReferencingEntity = $table
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_motorista"; DisplayName = (Label "Motorista"); Description = (Label "Motorista que capturou a m$([char]0xED)dia (resolvido pelo usu$([char]0xE1)rio chamador)."); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $table.cr40f_motorista"
  }
}
if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
$motorista = Get-Coluna $table "cr40f_motorista"
if (-not $motorista) { throw "Lookup cr40f_motorista nao encontrado." }

Add-ComponenteNaSolucao $entidade[0].MetadataId 1
Publish-Tabela $table

# Leitura (Organizacao) para os papeis da operacao. O motorista (Acesso-Motoristas) fica sem privilegio.
$leitura = @(Get-Rows "privileges" "privilegeid,name" "name eq 'prvRead$table'")
if ($leitura.Count -ne 1) { throw "Privilegio prvRead$table nao encontrado." }
foreach ($nome in $leitores) {
  $papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$($nome.Replace("'", "''"))' and _parentroleid_value eq null")
  if ($papeis.Count -ne 1) { throw "Papel '$nome' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
  $papel = $papeis[0]
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @(@{
    "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $leitura[0].privilegeid; Depth = "Global"; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = "prvRead$table" }) } | Out-Null
  Write-Step "leitura de $table para $nome"
}
Write-Step "OK: tabela $table com $($colunas.Count + 1) colunas na solucao $script:SolucaoDev."
