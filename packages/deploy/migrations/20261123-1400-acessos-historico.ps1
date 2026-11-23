param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: tabela cr40f_acessohistorico (quem mudou o acesso de quem, antes e depois).
# So o plugin Cr40f.Acesso grava (como SYSTEM). A leitura vem do papel "Perfil - Administrador de acessos",
# aplicado pela migration 20261123-1410. Nenhum papel recebe privilegio aqui.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_acessohistorico"

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function TextoLongo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "Text"; return $c
}

$entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
if ($entidade.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $table com 2 colunas de texto longo e 2 lookups."; return }
  $primaria = Texto "cr40f_Name" "Nome" "Nome da pessoa que teve o acesso alterado." 200
  $primaria.IsPrimaryName = $true
  Invoke-Dv "POST" "EntityDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = "cr40f_AcessoHistorico"
    DisplayName = (Label "Hist$([char]0xF3)rico de acesso"); DisplayCollectionName = (Label "Hist$([char]0xF3)rico de acessos")
    Description = (Label "Quem alterou o acesso de quem, com os perfis antes e depois.")
    PrimaryNameAttribute = "cr40f_name"; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false
    IsAuditEnabled = @{ Value = $true }
    Attributes = @($primaria)
  } | Out-Null
  $entidade = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$table'")
  if ($entidade.Count -ne 1) { throw "Tabela $table nao apareceu depois do POST." }
  Write-Step "criada a tabela $table"
}

$colunas = @(
  (TextoLongo "cr40f_PerfisAntes" "Perfis antes" "JSON dos perfis antes da altera$([char]0xE7)$([char]0xE3)o." 4000),
  (TextoLongo "cr40f_PerfisDepois" "Perfis depois" "JSON dos perfis depois da altera$([char]0xE7)$([char]0xE3)o." 4000)
)
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

$lookups = @(
  @{ Rel = "cr40f_systemuser_cr40f_acessohistorico_Usuario"; Schema = "cr40f_Usuario"; Nome = "Usu$([char]0xE1)rio"; Desc = "Pessoa que teve o acesso alterado." },
  @{ Rel = "cr40f_systemuser_cr40f_acessohistorico_AlteradoPor"; Schema = "cr40f_AlteradoPor"; Nome = "Alterado por"; Desc = "Quem fez a altera$([char]0xE7)$([char]0xE3)o." }
)
foreach ($l in $lookups) {
  $logical = $l.Schema.ToLowerInvariant()
  if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$($l.Rel)'").Count -gt 0) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.$logical."; continue }
  Invoke-Dv "POST" "RelationshipDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $l.Rel
    ReferencedEntity = "systemuser"; ReferencedAttribute = "systemuserid"; ReferencingEntity = $table
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $l.Schema; DisplayName = (Label $l.Nome); Description = (Label $l.Desc); RequiredLevel = @{ Value = "None" } }
  } | Out-Null
  Write-Step "criado lookup $table.$logical"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
Add-ComponenteNaSolucao $entidade[0].MetadataId 1
Publish-Tabela $table
