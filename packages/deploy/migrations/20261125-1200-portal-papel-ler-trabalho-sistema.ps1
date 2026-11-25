param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Pedido do portal sem passageiro (25/11/2026, OS-2007 no DEV): criar o vinculo cr40f_servicosporpassageiro dispara um
# trabalho do sistema (asyncoperation) em nome de quem grava, e o Dataverse recusa com 403 se o dono nao pode ler
# asyncoperation ("Read Privilege Check For Owner ... missing prvReadAsyncOperation"). O Worker entao desfaz a reserva.
# Esta migration so ACRESCENTA prvReadAsyncOperation (Basic: so os trabalhos do proprio usuario) ao papel
# "Portal do Cliente". Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$nomePapel = "Portal do Cliente"
$nomePriv = "prvReadAsyncOperation"

$achado = @(Get-Rows "privileges" "privilegeid" "name eq '$nomePriv'")
if ($achado.Count -ne 1) { throw "Privilegio $nomePriv nao encontrado." }
$privId = [string] $achado[0].privilegeid

$raiz = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
if ($raiz.Count -ne 1) { throw "Unidade de negocio raiz nao encontrada (ou ambigua): $($raiz.Count)." }
$bu = [string] $raiz[0].businessunitid
$papeis = @(Get-Rows "roles" "roleid" "name eq '$nomePapel' and _businessunitid_value eq $bu")
if ($papeis.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou duplicado) na unidade raiz: $($papeis.Count)." }
$roleId = [string] $papeis[0].roleid

$temAgora = { @(Get-Rows "roleprivilegescollection" "privilegeid" "roleid eq $roleId and privilegeid eq $privId").Count -gt 0 }
if (& $temAgora) { Write-Step "$nomePapel ja tem ${nomePriv}: nada a conceder" }
elseif (-not $Apply) { Write-Step "DRY RUN concederia: $nomePriv=Basic" }
else {
  $concessao = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $privId; Depth = "Basic"; BusinessUnitId = $bu; PrivilegeName = $nomePriv }
  Invoke-Dv "POST" "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @($concessao) } | Out-Null
  if (-not (& $temAgora)) { throw "$nomePapel ficou sem $nomePriv." }
  Write-Step "$nomePapel concedido: $nomePriv=Basic"
}
