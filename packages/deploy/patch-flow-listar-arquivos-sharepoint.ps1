# Somente DEV. No "Flow - Listar arquivos SharePoint", pasta inexistente (404 em ObterPasta) passa a encerrar a
# execução como Succeeded depois de ResponderVazio. Antes, ListarPasta/SomenteArquivos/Mapear/Responder ficavam
# Skipped e a execução terminava Failed ("No dependent actions succeeded"), apesar da resposta 200 com lista vazia.
# A maioria dos veículos não tem pasta de foto (ela nasce no primeiro envio), então isso gerava falsos alarmes (#270).
# Resposta HTTP, erro 500 (ResponderErroPasta/ResponderErroListar) e 400 não mudam.
#
# Por padrão só mostra o que faria (DRY RUN); grava com -Apply. Antes de gravar, salva o clientdata atual em
# packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/patch-flow-listar-arquivos-sharepoint.ps1 -Apply -Restaurar <arquivo de backup>
# Requer `az login` com acesso ao DEV. O PROD recebe o mesmo flow pelas soluções.
param([switch] $Apply, [string] $Restaurar = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Flow - Listar arquivos SharePoint'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[listar-sharepoint] $Method $($Path.Split('?')[0])"
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
function Flow() {
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  return $rows[0]
}
function AssertEsteFlow($parsed) {
  $schema = $parsed.properties.definition.triggers.manual.inputs.schema
  if (-not $schema -or (@($schema.required) -join ',') -ne 'caminhoCompleto') { throw 'A definição não é a deste flow.' }
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-Listar-Arquivos-SharePoint-DEV-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[listar-sharepoint] backup: $file"
}
function Gravar($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  $ativo = $row.statecode -eq 1
  if ($ativo) { Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  # Mesmo que a gravação falhe, o flow volta ao estado anterior (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    if ($ativo) {
      Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
      $after = Dv GET "workflows($id)?`$select=statecode"
      if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
    }
  }
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$flow = Flow

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  AssertEsteFlow ($text | ConvertFrom-Json)
  if (-not $Apply) { Write-Output "DRY RUN: restauraria '$flowName' de $Restaurar (use -Apply)."; return }
  Backup $flow
  Gravar $flow $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar."
  return
}

$clientData = $flow.clientdata | ConvertFrom-Json
AssertEsteFlow $clientData
$validar = $clientData.properties.definition.actions.Validar
$semPasta = $validar.actions.PastaNaoEncontrada
if (-not $semPasta -or $semPasta.expression -ne "@equals(outputs('ObterPasta')?['statusCode'], 404)" -or -not $semPasta.actions.ResponderVazio) {
  throw 'O flow não está no formato esperado (PastaNaoEncontrada com ResponderVazio no 404).'
}
if ($semPasta.actions.PSObject.Properties.Name -contains 'EncerrarSemPasta') {
  Write-Output "DEV: '$flowName' já encerra Succeeded sem pasta; nada a alterar."
  return
}

$semPasta.actions | Add-Member -NotePropertyName EncerrarSemPasta -NotePropertyValue ([pscustomobject]@{
  type = 'Terminate'
  runAfter = [pscustomobject]@{ ResponderVazio = @('Succeeded') }
  inputs = [pscustomobject]@{ runStatus = 'Succeeded' }
})

Write-Host '[listar-sharepoint] mudança: Validar > PastaNaoEncontrada > EncerrarSemPasta (Terminate Succeeded após ResponderVazio)'
if (-not $Apply) { Write-Output 'DRY RUN: nada gravado (use -Apply).'; return }

Backup $flow
Gravar $flow ($clientData | ConvertTo-Json -Depth 90 -Compress)

$check = ((Flow).clientdata | ConvertFrom-Json).properties.definition.actions.Validar.actions.PastaNaoEncontrada.actions
if (-not ($check.PSObject.Properties.Name -contains 'EncerrarSemPasta') -or $check.EncerrarSemPasta.inputs.runStatus -ne 'Succeeded') { throw 'A definição gravada não confere. Restaure com -Restaurar.' }
Write-Output "DEV: '$flowName' encerra Succeeded quando a pasta não existe."
