param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com/',
  [switch] $Apply
)

# Flow "Multa | Push do aceite": todo dia as 09:00 (America/Sao_Paulo) lista as multas na etapa Indicar, canal Senatran, indicadas
# e sem aceite conferido nem declarado; para cada uma chama a Custom API new_LembrarAceiteMulta (a API decide se hoje e dia de push:
# indicacao +2, +4 e +6 dias, no maximo 3) e, com new_Lembrou = true, envia o Web Push ("Voce tem uma multa para resolver no app",
# sem valor nem infracao) e, so se nenhuma inscricao entregar, o push do Power Apps. A definicao versionada em flows/ nasceu do push do termo.
# Flow novo nasce a mao uma vez no DEV (do checkout principal na develop atualizada, depois do Deploy publicar a Custom API e o plugin):
# crie o flow "Multa | Push do aceite" no Power Automate com a conta que usa as connections do flow "Termo de multa | Push ao motorista"
# e rode este script com -Apply para gravar a definicao. As connection references vem do flow existente e, para as que ele nao declara,
# do flow "Termo de multa | Push ao motorista" (-FlowDeReferencias). Depois disso o Deploy atualiza sozinho (flows-dev.mjs).
# Fora do flows-dev.mjs de proposito: enquanto o flow nao existe no DEV o Deploy ficaria vermelho; o mapeamento entra num PR
# seguinte, depois da criacao manual.
# A conta da connection reference do Dataverse precisa do privilegio prvCreatenew_TermoMulta (PrivilegioGestor) para chamar
# new_LembrarAceiteMulta; sem ele a API recusa com "Sem permissao para lembrar o aceite.".
# Somente DEV, sem bypass: o PROD recebe pelas solucoes. Dry run por padrao. Requer az login com acesso ao DEV.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'flows\sincronizar-flow.ps1')

Assert-SomenteDev $EnvironmentUrl
$sessao = New-DvSessao $EnvironmentUrl
Write-Host "[flow-multa-aceite-push] DEV, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
Sync-FlowExistente $sessao 'Multa | Push do aceite' (Join-Path $PSScriptRoot 'flows\multa-aceite-push.json') -Apply:$Apply -Prefixo 'flow-multa-aceite-push' -FlowDeReferencias 'Termo de multa | Push ao motorista'
