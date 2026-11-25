param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)
# Corrige 4 colunas de data de cr40f_jornadacolaborador que no DEV estao com DateTimeBehavior vazio (metadata corrompida).
# Com isso o Dataverse nao consegue regerar a view Filteredcr40f_jornadacolaborador e recusa ligar "Record ownership across
# business units" (erro 0x80040216). O PROD ja tem as 4 como UserLocal; aqui so preenche o que esta vazio, sem converter dado.
# Idempotente. Somente DEV.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_jornadacolaborador"
$colunas = @("cr40f_data", "cr40f_iniciojornada", "cr40f_fimjornada", "cr40f_importadoem")
$mudou = $false
foreach ($nome in $colunas) {
  $path = "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='$nome')/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
  $col = Invoke-Dv "GET" $path
  if ($col.DateTimeBehavior -and $col.DateTimeBehavior.Value) { Write-Step "$tabela.$nome ja e $($col.DateTimeBehavior.Value)"; continue }
  if (-not $Apply) { Write-Step "DRY RUN poria $tabela.$nome como UserLocal"; continue }
  $corpo = @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata" }
  foreach ($p in $col.PSObject.Properties) { if ($p.Name -notlike '@odata.*') { $corpo[$p.Name] = $p.Value } }
  $corpo["DateTimeBehavior"] = @{ Value = "UserLocal" }
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$tabela')/Attributes($($col.MetadataId))" $corpo | Out-Null
  if ((Invoke-Dv "GET" $path).DateTimeBehavior.Value -ne "UserLocal") { throw "PUT nao gravou UserLocal em $tabela.$nome." }
  Write-Step "$tabela.$nome = UserLocal"
  $mudou = $true
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
if ($mudou) { Publish-Tabela $tabela }
Write-Step "OK: as 4 datas de $tabela com DateTimeBehavior preenchido."
