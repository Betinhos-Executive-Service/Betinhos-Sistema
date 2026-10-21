# Somente DEV. Aplica as correções de flows/notificar-condutor-multas.ps1 no "Flow  Notificar Condutor Multas" (autos no
# SharePoint BetinhosGestoInterna, em Funcionarios/DEV/<id>/Multas, AUTO_2 na pasta certa, multa sem motorista, e-mail de
# erro sem '..br' e resposta 500). O flow continua ativo.
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-notificar-condutor-multas.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/provision-flow-notificar-condutor-multas.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV.
# Para testar sem avisar a equipe, mande a notificação só para um endereço e depois rode de novo sem o parâmetro:
#   powershell -File packages/deploy/provision-flow-notificar-condutor-multas.ps1 -EmailPara noreply@betinhos.onmicrosoft.com
param([string] $Restaurar = '', [switch] $SomenteValidar, [string] $EmailPara = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
. (Join-Path $PSScriptRoot 'flows/notificar-condutor-multas.ps1')

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[notificar-condutor] $Method $($Path.Split('?')[0])"
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
function GetFlow([string] $name) {
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$($name.Replace("'", "''"))' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$name' ausente ou duplicado no DEV." }
  return $rows[0]
}
function Backup($row, [string] $prefixo) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("$prefixo-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[notificar-condutor] backup: $file"
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
function CheckFlowErrors($row, $cd) {
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($row.workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = $cd.properties.definition
  $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
}

$prefixo = 'Flow-Notificar-Condutor-Multas'
$row = GetFlow $script:NotificarFlowName

if ($Restaurar) {
  if (-not (Split-Path $Restaurar -Leaf).StartsWith("$prefixo-")) { throw 'O arquivo não é um backup deste flow.' }
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  Backup $row $prefixo
  Apply $row $text
  Write-Output "DEV: flow restaurado de $Restaurar."
  return
}

$cd = $row.clientdata | ConvertFrom-Json
Corrigir-NotificarCondutor $cd 'Funcionarios/DEV' $EmailPara
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
# Ida e volta pelo JSON para comparar no mesmo formato.
$atual = ($row.clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
CheckFlowErrors $row $cd
Conferir-NotificarCondutor $cd 'Funcionarios/DEV' $EmailPara
if ($atual -eq $novo) { Write-Output 'DEV: flow já corrigido.'; return }
if ($SomenteValidar) { Write-Output 'DEV: correção válida; nada gravado.'; return }
Backup $row $prefixo
Apply $row $novo
$lido = GetFlow $script:NotificarFlowName
Conferir-NotificarCondutor ($lido.clientdata | ConvertFrom-Json) 'Funcionarios/DEV' $EmailPara
Write-Output "DEV: flow corrigido; statecode=$($lido.statecode)."
