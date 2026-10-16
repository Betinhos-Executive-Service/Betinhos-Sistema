# Somente PROD. No "Flow Comprovantes Despesas Assincrono | App Motoristas", troca a pasta do SharePoint de
# Documentos Compartilhados/Despesas/DEV/AAAA/MM para Despesas/PROD/AAAA/MM. O import gerenciado do AppBetinhos
# (export do DEV) trouxe o segmento DEV fixo. Nada mais muda no flow.
#
# Antes de gravar, salva o clientdata em packages/deploy/flows/backup/PROD-*. Para reverter:
#   powershell -File packages/deploy/prod/patch-flow-comprovantes-pasta-prod.ps1 -Restaurar <arquivo de backup>
# Observação: gravar num flow gerenciado cria camada não gerenciada no PROD; um import futuro do AppBetinhos não
# sobrescreve essa camada enquanto ela existir.
param([string] $Restaurar = '')
. "$PSScriptRoot/_prod.ps1"
$flowName = 'Flow Comprovantes Despesas Assincrono | App Motoristas'
$prefixo = 'Flow-Comprovantes-Despesas-Assincrono-App-Motoristas'

AssertProd
$flow = GetFlow $flowName

if ($Restaurar) {
  $text = ReadBackup $Restaurar
  $schema = ($text | ConvertFrom-Json).properties.definition.triggers.manual.inputs.schema
  if (-not $schema -or (@($schema.required) -join ',') -ne 'attachmentId,attemptId,conteudoBase64') { throw 'O arquivo não é um backup deste flow.' }
  BackupFlow $flow $prefixo | Out-Null
  ApplyFlow $flow $text
  Write-Output "PROD: '$flowName' restaurado de $Restaurar."
  return
}

$cd = $flow.clientdata | ConvertFrom-Json
$create = $cd.properties.definition.actions.Process.actions.Upload.actions.CreateFile.inputs
if ($create.host.connectionName -ne 'shared_sharepointonline') { throw 'O flow não grava no SharePoint; formato inesperado.' }
$folder = [string]$create.parameters.folderPath
if ($folder -match '^/Documentos Compartilhados/Despesas/PROD/') { Write-Output "PROD: pasta já é Despesas/PROD; nada a alterar."; return }
if ($folder -notmatch '^/Documentos Compartilhados/Despesas/DEV/') { throw "Pasta atual inesperada: $folder" }

BackupFlow $flow $prefixo | Out-Null
$create.parameters.folderPath = $folder -replace '^/Documentos Compartilhados/Despesas/DEV/', '/Documentos Compartilhados/Despesas/PROD/'
ApplyFlow $flow ($cd | ConvertTo-Json -Depth 90 -Compress)

$check = GetFlow $flowName
$after = [string]($check.clientdata | ConvertFrom-Json).properties.definition.actions.Process.actions.Upload.actions.CreateFile.inputs.parameters.folderPath
if ($after -notmatch '^/Documentos Compartilhados/Despesas/PROD/') { throw "A pasta gravada não confere: $after" }
Write-Output "PROD: '$flowName' statecode=$($check.statecode); pasta = $after"
