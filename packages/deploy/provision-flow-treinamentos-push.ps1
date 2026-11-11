param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Push Treinamentos | Motoristas": quando uma participação de treinamento fica com push pendente, envia o push e registra sucesso ou falha. A Custom API cr40f_LembrarTreinamento do script antigo fica fora daqui.
# Origem: app-motoristas-v2 (arquivado). A definição versionada em flows/ é a exportada do DEV em 10/11/2026, com o
# escopo Web_Push_* que provision-web-push-flows.ps1 tinha aplicado à parte; connection references e a assinatura dos
# gatilhos vêm do flow existente (flows/sincronizar-flow.ps1). Só atualiza flow que já existe e não é gerenciado;
# criar é à mão. Somente DEV, sem bypass: o PROD recebe pelas soluções. Dry run por padrão; -Apply grava só o que
# difere, desligando antes e devolvendo o estado ligado/desligado de antes. O Deploy roda com -Apply quando o script
# ou o JSON mudam (flows-dev.mjs). Requer az login com acesso ao DEV.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'flows\sincronizar-flow.ps1')

Assert-SomenteDev $EnvironmentUrl
$sessao = New-DvSessao $EnvironmentUrl
Write-Host "[flow-treinamentos-push] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Push Treinamentos | Motoristas' (Join-Path $PSScriptRoot 'flows\treinamentos-push.json') -Apply:$Apply -Prefixo 'flow-treinamentos-push'
