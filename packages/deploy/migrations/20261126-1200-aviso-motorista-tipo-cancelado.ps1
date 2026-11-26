param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Aviso ao motorista de servico cancelado (docs/features/aviso-cancelamento-motorista/spec.md).
# Opcao nova "Cancelado" (100000002) no choice local new_avisomotorista.new_tipo, depois de Novo (100000000) e Retirado (100000001).
# Aditiva e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "new_avisomotorista"
$coluna = "new_tipo"
$valor = 100000002
$rotulo = "Cancelado"

function Rotulo($Opcao) {
  $l = @($Opcao.Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })
  if ($l.Count -eq 0) { return "" }
  return $l[0].Label
}

$m = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Name,IsGlobal,Options)"
if ([bool] $m.OptionSet.IsGlobal) { throw "$tabela.$coluna deveria ser choice local." }
$opcoes = @($m.OptionSet.Options)
$porValor = @($opcoes | Where-Object { $_.Value -eq $valor })
if ($porValor.Count -eq 1) {
  if ((Rotulo $porValor[0]) -eq $rotulo) { Write-Step "opcao $valor ($rotulo) ja existe em $tabela.$coluna"; return }
  throw "Valor $valor ja usado por '$(Rotulo $porValor[0])' em $tabela.$coluna."
}
if (@($opcoes | Where-Object { (Rotulo $_) -eq $rotulo }).Count -gt 0) { throw "$tabela.$coluna ja tem '$rotulo' com outro valor." }
if (-not $Apply) { Write-Step "DRY RUN criaria $valor = $rotulo em $tabela.$coluna"; return }

Invoke-Dv "POST" "InsertOptionValue" @{ EntityLogicalName = $tabela; AttributeLogicalName = $coluna; Value = $valor; Label = (Label $rotulo); SolutionUniqueName = $script:SolucaoDev } | Out-Null
Publish-Tabela $tabela
Write-Step "opcao $valor = $rotulo criada em $tabela.$coluna e $tabela publicada"
