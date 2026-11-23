param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Composicao de Preco (cr40f_composicaodeprecos): o Ajuste digitado nao ficava gravado e nao entrava no Total.
# 1) A regra de negocio "0 Ajuste" 768c01bf usava a condicao NotNull e zerava todo ajuste preenchido (a irma 96415e6a,
#    Null -> 0, e a correta). A regra e desativada.
# 2) new_valortotal nao somava new_ajuste. O Dataverse recusa tirar atividades da formula, entao so acrescenta:
#    a ultima soma passa a sair em _19 e entram SelectFirstNonNull(_19) -> _18, Get(new_ajuste) -> _21,
#    SelectFirstNonNull(_21) -> _20 e Add(_18, _20) -> _1 (o mesmo encadeamento das outras parcelas), que continua sendo o valor gravado em new_valortotal.
# Idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_composicaodeprecos"
$regra = "768c01bf-4507-f111-8406-7ced8db11a3d"

# --- 1) regra de negocio "0 Ajuste" com NotNull ---
$wf = @(Get-Rows "workflows" "workflowid,name,statecode,category" "workflowid eq $regra")
if ($wf.Count -eq 0) { Write-Step "Regra $regra nao existe; nada a fazer." }
elseif ($wf[0].statecode -eq 0) { Write-Step "Regra '$($wf[0].name)' ja desativada." }
elseif (-not $Apply) { Write-Step "DRY RUN desativaria a regra '$($wf[0].name)' ($regra)." }
else {
  Invoke-Dv "PATCH" "workflows($regra)" @{ statecode = 0; statuscode = 1 } | Out-Null
  if ((Invoke-Dv "GET" "workflows($regra)?`$select=statecode").statecode -ne 0) { throw "Regra $regra continua ativa." }
  Write-Step "OK: regra '$($wf[0].name)' desativada."
}

# --- 2) Ajuste no Total ---
$path = "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='new_valortotal')/Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
$attr = Invoke-Dv "GET" $path
$xaml = [string] $attr.FormulaDefinition
if ($xaml.Contains('Attribute="new_ajuste"')) { Write-Step "new_valortotal ja soma o Ajuste; nada a fazer."; return }

$ultimaSoma = '[New Object() { SetAttributeValueStep4_2, SetAttributeValueStep4_16 }]</InArgument>'
$i = $xaml.IndexOf($ultimaSoma)
if ($i -lt 0 -or $xaml.IndexOf($ultimaSoma, $i + 1) -ge 0) { throw "Ultima soma do Total nao encontrada uma unica vez. Formula mudou, revisar a migration." }
$saida = '<OutArgument x:TypeArguments="x:Object" x:Key="Result">[SetAttributeValueStep4_1]</OutArgument>'
$estrutura = "Estrutura do fim do Total diferente do esperado. Revisar a migration."
$j = $xaml.IndexOf($saida, $i)
if ($j -lt 0) { throw $estrutura }
$fim = $xaml.IndexOf('</mxswa:ActivityReference>', $j)
if ($fim -lt 0) { throw $estrutura }
$set = $xaml.IndexOf('<mxswa:SetEntityProperty Attribute="new_valortotal"', $fim)
if ($set -lt 0) { throw $estrutura }
$fim += '</mxswa:ActivityReference>'.Length
foreach ($n in 18..21) { if ($xaml.Contains("SetAttributeValueStep4_$n]") -or $xaml.Contains("Name=`"SetAttributeValueStep4_$n`"")) { throw "Variavel _$n ja existe. Revisar a migration." } }

$money = '<mxswa:ReferenceLiteral x:TypeArguments="s:Type" Value="mxs:Money" />'
$expr = 'Microsoft.Crm.Workflow.Activities.EvaluateExpression, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35'
function Expr([string] $Op, [string] $Params, [string] $Out) {
  return "<mxswa:ActivityReference AssemblyQualifiedName=`"$expr`" DisplayName=`"EvaluateExpression`"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments=`"x:String`" x:Key=`"ExpressionOperator`">$Op</InArgument><InArgument x:TypeArguments=`"s:Object[]`" x:Key=`"Parameters`">[New Object() { $Params }]</InArgument><InArgument x:TypeArguments=`"s:Type`" x:Key=`"TargetType`">$money</InArgument><OutArgument x:TypeArguments=`"x:Object`" x:Key=`"Result`">[$Out]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>"
}
$get = "<mxswa:GetEntityProperty Attribute=`"new_ajuste`" Entity=`"[InputEntities(&quot;primaryEntity&quot;)]`" EntityName=`"$table`" Value=`"[SetAttributeValueStep4_21]`"><mxswa:GetEntityProperty.TargetType><InArgument x:TypeArguments=`"s:Type`">$money</InArgument></mxswa:GetEntityProperty.TargetType></mxswa:GetEntityProperty>"
$novosPassos = (Expr "SelectFirstNonNull" "SetAttributeValueStep4_19" "SetAttributeValueStep4_18") + $get + (Expr "SelectFirstNonNull" "SetAttributeValueStep4_21" "SetAttributeValueStep4_20") + (Expr "Add" "SetAttributeValueStep4_18, SetAttributeValueStep4_20" "SetAttributeValueStep4_1")

$bloco = $xaml.Substring($i, $fim - $i).Replace('[SetAttributeValueStep4_1]', '[SetAttributeValueStep4_19]')
$novo = $xaml.Substring(0, $i) + $bloco + $novosPassos + $xaml.Substring($fim)
$decl = '<Variable x:TypeArguments="x:Object" Name="SetAttributeValueStep4_1" />'
if (([regex]::Matches($novo, [regex]::Escape($decl))).Count -ne 1) { throw "Declaracao da variavel _1 nao encontrada uma unica vez." }
$extras = (18..21 | ForEach-Object { "<Variable x:TypeArguments=`"x:Object`" Name=`"SetAttributeValueStep4_$_`" />" }) -join ''
$novo = $novo.Replace($decl, $decl + $extras)

if (-not $Apply) { Write-Step "DRY RUN acrescentaria new_ajuste em $table.new_valortotal. Use -Apply para aplicar."; return }

$corpo = @{ "@odata.type" = "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata" }
foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike '@odata.*') { $corpo[$p.Name] = $p.Value } }
$corpo["FormulaDefinition"] = $novo
Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$table')/Attributes($($attr.MetadataId))" $corpo | Out-Null
Publish-Tabela $table

if (-not ([string] (Invoke-Dv "GET" $path).FormulaDefinition).Contains('Attribute="new_ajuste"')) { throw "PUT nao gravou a formula nova." }
Write-Step "OK: $table.new_valortotal soma o Ajuste."
