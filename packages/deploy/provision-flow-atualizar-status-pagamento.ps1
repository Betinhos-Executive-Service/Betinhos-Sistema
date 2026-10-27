# Somente DEV. Aplica flows/atualizar-status-pagamento.ps1 no "Flow Atualizar Status de Pagamento": a baixa passa a localizar
# o pagante pelo product_id da Cielo (id do link) e só cai no order_number quando o product_id não achar ninguém.
# Não muda o estado do flow (no DEV ele fica como está: rascunho/desligado ou ativo).
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-atualizar-status-pagamento.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/provision-flow-atualizar-status-pagamento.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
. (Join-Path $PSScriptRoot 'flows/atualizar-status-pagamento.ps1')

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[atualizar-status] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function GetFlow() {
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$script:StatusFlowName' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$script:StatusFlowName' ausente ou duplicado no DEV." }
  return $rows[0]
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir "Flow-Atualizar-Status-de-Pagamento-$stamp.json"
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[atualizar-status] backup: $file"
}
function Apply($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -ne 1) { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null; return }
  Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
  }
}
if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  $row = GetFlow
  Backup $row
  Apply $row $text
  Write-Output "DEV: '$script:StatusFlowName' restaurado de $Restaurar."
  return
}

$row = GetFlow
$cd = $row.clientdata | ConvertFrom-Json
Corrigir-AtualizarStatus $cd
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
# Ida e volta pelo JSON para comparar no mesmo formato.
$atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
if ($SomenteValidar) { CheckFlowErrors $row $cd $environmentId; Conferir-AtualizarStatus $cd; Write-Output "DEV: '$script:StatusFlowName' válido$(if ($atual -eq $novo) { ' (já corrigido)' })."; return }
if ($atual -eq $novo) { Write-Output "DEV: '$script:StatusFlowName' já corrigido."; return }
CheckFlowErrors $row $cd $environmentId
Backup $row
Apply $row $novo
$lido = GetFlow
Conferir-AtualizarStatus ($lido.clientdata | ConvertFrom-Json)
Write-Output "DEV: '$script:StatusFlowName' corrigido; statecode=$($lido.statecode)."
