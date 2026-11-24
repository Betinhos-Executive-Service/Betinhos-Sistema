param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Acessos por perfil: cria ou regrava os papeis "Perfil - *" e os perfis de coluna de mesmo nome,
# a partir de packages/deploy/acessos/perfis.gerado.json (gerado dos mapas em apps/shell/src/nav).
# O hash abaixo e o do gerado na data desta migration (Administrador de acessos le Funcionarios e o e-mail Microsoft). Se o gerado mudar, esta migration nao faz nada
# e uma migration nova, com o hash novo, aplica (migration publicada nao se edita).
# Nao tira papel nem acesso de ninguem: so cria os perfis. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)
. "$PSScriptRoot/../acessos/aplicar-perfis.ps1"

Invoke-PerfisDeAcesso "2d17e04512948ad8a6c4f59cb956d521d121651e5efc45304085fb5a2b359dcc"
