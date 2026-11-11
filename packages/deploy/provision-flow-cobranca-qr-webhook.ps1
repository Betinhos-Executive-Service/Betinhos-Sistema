param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Flow Webhook Stripe | Cobrança QR": recebe o webhook do Stripe e, para sessão de checkout (cs_), chama new_CobrancaQR com a ação sincronizar.
# Origem: app-motoristas-v2 (arquivado). Era a parte do flow de provision-cobranca-qr.ps1 (step, chave Stripe e Custom API ficam fora). A URL do gatilho não está na definição: a plataforma a mantém e o script nunca a lê nem imprime. A definição versionada em flows/cobranca-qr-webhook.json é a exportada do
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
Write-Host "[flow-cobranca-qr-webhook] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Flow Webhook Stripe | Cobrança QR' (Join-Path $PSScriptRoot 'flows\cobranca-qr-webhook.json') -Apply:$Apply -Prefixo 'flow-cobranca-qr-webhook'
