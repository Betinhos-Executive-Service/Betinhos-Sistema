param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acesso amplo legado: coluna cr40f_amplo em cr40f_acessohistorico com os papeis retirados ou devolvidos
# (JSON {acao, papeis:[{id, nome}]}). So o plugin Cr40f.Acesso grava, como SYSTEM.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_acessohistorico"
$logical = "cr40f_amplo"

if (@(Get-Rows "EntityDefinitions" "MetadataId" "LogicalName eq '$table'").Count -ne 1) { throw "Tabela $table nao existe (rode antes a 20261123-1400)." }

$found = Get-Coluna $table $logical
if (-not $found) {
  if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical (texto longo, 4000)."; return }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Amplo"
    DisplayName = (Label "Acesso amplo"); RequiredLevel = @{ Value = "None" }; MaxLength = 4000; Format = "Text"
    Description = (Label "JSON dos pap$([char]0xE9)is do acesso amplo legado retirados ou devolvidos (nome e id).")
  } | Out-Null
  $found = Get-Coluna $table $logical
  if (-not $found) { throw "Coluna $logical nao foi criada." }
  Write-Step "criada $table.$logical"
} else {
  Write-Step "$table.$logical ja existe: confere solucao e publicacao."
}
if (-not $Apply) { Write-Step "DRY RUN: colocaria $table.$logical na solucao e publicaria."; return }
Add-ComponenteNaSolucao $found.MetadataId 2
Publish-Tabela $table
