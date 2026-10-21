# Somente PROD. Aplica as correções de flows/notificar-condutor-multas.ps1 (as mesmas validadas no DEV em 21/10/2026) no
# "Flow  Notificar Condutor Multas". O flow continua ativo.
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/PROD-*. Para reverter:
#   powershell -File packages/deploy/prod/patch-flow-notificar-condutor-multas-prod.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/prod/patch-flow-notificar-condutor-multas-prod.ps1 -SomenteValidar
# Observação: gravar num flow gerenciado cria camada não gerenciada no PROD; um import futuro do AppBetinhos não
# sobrescreve essa camada enquanto ela existir.
param([string] $Restaurar = '', [switch] $SomenteValidar)
. "$PSScriptRoot/_prod.ps1"
. (Join-Path $PSScriptRoot '../flows/notificar-condutor-multas.ps1')
$prefixo = 'Flow-Notificar-Condutor-Multas'

AssertProd
$row = GetFlow $script:NotificarFlowName

if ($Restaurar) {
  if (-not (Split-Path $Restaurar -Leaf).StartsWith("PROD-$prefixo-")) { throw 'O arquivo não é um backup de PROD deste flow.' }
  BackupFlow $row $prefixo | Out-Null
  ApplyFlow $row (ReadBackup $Restaurar)
  Write-Output "PROD: flow restaurado de $Restaurar."
  return
}

$cd = $row.clientdata | ConvertFrom-Json
Corrigir-NotificarCondutor $cd 'Funcionarios'
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
# Ida e volta pelo JSON para comparar no mesmo formato.
$atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
CheckFlowErrors $row $cd
Conferir-NotificarCondutor $cd 'Funcionarios'
if ($atual -eq $novo) { Write-Output 'PROD: flow já corrigido.'; return }
if ($SomenteValidar) { Write-Output 'PROD: correção válida; nada gravado.'; return }
BackupFlow $row $prefixo | Out-Null
ApplyFlow $row $novo
$lido = GetFlow $script:NotificarFlowName
Conferir-NotificarCondutor ($lido.clientdata | ConvertFrom-Json) 'Funcionarios'
Write-Output "PROD: flow corrigido; statecode=$($lido.statecode)."
