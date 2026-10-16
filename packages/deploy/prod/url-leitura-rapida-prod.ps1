# Somente PROD. Lê do Power Automate a URL do gatilho HTTP do "Flow Despesas | Leitura rápida" de PROD e grava como
# VALOR ATUAL de new_FlowURLDespesaLeituraRapida, fora da solução AppBetinhos (sem o cabeçalho MSCRM.SolutionUniqueName),
# para nunca ir num export. A URL nunca é impressa. O flow precisa estar ativo (rode antes ativar-despesas-ia-prod.ps1).
. "$PSScriptRoot/_prod.ps1"
$flowName = 'Flow Despesas | Leitura rápida'
$varName = 'new_FlowURLDespesaLeituraRapida'

AssertProd
$f = GetFlow $flowName
if ($f.statecode -ne 1) { throw "'$flowName' está desligado no PROD." }
$sol = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq 'AppBetinhos'").value)
if ($sol.Count -ne 1) { throw 'Solução AppBetinhos ausente no PROD.' }

$flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
$callback = $null
for ($i = 1; $i -le 3 -and -not $callback; $i++) {
  try {
    $callback = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$script:ProdEnvironmentId/flows/$($f.resourceid)/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json' -Body '{}' -TimeoutSec 30).response.value
  } catch { if ($i -eq 3) { throw }; Start-Sleep -Seconds 3 }
}
if (-not $callback) { throw 'URL do gatilho indisponível.' }
if (([Uri]$callback).Host -notlike '6847878f5a6fe08baed6d7119975e3*') { $callback = $null; throw 'A URL do gatilho não é do ambiente de flows do PROD.' }

$ev = EnvVarValueCount $varName
if ($ev.Count -gt 1) { $callback = $null; throw "$varName com valores ambíguos." }
if ($ev.Count) { Dv PATCH "environmentvariablevalues($($ev.ValueIds[0]))" @{ value = $callback } | Out-Null }
else { Dv POST environmentvariablevalues @{ schemaname = "${varName}_prod"; value = $callback; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($($ev.DefinitionId))" } | Out-Null }
$callback = $null

$after = EnvVarValueCount $varName
if ($after.Count -ne 1) { throw "$varName sem valor após gravar." }
$naSolucao = @((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($sol[0].solutionid) and objectid eq $($after.ValueIds[0])").value).Count
if ($naSolucao) { throw "O valor de $varName entrou na AppBetinhos; retire antes de exportar." }
Write-Output "PROD: $varName com valor atual (gatilho de PROD, não impresso), fora da AppBetinhos."
