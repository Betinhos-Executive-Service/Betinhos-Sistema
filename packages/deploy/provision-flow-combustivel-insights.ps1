param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Combustível — insights noturnos": toda madrugada (2h) chama new_GerarInsightsCombustivel até não restarem pendentes.
# Origem: app-motoristas-v2 (arquivado). Era provision-relatorio-combustivel-flow.ps1. A definição versionada em flows/combustivel-insights.json é a exportada do
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
Write-Host "[flow-combustivel-insights] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Combustível — insights noturnos' (Join-Path $PSScriptRoot 'flows\combustivel-insights.json') -Apply:$Apply -Prefixo 'flow-combustivel-insights'
