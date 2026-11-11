param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Infleet - Sincronizar carro atual dos motoristas": a cada 5 minutos chama new_SincronizarVeiculoAtual e avisa por e-mail na segunda falha seguida.
# Origem: app-motoristas-v2 (arquivado). Era a parte do flow de provision-current-vehicle.ps1 (schema, Custom API e steps ficam fora). O destinatário do alerta fica no flow do DEV (marca), nunca no repositório. A definição versionada em flows/carro-atual.json é a exportada do
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
Write-Host "[flow-carro-atual] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Infleet - Sincronizar carro atual dos motoristas' (Join-Path $PSScriptRoot 'flows\carro-atual.json') -Apply:$Apply -Prefixo 'flow-carro-atual'
