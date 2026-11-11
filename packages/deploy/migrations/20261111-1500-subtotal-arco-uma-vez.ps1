param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Coluna calculada new_subtotal (cr40f_composicaodeprecos) somava cr40f_valorarcometropolitano duas vezes
# (provado em 5.000 linhas do PROD em 11/11/2026). Troca minima: o Add do segundo arco (Result _17) passa a somar sobre
# o valor anterior ao primeiro arco (_20) em vez de _18; o ramo do primeiro arco fica sem uso. Remover as atividades
# foi recusado pelo Dataverse ("Method call SelectFirstNonNull is not supported"). Mesma troca aplicada no PROD como
# hotfix em 11/11/2026. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_composicaodeprecos"
$path = "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='new_subtotal')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
$attr = Invoke-Dv "GET" $path
$xaml = [string] $attr.FormulaDefinition
$antes = '{ SetAttributeValueStep4_18, SetAttributeValueStep4_28 }'
$depois = '{ SetAttributeValueStep4_20, SetAttributeValueStep4_28 }'
if ($xaml.Contains($depois)) { Write-Step "new_subtotal ja soma o arco uma vez; nada a fazer."; return }
$vezes = ([regex]::Matches($xaml, [regex]::Escape($antes))).Count
$base = ([regex]::Matches($xaml, [regex]::Escape('{ SetAttributeValueStep4_20, SetAttributeValueStep4_26 }'))).Count
if ($vezes -ne 1 -or $base -ne 1) { throw "Formula de new_subtotal fora do formato esperado; revisar a migration." }
$novo = $xaml.Replace($antes, $depois)

if (-not $Apply) { Write-Step "DRY RUN tiraria o segundo arco de $table.new_subtotal. Use -Apply para aplicar."; return }

$corpo = @{}
foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike '@odata.context') { $corpo[$p.Name] = $p.Value } }
$corpo["FormulaDefinition"] = $novo
$corpo["@odata.type"] = "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$table')/Attributes($($attr.MetadataId))" $corpo | Out-Null
Publish-Tabela $table

$conferido = [string] (Invoke-Dv "GET" $path).FormulaDefinition
if (-not $conferido.Contains($depois)) { throw "PUT nao gravou a formula nova." }
Write-Step "OK: $table.new_subtotal soma o arco uma vez."
