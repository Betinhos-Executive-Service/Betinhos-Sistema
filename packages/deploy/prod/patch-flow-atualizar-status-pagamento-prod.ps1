# Somente PROD. Aplica flows/atualizar-status-pagamento.ps1 (validado no DEV em 27/10/2026) no "Flow Atualizar Status de
# Pagamento": a baixa localiza o pagante pelo product_id da Cielo (id do link) e só cai no order_number quando o product_id
# não achar ninguém. O flow continua ativo.
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/PROD-*. Para reverter:
#   powershell -File packages/deploy/prod/patch-flow-atualizar-status-pagamento-prod.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/prod/patch-flow-atualizar-status-pagamento-prod.ps1 -SomenteValidar
# Atenção: com o flow ativo, a gravação o desliga e religa; uma notificação da Cielo nesses segundos pode se perder (a baixa
# então é manual). Rode fora do horário de pico. Gravar num flow gerenciado cria camada não gerenciada no PROD; um import
# futuro do AppBetinhos não sobrescreve essa camada enquanto ela existir.
param([string] $Restaurar = '', [switch] $SomenteValidar)
. "$PSScriptRoot/_prod.ps1"
. (Join-Path $PSScriptRoot '../flows/atualizar-status-pagamento.ps1')

function Prefixo([string] $name) { return ($name -replace '[^A-Za-z0-9]+', '-').Trim('-') }

AssertProd

if ($Restaurar) {
  if (-not (Split-Path $Restaurar -Leaf).StartsWith('PROD-' + (Prefixo $script:StatusFlowName) + '-')) { throw 'O nome do arquivo não corresponde a um backup de PROD deste flow.' }
  $row = GetFlow $script:StatusFlowName
  BackupFlow $row (Prefixo $script:StatusFlowName) | Out-Null
  ApplyFlow $row (ReadBackup $Restaurar)
  Write-Output "PROD: '$script:StatusFlowName' restaurado de $Restaurar."
  return
}

$row = GetFlow $script:StatusFlowName
$cd = $row.clientdata | ConvertFrom-Json
Corrigir-AtualizarStatus $cd
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
# Ida e volta pelo JSON para comparar no mesmo formato.
$atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
if ($SomenteValidar) { CheckFlowErrors $row $cd $script:ProdEnvironmentId; Conferir-AtualizarStatus $cd; Write-Output "PROD: '$script:StatusFlowName' válido$(if ($atual -eq $novo) { ' (já corrigido)' })."; return }
if ($atual -eq $novo) { Write-Output "PROD: '$script:StatusFlowName' já corrigido."; return }
CheckFlowErrors $row $cd $script:ProdEnvironmentId
BackupFlow $row (Prefixo $script:StatusFlowName) | Out-Null
ApplyFlow $row $novo
$lido = GetFlow $script:StatusFlowName
Conferir-AtualizarStatus ($lido.clientdata | ConvertFrom-Json)
Write-Output "PROD: '$script:StatusFlowName' corrigido; statecode=$($lido.statecode)."
