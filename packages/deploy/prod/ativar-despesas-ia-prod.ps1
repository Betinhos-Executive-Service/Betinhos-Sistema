# Somente PROD. Ativa "Flow Despesas | Análise IA" e "Flow Despesas | Leitura rápida".
# Pré-requisito: new_AnthropicApiKey com valor atual no PROD (o Renan preenche no maker portal; este script só conta,
# nunca lê o valor). Não altera definição de flow.
# Para desligar: -Desativar (volta os dois flows para Rascunho).
param([switch] $Desativar)
. "$PSScriptRoot/_prod.ps1"
$flowsIa = @('Flow Despesas | Análise IA', 'Flow Despesas | Leitura rápida')

AssertProd
if ($Desativar) {
  foreach ($n in $flowsIa) { $f = GetFlow $n; if ($f.statecode -ne 0) { Dv PATCH "workflows($($f.workflowid))" @{ statecode = 0 } | Out-Null }; Write-Output "PROD: '$n' statecode=$((GetFlow $n).statecode)" }
  return
}

$key = EnvVarValueCount 'new_AnthropicApiKey'
if ($key.Count -ne 1) { throw "new_AnthropicApiKey com $($key.Count) valor(es) atual(is) no PROD; preencha o Valor atual antes de ativar." }

foreach ($n in $flowsIa) {
  $f = GetFlow $n
  if ($f.statecode -ne 1) { Dv PATCH "workflows($($f.workflowid))" @{ statecode = 1 } | Out-Null }
  $s = (GetFlow $n).statecode
  if ($s -ne 1) { throw "'$n' não ativou (statecode $s)." }
  Write-Output "PROD: '$n' ativo."
}
