param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Nota do motorista em tabela (Infleet -> Dataverse): tabela new_notamotorista, uma linha por motorista e periodo
# (90 dias, mes ou dia). So o plugin grava (Custom API new_SincronizarNotasInfleet, como SYSTEM); o upsert usa a chave
# alternativa new_chave_unica (<funcionarioid>|90d, |AAAA-MM ou |AAAA-MM-DD). O papel do motorista fica sem privilegio;
# os papeis da operacao que leem o dashboard recebem leitura (Organizacao).
# Os valores das choices sao o contrato do NotaSync (ordem fixa; so se acrescenta no fim).
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "new_notamotorista"
$leitores = @("Acesso-Betinhos-MDA", "DEV - Usu$([char]0xE1)rio")
$chaveUnica = "new_chave_unica"

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function TextoLongo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "Text"; return $c
}
function Decimal([string] $Schema, [string] $Nome, [string] $Desc, [int] $Precisao, [double] $Min, [double] $Max) {
  $c = Base "DecimalAttributeMetadata" $Schema $Nome $Desc; $c.Precision = $Precisao; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
}
function Data([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
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
  (Texto "new_Chave" "Chave" "<funcionarioid>|90d, |AAAA-MM ou |AAAA-MM-DD. Chave alternativa do upsert." 100),
  (Escolha "PicklistAttributeMetadata" "new_Periodo" "Per$([char]0xED)odo" "" @("90 dias", "M$([char]0xEA)s", "Dia")),
  (Data "new_Data" "Data" "Dia (linhas Dia) ou 1o dia do m$([char]0xEA)s (linhas M$([char]0xEA)s)."),
  (DataHora "new_Inicio" "In$([char]0xED)cio" "In$([char]0xED)cio da janela consultada na Infleet."),
  (DataHora "new_Fim" "Fim" "Fim da janela consultada na Infleet."),
  (Escolha "PicklistAttributeMetadata" "new_Situacao" "Situa$([char]0xE7)$([char]0xE3)o" "Em forma$([char]0xE7)$([char]0xE3)o: menos de 50 km ou nota vazia na Infleet." @("Ok", "Em forma$([char]0xE7)$([char]0xE3)o")),
  (Decimal "new_Nota" "Nota" "Nota geral da Infleet (generalGrade)." 1 0 100),
  (Decimal "new_Km" "Km" "Km rodados no per$([char]0xED)odo." 1 0 10000000),
  (Decimal "new_Frenagem" "Frenagem brusca" "" 1 0 100),
  (Decimal "new_Curva" "Curva brusca" "" 1 0 100),
  (Decimal "new_Aceleracao" "Acelera$([char]0xE7)$([char]0xE3)o brusca" "" 1 0 100),
  (Decimal "new_Velocidade" "Excesso de velocidade" "" 1 0 100),
  (Decimal "new_MotorOcioso" "Motor ocioso" "" 1 0 100),
  (TextoLongo "new_OutrosComportamentos" "Outros comportamentos" "JSON [{chave, nota}] dos comportamentos de c$([char]0xE2)mera." 4000),
  (DataHora "new_SincronizadoEm" "Sincronizado em" "$([char]0xDA)ltima grava$([char]0xE7)$([char]0xE3)o pela sincroniza$([char]0xE7)$([char]0xE3)o.")
)

# Tabela
$entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
if ($entidade.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $table com $($colunas.Count + 1) colunas, o lookup new_motorista, a chave $chaveUnica e leitura para $($leitores -join ', ')."; return }
  $primaria = Texto "new_Name" "Nome" "Motorista e per$([char]0xED)odo." 100
  $primaria.IsPrimaryName = $true
  Invoke-Dv "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = "new_NotaMotorista"
    DisplayName = (Label "Nota do motorista"); DisplayCollectionName = (Label "Notas dos motoristas")
    Description = (Label "Nota de condu$([char]0xE7)$([char]0xE3)o da Infleet por motorista e per$([char]0xED)odo (90 dias, m$([char]0xEA)s e dia). Gravada s$([char]0xF3) pelo plugin (Custom API new_SincronizarNotasInfleet).")
    PrimaryNameAttribute = "new_name"; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false
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

# Lookup do motorista (cr40f_funcionarios). Delete = Cascade: a linha so existe para o motorista.
$rel = "cr40f_funcionarios_new_notamotorista_motorista"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.new_motorista." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = "cr40f_funcionarios"; ReferencedAttribute = "cr40f_funcionariosid"; ReferencingEntity = $table
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Cascade"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "new_Motorista"; DisplayName = (Label "Motorista"); Description = (Label "Motorista dono da nota."); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $table.new_motorista"
  }
}

# Chave alternativa do upsert (o indice fica Active em alguns minutos).
$chaves = @(Get-Rows "EntityDefinitions(LogicalName='$table')/Keys" "LogicalName" "LogicalName eq '$chaveUnica'")
if ($chaves.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a chave alternativa $chaveUnica (new_chave)." }
  else {
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Keys" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = $chaveUnica; DisplayName = (Label "Chave"); KeyAttributes = @("new_chave")
    } | Out-Null
    Write-Step "criada a chave alternativa $chaveUnica"
  }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
$motorista = Get-Coluna $table "new_motorista"
if (-not $motorista) { throw "Lookup new_motorista nao encontrado." }

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
Write-Step "OK: tabela $table com $($colunas.Count + 1) colunas e chave $chaveUnica na solucao $script:SolucaoDev."
