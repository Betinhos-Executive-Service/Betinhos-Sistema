param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Coluna calculada new_subtotal (cr40f_composicaodeprecos) somava cr40f_valorarcometropolitano duas vezes
# (provado em 5.000 linhas do PROD em 11/11/2026). O Dataverse recusa tirar atividades da formula, entao a correcao
# e uma troca: o SelectFirstNonNull do segundo arco (_28) passa a somar com o resultado sem o arco (_20) em vez do
# resultado que ja tinha o arco (_18). As duas referencias ao arco continuam no XAML; so a primeira entra na soma.
# Idempotente: com a ligacao nova, nada muda. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_composicaodeprecos"
$path = "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='new_subtotal')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
$antes = '{ SetAttributeValueStep4_18, SetAttributeValueStep4_28 }'
$depois = '{ SetAttributeValueStep4_20, SetAttributeValueStep4_28 }'
$attr = Invoke-Dv "GET" $path
$xaml = [string] $attr.FormulaDefinition
if ($xaml.Contains($depois)) { Write-Step "new_subtotal ja soma o arco uma vez; nada a fazer."; return }
if (([regex]::Matches($xaml, [regex]::Escape($antes))).Count -ne 1) { throw "Ligacao $antes nao encontrada uma unica vez. Formula mudou, revisar a migration." }
$novo = $xaml.Replace($antes, $depois)

if (-not $Apply) { Write-Step "DRY RUN religaria o segundo arco de $table.new_subtotal. Use -Apply para aplicar."; return }

$corpo = @{ "@odata.type" = "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata" }
foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike '@odata.*') { $corpo[$p.Name] = $p.Value } }
$corpo["FormulaDefinition"] = $novo
Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$table')/Attributes($($attr.MetadataId))" $corpo | Out-Null
Publish-Tabela $table

if (-not ([string] (Invoke-Dv "GET" $path).FormulaDefinition).Contains($depois)) { throw "PUT nao gravou a formula nova." }
Write-Step "OK: $table.new_subtotal soma o arco uma vez."
