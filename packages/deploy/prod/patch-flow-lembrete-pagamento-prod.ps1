# Somente PROD. Aplica as correções de flows/lembrete-pagamento.ps1 (as mesmas validadas no DEV em 19/10/2026) no
# "Flow Enviar Lembrete de Pagamento" e no "Flow Gerar Link de Pagamento". Os dois continuam ativos.
#
# Antes de gravar, salva o clientdata de cada flow em packages/deploy/flows/backup/PROD-*. Para reverter um deles:
#   powershell -File packages/deploy/prod/patch-flow-lembrete-pagamento-prod.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/prod/patch-flow-lembrete-pagamento-prod.ps1 -SomenteValidar
# Observação: gravar num flow gerenciado cria camada não gerenciada no PROD; um import futuro do AppBetinhos não
# sobrescreve essa camada enquanto ela existir.
param([string] $Restaurar = '', [switch] $SomenteValidar)
. "$PSScriptRoot/_prod.ps1"
. (Join-Path $PSScriptRoot '../flows/lembrete-pagamento.ps1')

function Prefixo([string] $name) { return ($name -replace '[^A-Za-z0-9]+', '-').Trim('-') }
function CheckFlowErrors($row, $cd) {
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$script:ProdEnvironmentId/flows/$($row.workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = $cd.properties.definition
  $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
}

$flows = @(
  [pscustomobject]@{ Nome = $script:LembreteFlowName; Corrigir = { param($cd) Corrigir-Lembrete $cd }; Conferir = { param($cd) Conferir-Lembrete $cd } },
  [pscustomobject]@{ Nome = $script:LinkFlowName; Corrigir = { param($cd) Corrigir-EmailErro $cd }; Conferir = { param($cd) Conferir-EmailErro $cd } }
)

AssertProd

if ($Restaurar) {
  $alvo = @($flows | Where-Object { (Split-Path $Restaurar -Leaf).StartsWith('PROD-' + (Prefixo $_.Nome) + '-') })
  if ($alvo.Count -ne 1) { throw 'O nome do arquivo não corresponde a um backup de PROD destes flows.' }
  $row = GetFlow $alvo[0].Nome
  BackupFlow $row (Prefixo $alvo[0].Nome) | Out-Null
  ApplyFlow $row (ReadBackup $Restaurar)
  Write-Output "PROD: '$($alvo[0].Nome)' restaurado de $Restaurar."
  return
}

foreach ($f in $flows) {
  $row = GetFlow $f.Nome
  $cd = $row.clientdata | ConvertFrom-Json
  & $f.Corrigir $cd
  $novo = $cd | ConvertTo-Json -Depth 90 -Compress
  # Ida e volta pelo JSON para comparar no mesmo formato.
  $atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  if ($SomenteValidar) { CheckFlowErrors $row $cd; & $f.Conferir $cd; Write-Output "PROD: '$($f.Nome)' válido$(if ($atual -eq $novo) { ' (já corrigido)' })."; continue }
  if ($atual -eq $novo) { Write-Output "PROD: '$($f.Nome)' já corrigido."; continue }
  CheckFlowErrors $row $cd
  BackupFlow $row (Prefixo $f.Nome) | Out-Null
  ApplyFlow $row $novo
  $lido = GetFlow $f.Nome
  & $f.Conferir ($lido.clientdata | ConvertFrom-Json)
  Write-Output "PROD: '$($f.Nome)' corrigido; statecode=$($lido.statecode)."
}
