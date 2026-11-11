param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Flow Checklist Não OK | Planner": checklist concluído com item Não OK abre (ou completa) a tarefa da equipe Frota no Planner interno, com responsáveis, eventos e fotos anexadas.
# Origem: app-motoristas-v2 (arquivado). Era provision-checklist-planner-flow.ps1. O responsável reserva fica no flow do DEV (marca), nunca no repositório. A definição versionada em flows/checklist-planner.json é a exportada do
# DEV em 10/11/2026; connection references, a assinatura dos gatilhos e os valores marcados '<preservado do DEV>'
# vêm do flow existente (flows/sincronizar-flow.ps1). Só atualiza flow que já existe e não é gerenciado; criar é à
# mão. Somente DEV, sem bypass: o PROD recebe pelas soluções. Dry run por padrão; -Apply grava só o que difere,
# desligando antes e devolvendo o estado ligado/desligado de antes. O Deploy roda com -Apply quando o script ou o
# JSON mudam (flows-dev.mjs). Requer az login com acesso ao DEV.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'flows\sincronizar-flow.ps1')

Assert-SomenteDev $EnvironmentUrl
$sessao = New-DvSessao $EnvironmentUrl
Write-Host "[flow-checklist-planner] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Flow Checklist Não OK | Planner' (Join-Path $PSScriptRoot 'flows\checklist-planner.json') -Apply:$Apply -Prefixo 'flow-checklist-planner'
