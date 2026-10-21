# Somente PROD. Aplica as correções de flows/multas.ps1 (as mesmas validadas no DEV em 21/10/2026) no
# "Flow  Notificar Condutor Multas" e no "Flow Gerar Contrato". Os flows continuam ativos.
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/PROD-*. Para reverter um deles:
#   powershell -File packages/deploy/prod/patch-flow-multas-prod.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/prod/patch-flow-multas-prod.ps1 -SomenteValidar
# Observação: gravar num flow gerenciado cria camada não gerenciada no PROD; um import futuro do AppBetinhos não
# sobrescreve essa camada enquanto ela existir.
param([string] $Restaurar = '', [switch] $SomenteValidar)
. "$PSScriptRoot/_prod.ps1"
. (Join-Path $PSScriptRoot '../flows/multas.ps1')

$flows = @(
  [pscustomobject]@{ Nome = $script:NotificarFlowName; Prefixo = 'Flow-Notificar-Condutor-Multas'; Corrigir = { param($cd) Corrigir-NotificarCondutor $cd 'Funcionarios' }; Conferir = { param($cd) Conferir-NotificarCondutor $cd 'Funcionarios' } },
  [pscustomobject]@{ Nome = $script:ContratoFlowName; Prefixo = 'Flow-Gerar-Contrato'; Corrigir = { param($cd) Corrigir-GerarContrato $cd 'Funcionarios' }; Conferir = { param($cd) Conferir-GerarContrato $cd 'Funcionarios' } }
)

AssertProd

foreach ($f in $flows) {
  $row = GetFlow $f.Nome
  if ($Restaurar) {
    if (-not (Split-Path $Restaurar -Leaf).StartsWith("PROD-$($f.Prefixo)-")) { continue }
    BackupFlow $row $f.Prefixo | Out-Null
    ApplyFlow $row (ReadBackup $Restaurar)
    Write-Output "PROD: '$($f.Nome)' restaurado de $Restaurar."
    return
  }
  $cd = $row.clientdata | ConvertFrom-Json
  & $f.Corrigir $cd
  $novo = $cd | ConvertTo-Json -Depth 90 -Compress
  # Ida e volta pelo JSON para comparar no mesmo formato.
  $atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  CheckFlowErrors $row $cd
  & $f.Conferir $cd
  if ($atual -eq $novo) { Write-Output "PROD: '$($f.Nome)' já corrigido."; continue }
  if ($SomenteValidar) { Write-Output "PROD: '$($f.Nome)' com correção válida; nada gravado."; continue }
  BackupFlow $row $f.Prefixo | Out-Null
  ApplyFlow $row $novo
  $lido = GetFlow $f.Nome
  & $f.Conferir ($lido.clientdata | ConvertFrom-Json)
  Write-Output "PROD: '$($f.Nome)' corrigido; statecode=$($lido.statecode)."
}
if ($Restaurar) { throw 'O arquivo não é um backup destes flows.' }
