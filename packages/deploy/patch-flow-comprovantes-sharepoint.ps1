# Somente DEV. Troca, no "Flow Comprovantes Despesas Assincrono | App Motoristas", a gravação do comprovante no
# OneDrive do noreply pela gravação no SharePoint (site BetinhosGestoInterna, biblioteca "Documentos Compartilhados",
# pasta Despesas/<ambiente>/AAAA/MM em America/Sao_Paulo) e o link do OneDrive (CreateShareLinkV2) pelo link do
# SharePoint (CreateSharingLink, view, organization). O anexo continua sendo atualizado pela Custom API
# new_ExpenseUploadTransition: cr40f_driveitemid = ItemId do SharePoint; cr40f_urlsharepoint e cr40f_sharelink = link.
# Se o anexo não tiver cr40f_mimetype (o App Motoristas já grava), o flow preenche pela extensão do arquivo.
# Gatilho, respostas HTTP (202/400), claim, falha e reprocessamento não mudam.
#
# Antes de alterar, salva o clientdata atual em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/patch-flow-comprovantes-sharepoint.ps1 -Restaurar <arquivo de backup>
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Comprovantes Despesas Assincrono | App Motoristas'
$sharePointFlow = 'Flow - Consultar Arquivos Sharepoint'
$siteUrl = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$library = 'Documentos Compartilhados'
$libraryId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$anexo = 'cr40f_anexodespesaoperacional'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[comprovantes-sharepoint] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}
function Redact([string] $s) { return ($s -replace 'sig=[^&"\s]+', 'sig=REDACTED') }
function Flow() {
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  return $rows[0]
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); o backup redigido não serviria para restaurar. Revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmm')
  $file = Join-Path $backupDir ("Flow-Comprovantes-Despesas-Assincrono-App-Motoristas-$stamp.json")
  [IO.File]::WriteAllText($file, (Redact $row.clientdata), (New-Object Text.UTF8Encoding $false))
  Write-Host "[comprovantes-sharepoint] backup: $file"
}
function Apply($row, [string] $clientData) {
  $id = $row.workflowid
  if ($row.statecode -eq 1) { Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null
  Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
  $after = Dv GET "workflows($id)?`$select=statecode,statuscode"
  if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$flow = Flow

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  $parsed = $text | ConvertFrom-Json
  $schema = $parsed.properties.definition.triggers.manual.inputs.schema
  if (-not $schema -or (@($schema.required) -join ',') -ne 'attachmentId,attemptId,conteudoBase64') { throw 'O arquivo não é um backup deste flow.' }
  Backup $flow
  Apply $flow $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar e ativo."
  return
}

# Colunas do anexo que a Custom API grava (e o tipo do arquivo, que o flow completa se faltar).
$cols = @((Dv GET "EntityDefinitions(LogicalName='$anexo')/Attributes?`$select=LogicalName").value | ForEach-Object { $_.LogicalName })
$faltando = @('cr40f_driveitemid', 'cr40f_urlsharepoint', 'cr40f_sharelink', 'cr40f_mimetype') | Where-Object { $cols -notcontains $_ }
if ($faltando) { throw "Colunas ausentes em ${anexo}: $($faltando -join ', ')." }
if ($cols -notcontains 'cr40f_tamanhobytes') { Write-Host '[comprovantes-sharepoint] cr40f_tamanhobytes não existe no DEV: tamanho não é gravado.' }

$clientData = $flow.clientdata | ConvertFrom-Json
$process = $clientData.properties.definition.actions.Process
$upload = $process.actions.Upload.actions
if ($upload.CreateFile.inputs.host.connectionName -eq 'shared_sharepointonline') {
  Write-Output "DEV: '$flowName' já grava no SharePoint; nada a alterar."
  return
}
if ($upload.CreateFile.inputs.host.operationId -ne 'CreateFile' -or $upload.ShareLink.inputs.host.operationId -ne 'CreateShareLinkV2') { throw 'O flow não está no formato esperado (CreateFile + ShareLink do OneDrive).' }
# Segmento de ambiente que o flow já usa hoje (no DEV, 'DEV' fixo): /Despesas/<ambiente>/<expenseId>.
$oldFolder = [string]$upload.CreateFile.inputs.parameters.folderPath
$match = [regex]::Match($oldFolder, "^@concat\('/Despesas/([A-Za-z]+)/'")
if (-not $match.Success) { throw "Pasta atual inesperada: $oldFolder" }
$ambiente = $match.Groups[1].Value

$spSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$sharePointFlow' and category eq 5").value)
if ($spSource.Count -ne 1) { throw 'Flow de referência do SharePoint ausente no DEV.' }
$sharepoint = ($spSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_sharepointonline
if (-not $sharepoint.connection.connectionReferenceLogicalName) { throw 'Connection reference do SharePoint ausente.' }

Backup $flow

$host_ = { param($op) @{ apiId = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'; connectionName = 'shared_sharepointonline'; operationId = $op } }
$retry = @{ type = 'fixed'; count = 2; interval = 'PT5S' }
$ano = "@{convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy')}"
$mes = "@{convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'MM')}"
$upload.CreateFile.inputs = [pscustomobject]@{
  host = & $host_ 'CreateFile'
  parameters = [pscustomobject]@{
    dataset = $siteUrl
    folderPath = "/$library/Despesas/$ambiente/$ano/$mes"
    name = $upload.CreateFile.inputs.parameters.name
    body = $upload.CreateFile.inputs.parameters.body
  }
  authentication = "@parameters('`$authentication')"
  retryPolicy = $retry
}
$upload.ShareLink.inputs = [pscustomobject]@{
  host = & $host_ 'CreateSharingLink'
  parameters = [pscustomobject]@{
    dataset = $siteUrl
    table = $libraryId
    id = "@body('CreateFile')?['ItemId']"
    'permission/type' = 'view'
    'permission/scope' = 'organization'
  }
  authentication = "@parameters('`$authentication')"
  retryPolicy = $retry
}
$upload.CompleteCommand.inputs.shareLink = "@body('ShareLink')?['link']?['webUrl']"
$upload.CompleteCommand.inputs.fileId = "@{body('CreateFile')?['ItemId']}"

# Tipo do arquivo: o App grava cr40f_mimetype ao criar o anexo; se vier vazio, completa pela extensão.
$nome = "toLower(coalesce(json(body('ClaimCommandAttempt')?['new_Result'])?['fileName'], ''))"
$tipo = "@if(or(endsWith($nome, '.jpg'), endsWith($nome, '.jpeg')), 'image/jpeg', if(endsWith($nome, '.png'), 'image/png', if(endsWith($nome, '.webp'), 'image/webp', if(endsWith($nome, '.heic'), 'image/heic', if(endsWith($nome, '.pdf'), 'application/pdf', if(endsWith($nome, '.txt'), 'text/plain', 'image/jpeg'))))))"
$process.actions | Add-Member -NotePropertyName TipoArquivo -NotePropertyValue ([pscustomobject]@{
  type = 'If'
  runAfter = [pscustomobject]@{ Upload = @('Succeeded') }
  expression = [pscustomobject]@{ equals = @("@trim(coalesce(json(body('ClaimCommandAttempt')?['new_Result'])?['mimeType'], ''))", '') }
  actions = [pscustomobject]@{
    GravarTipoArquivo = [pscustomobject]@{
      type = 'OpenApiConnection'
      runAfter = [pscustomobject]@{}
      inputs = [pscustomobject]@{
        host = @{ apiId = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'; connectionName = 'shared_commondataserviceforapps'; operationId = 'UpdateRecord' }
        parameters = [pscustomobject]@{ entityName = 'cr40f_anexodespesaoperacionals'; recordId = "@triggerBody()?['attachmentId']"; 'item/cr40f_mimetype' = $tipo }
        authentication = "@parameters('`$authentication')"
        retryPolicy = $retry
      }
    }
  }
  else = [pscustomobject]@{ actions = [pscustomobject]@{} }
})

$refs = $clientData.properties.connectionReferences
if (-not ($refs.PSObject.Properties.Name -contains 'shared_sharepointonline')) { $refs | Add-Member -NotePropertyName shared_sharepointonline -NotePropertyValue $sharepoint }

Apply $flow ($clientData | ConvertTo-Json -Depth 90 -Compress)

$check = (Flow).clientdata | ConvertFrom-Json
$u = $check.properties.definition.actions.Process.actions.Upload.actions
if ($u.CreateFile.inputs.host.operationId -ne 'CreateFile' -or $u.CreateFile.inputs.host.connectionName -ne 'shared_sharepointonline' -or $u.ShareLink.inputs.host.operationId -ne 'CreateSharingLink') { throw 'A definição gravada não confere. Restaure com -Restaurar.' }
Write-Output "DEV: '$flowName' ativo, gravando em $library/Despesas/$ambiente/AAAA/MM no SharePoint."
