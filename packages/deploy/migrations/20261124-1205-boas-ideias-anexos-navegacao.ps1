param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Substitui 20261124-1200-boas-ideias-anexos.ps1 (falhou no DEV no PUT parcial do relacionamento); mesmo conteudo sem o PUT.
# Anexos (fotos e videos) das Boas ideias do App Motoristas: tabela cr40f_boasideiaanexo (uma linha por arquivo),
# lookup cr40f_ideia -> cr40f_boasideias (Delete em cascata: apagar a ideia apaga os anexos) e privilegios.
# O link vem do flow que grava no SharePoint; a tabela guarda so o link, o nome e o tipo.
# Privilegios: Acesso-Motoristas recebe Create/Read/Write/Append Basic na tabela nova e AppendTo Basic em cr40f_boasideias
# (so acrescenta: nunca rebaixa nem remove). Acesso-Betinhos-MDA, Acesso-Betinhos-Canvas e "DEV - Usuario" recebem tudo Global.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_boasideiaanexo"
$pai = "cr40f_boasideias"
$motorista = "Acesso-Motoristas"
$gestao = @("Acesso-Betinhos-MDA", "Acesso-Betinhos-Canvas", "DEV - Usu$([char]0xE1)rio")
$ordemProf = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = $Min; $c.MaxValue = 2147483647; return $c
}
function Escolha([string] $Schema, [string] $Nome, [string] $Desc, [string[]] $Rotulos) {
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label $r) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

$colunas = @(
  (Texto "cr40f_link" "Link do arquivo" "Link do arquivo no SharePoint, devolvido pelo flow de salvar arquivos." 2000),
  (Texto "cr40f_nomearquivo" "Nome do arquivo" "Nome original do arquivo enviado." 200),
  (Escolha "cr40f_tipomidia" "Tipo de m$([char]0xED)dia" "Foto ou v$([char]0xED)deo." @("Foto", "V$([char]0xED)deo")),
  (Inteiro "cr40f_ordem" "Ordem" "Posi$([char]0xE7)$([char]0xE3)o do anexo na ideia." 0),
  (Inteiro "cr40f_tamanhobytes" "Tamanho (bytes)" "Tamanho do arquivo enviado." 0)
)

# Tabela
$entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
if ($entidade.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $table com $($colunas.Count + 1) colunas, o lookup cr40f_ideia e os privilegios dos papeis."; return }
  $primaria = Texto "cr40f_name" "Nome" "Identifica o anexo na tela." 100
  $primaria.IsPrimaryName = $true
  Invoke-Dv "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = "cr40f_BoasIdeiaAnexo"
    DisplayName = (Label "Anexo de boa ideia"); DisplayCollectionName = (Label "Anexos de boas ideias")
    Description = (Label "Foto ou v$([char]0xED)deo anexado a uma boa ideia pelo App Motoristas.")
    PrimaryNameAttribute = "cr40f_name"; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false
    Attributes = @($primaria)
  } | Out-Null
  $entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
  if ($entidade.Count -ne 1) { throw "Tabela $table nao apareceu depois do POST." }
  Write-Step "criada a tabela $table"
}
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  if (Get-Coluna $table $logical) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical."; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
  if (-not (Get-Coluna $table $logical)) { throw "Coluna $logical nao foi criada." }
  Write-Step "criada $table.$logical"
}

# Lookup da ideia
$rel = "cr40f_boasideias_cr40f_boasideiaanexo_ideia"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.cr40f_ideia." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = $pai; ReferencedAttribute = "cr40f_boasideiasid"; ReferencingEntity = $table
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Cascade"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      AssociatedMenuConfiguration = @{ Behavior = "DoNotDisplay" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_ideia"; DisplayName = (Label "Ideia"); Description = (Label "Boa ideia a que o anexo pertence."); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $table.cr40f_ideia"
  }
}
if (-not $Apply) {
  Write-Step "DRY RUN concederia Create/Read/Write/Append Basic a $motorista (e AppendTo Basic em $pai) e tudo Global a $($gestao -join ', '), sem rebaixar."
  Write-Step "dry-run: nada gravado."; return
}
if (-not (Get-Coluna $table "cr40f_ideia")) { throw "Lookup cr40f_ideia nao encontrado." }

# Navegacao: o App usa so a do lookup (cr40f_ideia@odata.bind e _cr40f_ideia_value), que nasce com o nome do lookup.
# A 1200 tentava renomear tambem a colecao com um PUT parcial do relacionamento, que o Dataverse recusa
# ("Nullable object must have a value"); a colecao fica com o nome padrao, que ninguem usa.
$relMeta = @(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId,ReferencingEntityNavigationPropertyName" "SchemaName eq '$rel'")
if ($relMeta.Count -ne 1) { throw "Relacionamento $rel nao encontrado." }
if ($relMeta[0].ReferencingEntityNavigationPropertyName -ne "cr40f_ideia") {
  throw "Navegacao do lookup de $rel e '$($relMeta[0].ReferencingEntityNavigationPropertyName)', esperado 'cr40f_ideia' (o App grava cr40f_ideia@odata.bind)."
}

Add-ComponenteNaSolucao $entidade[0].MetadataId 1
Publish-Tabela $table

# Privilegios: so acrescenta; nunca rebaixa nem remove
$privs = @{}
foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'$table')")) { $privs[$p.name.ToLowerInvariant()] = $p.privilegeid }
foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "name eq 'prvAppendTo$pai'")) { $privs[$p.name.ToLowerInvariant()] = $p.privilegeid }

function Get-Profundidades([string] $RoleId) {
  $mapa = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $RoleId")) { $mapa[[string]$rp.privilegeid] = [int]$rp.privilegedepthmask }
  return $mapa
}
function Grant-Role([string] $Nome, [hashtable] $Pedido) {
  $papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$($Nome.Replace("'", "''"))' and _parentroleid_value eq null")
  if ($papeis.Count -ne 1) { throw "Papel '$Nome' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
  $papel = $papeis[0]
  $atual = Get-Profundidades $papel.roleid
  $concessoes = @()
  foreach ($nomePriv in @($Pedido.Keys | Sort-Object)) {
    $chave = $nomePriv.ToLowerInvariant()
    if (-not $privs.ContainsKey($chave)) { throw "Privilegio $nomePriv nao existe." }
    $id = [string]$privs[$chave]; $depth = $Pedido[$nomePriv]
    if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordemProf[$depth]) { continue }
    $concessoes += @{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $nomePriv }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$Nome ja tem tudo: nada a conceder"; return }
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = Get-Profundidades $papel.roleid
  foreach ($c in $concessoes) {
    $id = [string]$c.PrivilegeId
    if (-not $depois.ContainsKey($id) -or $depois[$id] -lt $ordemProf[$c.Depth]) { throw "$Nome ficou sem $($c.PrivilegeName) em $($c.Depth)." }
  }
  Write-Step "$Nome recebeu: $(($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ', ')"
}

$pedidoMotorista = @{ "prvCreate$table" = "Basic"; "prvRead$table" = "Basic"; "prvWrite$table" = "Basic"; "prvAppend$table" = "Basic"; "prvAppendTo$pai" = "Basic" }
Grant-Role $motorista $pedidoMotorista
$pedidoGestao = @{}
foreach ($v in @("Create", "Read", "Write", "Append", "AppendTo", "Delete")) { $pedidoGestao["prv$v$table"] = "Global" }
foreach ($nome in $gestao) { Grant-Role $nome $pedidoGestao }

Write-Step "OK: tabela $table com $($colunas.Count + 1) colunas e lookup cr40f_ideia na solucao $script:SolucaoDev."
