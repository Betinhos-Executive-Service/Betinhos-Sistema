param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Rotulo da coluna cr40f_funcionarios.cr40f_recebeemailmultas: o e-mail "Multas de hoje" passou a semanal
# (toda quarta 08:00, PR #635). DisplayName "E-mail semanal de multas" e descricao nova; so rotulos, sem mudar o tipo.
# Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_funcionarios"
$coluna = "cr40f_recebeemailmultas"
$rotulo = "E-mail semanal de multas"
$descricao = "Recebe o e-mail das multas (toda quarta, 08:00)."
$caminho = "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='$coluna')"

function Texto1046($L) {
  $l = @($L.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })
  if ($l.Count -eq 0) { return "" }
  return $l[0].Label
}

$attr = Invoke-Dv "GET" "$caminho/Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
if ((Texto1046 $attr.DisplayName) -ceq $rotulo -and (Texto1046 $attr.Description) -ceq $descricao) { Write-Step "$tabela.$coluna ja tem o rotulo '$rotulo'"; return }
if (-not $Apply) { Write-Step "DRY RUN trocaria o rotulo de $tabela.$coluna de '$(Texto1046 $attr.DisplayName)' para '$rotulo'"; return }

# PUT do atributo exige a definicao inteira; MergeLabels preserva os rotulos de outros idiomas.
$corpo = @{}
foreach ($p in $attr.PSObject.Properties) { if ($p.Name -notlike "@odata.*") { $corpo[$p.Name] = $p.Value } }
$corpo["@odata.type"] = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
$corpo.DisplayName = (Label $rotulo)
$corpo.Description = (Label $descricao)
Invoke-Dv "PUT" $caminho $corpo @{ "MSCRM.MergeLabels" = "true" } | Out-Null
Publish-Tabela $tabela
Write-Step "$tabela.$coluna agora se chama '$rotulo'"
