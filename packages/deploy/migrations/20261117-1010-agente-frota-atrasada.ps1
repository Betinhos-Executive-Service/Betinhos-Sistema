param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Agente Frota (packages/agentes-ia/src/tipos.ts): o tipo de proposta FrotaAgendadaVencida passa a se chamar
# FrotaAtrasada no mesmo valor do choice (100000018 = 100000000 + posicao em TODOS_OS_TIPOS). O
# provision-agentes-schema.ps1 so acrescenta opcoes novas e nao renomeia a existente; esta migration troca o
# rotulo. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_agenteproposta"
$coluna = "cr40f_tipo"
$valor = 100000018

# Rotulo em pt-BR (1046); opcao sem esse idioma conta como vazia.
function Rotulo($Opcao) {
  $l = @($Opcao.Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })
  if ($l.Count -eq 0) { return "" }
  return $l[0].Label
}

$os = (Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet").OptionSet
$opcao = @($os.Options | Where-Object { $_.Value -eq $valor })
if ($opcao.Count -ne 1) { throw "$table.$coluna sem a opcao $valor." }
$rotulo = Rotulo $opcao[0]
if ($rotulo -eq "FrotaAtrasada") { Write-Step "rotulo $valor ja e FrotaAtrasada"; return }
if ($rotulo -ne "FrotaAgendadaVencida") { throw "Opcao $valor tem o rotulo '$rotulo'; esperado FrotaAgendadaVencida." }
if (-not $Apply) { Write-Step "DRY RUN trocaria o rotulo de $valor para FrotaAtrasada"; return }

# Choice global usa OptionSetName; local usa tabela e coluna. UpdateOptionValue nao recebe SolutionUniqueName.
$body = if ($os.IsGlobal) { @{ OptionSetName = $os.Name } } else { @{ EntityLogicalName = $table; AttributeLogicalName = $coluna } }
$body.Value = $valor; $body.Label = (Label "FrotaAtrasada"); $body.MergeLabels = $true
Invoke-Dv "POST" "UpdateOptionValue" $body | Out-Null

# Choice global nao entra na publicacao da tabela: publica o optionset junto.
if ($os.IsGlobal) {
  Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$table</entity></entities><optionsets><optionset>$($os.Name)</optionset></optionsets></importexportxml>" } | Out-Null
  Write-Step "tabela e optionset $($os.Name) publicados"
} else { Publish-Tabela $table }
Write-Step "rotulo $valor = FrotaAtrasada"
