param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Coluna calculada new_subtotal (cr40f_composicaodeprecos) somava cr40f_valorarcometropolitano duas vezes
# (provado em 5.000 linhas do PROD em 11/11/2026). Tira o segundo termo da formula: o GetEntityProperty do arco que
# grava SetAttributeValueStep4_29, o SelectFirstNonNull (_28) e o Add (_17), e liga o SelectFirstNonNull seguinte
# direto no resultado anterior (_18). Idempotente: com o arco uma vez so, nada muda. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_composicaodeprecos"
$path = "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='new_subtotal')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
$attr = Invoke-Dv "GET" $path
$xaml = [string] $attr.FormulaDefinition
$arco = ([regex]::Matches($xaml, 'Attribute="cr40f_valorarcometropolitano"')).Count
if ($arco -eq 1) { Write-Step "new_subtotal ja soma o arco uma vez; nada a fazer."; return }
if ($arco -ne 2) { throw "new_subtotal com $arco referencias ao arco; esperado 2. Formula mudou, revisar a migration." }

$atividade = '<mxswa:ActivityReference AssemblyQualifiedName="[^"]*" DisplayName="EvaluateExpression">(?:(?!</mxswa:ActivityReference>).)*?Result">\[{0}\]</OutArgument></mxswa:ActivityReference\.Arguments></mxswa:ActivityReference>'
$cortes = @(
  '<mxswa:GetEntityProperty Attribute="cr40f_valorarcometropolitano"[^>]*Value="\[SetAttributeValueStep4_29\]">.*?</mxswa:GetEntityProperty>',
  ($atividade -f 'SetAttributeValueStep4_28'),
  ($atividade -f 'SetAttributeValueStep4_17')
)
$novo = $xaml
foreach ($corte in $cortes) {
  $re = [regex]::new($corte, [Text.RegularExpressions.RegexOptions]::Singleline)
  if ($re.Matches($novo).Count -ne 1) { throw "Trecho nao encontrado uma unica vez: $corte" }
  $novo = $re.Replace($novo, "", 1)
}
if (([regex]::Matches($novo, '\{ SetAttributeValueStep4_17 \}')).Count -ne 1) { throw "Ligacao do SetAttributeValueStep4_17 nao encontrada uma unica vez." }
$novo = $novo.Replace('{ SetAttributeValueStep4_17 }', '{ SetAttributeValueStep4_18 }')
if (([regex]::Matches($novo, 'Attribute="cr40f_valorarcometropolitano"')).Count -ne 1) { throw "Formula resultante nao ficou com o arco uma vez." }

if (-not $Apply) { Write-Step "DRY RUN tiraria o segundo arco de $table.new_subtotal. Use -Apply para aplicar."; return }

$corpo = @{}
foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike '@odata.context') { $corpo[$p.Name] = $p.Value } }
$corpo["FormulaDefinition"] = $novo
Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$table')/Attributes($($attr.MetadataId))" $corpo | Out-Null
Publish-Tabela $table

$conferido = [string] (Invoke-Dv "GET" $path).FormulaDefinition
if (([regex]::Matches($conferido, 'Attribute="cr40f_valorarcometropolitano"')).Count -ne 1) { throw "PUT nao gravou a formula nova." }
Write-Step "OK: $table.new_subtotal soma o arco uma vez."
