param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Multa | Aviso ao motorista": ao confirmar o responsavel "motorista" (passo DefinirResponsavel) o plugin grava
# cr40f_avisoautomaticoem = hoje; este flow dispara na alteracao dessa coluna (filtro: responsavel motorista e data preenchida),
# le o e-mail do motorista, respeita a configuracao do App (chave "multas") e envia o Web Push ("Voce tem uma multa para ver
# no app", sem valor nem infracao) e, so se nenhuma inscricao entregar, o push do Power Apps. A definicao parte do flow
# "Termo de multa | Push ao motorista" (mesmo padrao: Web Push primeiro, V2 em Fallback_V2).
# Flow novo nasce a mao uma vez no DEV (do checkout principal na develop atualizada, depois do Deploy aplicar a migration
# 20261124-1400-multa-aviso-automatico e publicar o plugin): crie o flow "Multa | Aviso ao motorista" no Power Automate com a
# conta que usa as connections do flow "Termo de multa | Push ao motorista", deixe-o DESLIGADO (o modulo Multas ainda esta fora do App)
# e rode este script com -Apply para gravar a definicao. As connection references vem do flow existente e, para as que ele nao
# declara, do flow "Termo de multa | Push ao motorista" (-FlowDeReferencias). Ligue so quando o modulo Multas voltar ao App.
# Fora do flows-dev.mjs de proposito: enquanto o flow nao existe no DEV o Deploy ficaria vermelho; o mapeamento entra num PR
# seguinte, depois da criacao manual.
# Somente DEV, sem bypass: o PROD recebe pelas solucoes. Dry run por padrao. Requer az login com acesso ao DEV.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'flows\sincronizar-flow.ps1')

Assert-SomenteDev $EnvironmentUrl
$sessao = New-DvSessao $EnvironmentUrl
Write-Host "[flow-multa-aviso-motorista] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Multa | Aviso ao motorista' (Join-Path $PSScriptRoot 'flows\multa-aviso-motorista.json') -Apply:$Apply -Prefixo 'flow-multa-aviso-motorista' -FlowDeReferencias 'Termo de multa | Push ao motorista'
