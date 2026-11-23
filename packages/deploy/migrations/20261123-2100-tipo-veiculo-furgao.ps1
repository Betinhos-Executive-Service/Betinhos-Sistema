param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Tipo de veiculo "Furgao" no choice global cr40f_carrotipodeveiculo (usado por cr40f_reservadeveculos.cr40f_tipodeveiculo
# e demais colunas de tipo de veiculo). Valor 100000003, depois de Micro-onibus (100000001) e Minivan (100000002).
# Aditiva e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$optionSet = "cr40f_carrotipodeveiculo"
$valor = 100000003
$rotulo = "Furg$([char]0xE3)o"

function Rotulo($Opcao) {
  $l = @($Opcao.Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })
  if ($l.Count -eq 0) { return "" }
  return $l[0].Label
}

$os = Invoke-Dv "GET" "GlobalOptionSetDefinitions(Name='$optionSet')"
$porValor = @($os.Options | Where-Object { $_.Value -eq $valor })
if ($porValor.Count -eq 1) {
  if ((Rotulo $porValor[0]) -eq $rotulo) { Write-Step "opcao $valor ($rotulo) ja existe"; return }
  throw "Valor $valor ja usado por '$(Rotulo $porValor[0])' em $optionSet."
}
if (@($os.Options | Where-Object { (Rotulo $_) -eq $rotulo }).Count -gt 0) { throw "$optionSet ja tem '$rotulo' com outro valor." }
if (-not $Apply) { Write-Step "DRY RUN criaria $valor = $rotulo em $optionSet"; return }

Invoke-Dv "POST" "InsertOptionValue" @{ OptionSetName = $optionSet; Value = $valor; Label = (Label $rotulo); SolutionUniqueName = $script:SolucaoDev } | Out-Null
Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><optionsets><optionset>$optionSet</optionset></optionsets></importexportxml>" } | Out-Null
Write-Step "opcao $valor = $rotulo criada e $optionSet publicado"
