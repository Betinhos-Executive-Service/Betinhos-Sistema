# Somente PROD. Ativa "Flow Despesas | Análise IA" e "Flow Despesas | Leitura rápida".
# Pré-requisito: new_AnthropicKeyDespesasAnalise e new_AnthropicKeyDespesasLeitura com valor no PROD (o valor padrão vem
# com a solução; este script só confere, nunca lê o valor). Não altera definição de flow.
# Para desligar: -Desativar (volta os dois flows para Rascunho).
param([switch] $Desativar)
. "$PSScriptRoot/_prod.ps1"
$flowsIa = @('Flow Despesas | Análise IA', 'Flow Despesas | Leitura rápida')

AssertProd
if ($Desativar) {
  foreach ($n in $flowsIa) { $f = GetFlow $n; if ($f.statecode -ne 0) { Dv PATCH "workflows($($f.workflowid))" @{ statecode = 0 } | Out-Null }; Write-Output "PROD: '$n' statecode=$((GetFlow $n).statecode)" }
  return
}

foreach ($v in 'new_AnthropicKeyDespesasAnalise', 'new_AnthropicKeyDespesasLeitura') {
  $key = EnvVarValueCount $v
  $padrao = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$v' and defaultvalue ne null").value).Count
  if (-not $padrao -and $key.Count -ne 1) { throw "$v sem valor padrão nem valor atual no PROD; importe a solução com a chave antes de ativar." }
}

foreach ($n in $flowsIa) {
  $f = GetFlow $n
  if ($f.statecode -ne 1) { Dv PATCH "workflows($($f.workflowid))" @{ statecode = 1 } | Out-Null }
  $s = (GetFlow $n).statecode
  if ($s -ne 1) { throw "'$n' não ativou (statecode $s)." }
  Write-Output "PROD: '$n' ativo."
}
