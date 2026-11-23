param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Auditoria de acessos de 23/11/2026 (achado 1): o papel "Acesso-Betinhos-MDA", dado ao escritorio, tinha
# prvWriteWebResource em Global. Com ele qualquer pessoa do escritorio regravava pela Web API o codigo das telas
# (cr40f_SistemaBetinhos.html, Tela_GerarPagantes, new_formulario_geral.html), que roda na sessao de todo mundo.
# Nenhuma tela grava web resource em tempo de execucao. Quem publica e a conta de servico do Deploy (Administrador
# do Sistema) ou o pnpm push local de um administrador; so com este papel ninguem publicava (falta
# prvPublishCustomization). Remove so esse privilegio, so desse papel; nao mexe em papel de sistema. Idempotente:
# sem o privilegio, nao faz nada. Somente DEV; o PROD recebe o papel pelas solucoes (upgrade do BetinhosCore).
# O upgrade so tira o privilegio que veio pela solucao: se ele foi dado direto no PROD (camada Active do papel,
# que remover-camadas-active.ps1 nao cobre), continua la. Conferir no PROD depois do "Publicar solucoes":
# roleprivilegescollection com o roleid do papel e o privilegeid de prvWriteWebResource tem de voltar vazio.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$nomePapel = "Acesso-Betinhos-MDA"
$nomePrivilegio = "prvWriteWebResource"

$privilegios = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nomePrivilegio'")
if ($privilegios.Count -ne 1) { throw "Privilegio $nomePrivilegio nao encontrado." }
$privilegioId = [string] $privilegios[0].privilegeid

$papeis = @(Get-Rows "roles" "roleid,name" "name eq '$nomePapel' and _parentroleid_value eq null")
if ($papeis.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
$papelId = [string] $papeis[0].roleid

function Test-TemPrivilegio {
  return @(Get-Rows "roleprivilegescollection" "privilegeid" "roleid eq $papelId and privilegeid eq $privilegioId").Count -gt 0
}

if (-not (Test-TemPrivilegio)) { Write-Step "$nomePapel ja esta sem ${nomePrivilegio}: nada a remover"; return }
if (-not $Apply) { Write-Step "DRY RUN $nomePapel perderia $nomePrivilegio"; return }

Invoke-Dv "POST" "roles($papelId)/Microsoft.Dynamics.CRM.RemovePrivilegeRole" @{
  Privilege = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.privilege"; privilegeid = $privilegioId }
} | Out-Null
if (Test-TemPrivilegio) { throw "$nomePapel continua com $nomePrivilegio depois da remocao." }
Write-Step "$nomePapel removido: $nomePrivilegio"
