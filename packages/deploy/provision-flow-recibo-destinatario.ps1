# Somente DEV. Aplica flows/recibo-destinatario.mjs em "Flow Enviar Recibo Automático" e "Flow Gerar Recibo Manual":
# o recibo segue o destinatário gravado no pagante. Os dois continuam ativos e a URL do gatilho do manual não muda.
#
# Antes de gravar, salva o clientdata de cada flow em packages/deploy/flows/backup/. Para reverter um deles:
#   powershell -File packages/deploy/provision-flow-recibo-destinatario.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (checkFlowErrors do Power Automate):
#   powershell -File packages/deploy/provision-flow-recibo-destinatario.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
$transformacao = Join-Path $PSScriptRoot 'flows/recibo-destinatario.mjs'
$utf8 = New-Object Text.UTF8Encoding $false
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[recibo-destinatario] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function GetFlow([string] $name) {
  $filtro = [uri]::EscapeDataString("name eq '$name' and category eq 5")
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=$filtro").value)
  if ($rows.Count -ne 1) { throw "Flow '$name' ausente ou duplicado no DEV." }
  return $rows[0]
}
function Prefixo([string] $name) { return ($name -replace '[^A-Za-z0-9]+', '-').Trim('-') }
function Backup($row, [string] $name) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("$(Prefixo $name)-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, $utf8)
  Write-Host "[recibo-destinatario] backup: $file"
}
function Apply($row, [string] $clientData) {
  if ($clientData -cmatch 'Ã|Â|â€') { throw 'Texto com acentuação corrompida; nada foi gravado.' }
  $id = $row.workflowid
  if ($row.statecode -ne 1) { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null; return }
  Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    if ((Dv GET "workflows($id)?`$select=statecode").statecode -ne 1) { throw 'Flow não reativou. Restaure com -Restaurar.' }
  }
}
function CheckFlowErrors($row, [string] $clientData) {
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($row.workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = ($clientData | ConvertFrom-Json).properties.definition
  $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
}

$flows = @(
  [pscustomobject]@{ Nome = 'Flow Enviar Recibo Automático'; Manual = $false },
  [pscustomobject]@{ Nome = 'Flow Gerar Recibo Manual'; Manual = $true }
)

if ($Restaurar) {
  $alvo = @($flows | Where-Object { (Split-Path $Restaurar -Leaf).StartsWith((Prefixo $_.Nome) + '-') })
  if ($alvo.Count -ne 1) { throw 'O nome do arquivo não corresponde a um backup destes flows.' }
  $row = GetFlow $alvo[0].Nome
  Backup $row $alvo[0].Nome
  Apply $row ([IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF))
  Write-Output "DEV: '$($alvo[0].Nome)' restaurado de $Restaurar."
  return
}

$pasta = Join-Path ([IO.Path]::GetTempPath()) "recibo-destinatario-$PID"
New-Item -ItemType Directory -Force $pasta | Out-Null
foreach ($f in $flows) {
  $row = GetFlow $f.Nome
  $entrada = Join-Path $pasta 'entrada.json'
  $saida = Join-Path $pasta 'saida.json'
  [IO.File]::WriteAllText($entrada, $row.clientdata, $utf8)
  $opcao = @(if ($f.Manual) { '--manual' })
  $resultado = & node $transformacao @opcao $entrada $saida
  if ($LASTEXITCODE -ne 0) { throw "A transformação de '$($f.Nome)' falhou." }
  $novo = [IO.File]::ReadAllText($saida, [Text.Encoding]::UTF8)
  if ($SomenteValidar) { CheckFlowErrors $row $novo; Write-Output "DEV: '$($f.Nome)' válido ($resultado)."; continue }
  if ($resultado -eq 'igual') { Write-Output "DEV: '$($f.Nome)' já aplicado."; continue }
  CheckFlowErrors $row $novo
  Backup $row $f.Nome
  Apply $row $novo
  Write-Output "DEV: '$($f.Nome)' atualizado."
}
