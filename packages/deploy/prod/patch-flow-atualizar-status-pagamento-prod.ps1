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
function CheckFlowErrors($row, $cd) {
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$script:ProdEnvironmentId/flows/$($row.workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = $cd.properties.definition
  $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  try { $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing }
  catch {
    $detalhe = if ($_.Exception.Response) { (New-Object IO.StreamReader $_.Exception.Response.GetResponseStream()).ReadToEnd() } else { $_.Exception.Message }
    throw "checkFlowErrors falhou: $detalhe"
  }
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
}

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
if ($SomenteValidar) { CheckFlowErrors $row $cd; Conferir-AtualizarStatus $cd; Write-Output "PROD: '$script:StatusFlowName' válido$(if ($atual -eq $novo) { ' (já corrigido)' })."; return }
if ($atual -eq $novo) { Write-Output "PROD: '$script:StatusFlowName' já corrigido."; return }
CheckFlowErrors $row $cd
BackupFlow $row (Prefixo $script:StatusFlowName) | Out-Null
ApplyFlow $row $novo
$lido = GetFlow $script:StatusFlowName
Conferir-AtualizarStatus ($lido.clientdata | ConvertFrom-Json)
Write-Output "PROD: '$script:StatusFlowName' corrigido; statecode=$($lido.statecode)."
