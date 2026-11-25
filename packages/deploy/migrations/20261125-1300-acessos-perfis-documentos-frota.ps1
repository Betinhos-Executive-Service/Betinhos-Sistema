param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: Frota ganha cr40f_documento em profundidade Local (dono do documento de veiculo
# na unidade Frota, plano 4, tarefa 15). Regrava os papeis "Perfil - *" a partir de
# packages/deploy/acessos/perfis.gerado.json. O hash abaixo e o do gerado na data desta migration.
# Se o gerado mudar, esta migration nao faz nada e uma migration nova aplica (migration publicada nao se edita).
# Nao tira papel de ninguem. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
. "$PSScriptRoot/../acessos/aplicar-perfis.ps1"

Invoke-PerfisDeAcesso "54af218df390a1fb891645a0426347a5af4454e55fd6a2ddf0e58b252e419bd6"
