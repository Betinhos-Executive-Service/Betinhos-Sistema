param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flows do checklist de vistoria: "Flow Checklists | Rotina diaria" (06:30, Custom API new_ProcessarChecklistsVeiculos) e "Flow Push Checklist | Motoristas" (push do checklist ao motorista, registra sucesso ou falha).
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
Write-Host "[flow-checklists] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Flow Checklists | Rotina diaria' (Join-Path $PSScriptRoot 'flows\checklists-rotina-diaria.json') -Apply:$Apply -Prefixo 'flow-checklists'
Sync-FlowExistente $sessao 'Flow Push Checklist | Motoristas' (Join-Path $PSScriptRoot 'flows\checklist-push.json') -Apply:$Apply -Prefixo 'flow-checklists'
