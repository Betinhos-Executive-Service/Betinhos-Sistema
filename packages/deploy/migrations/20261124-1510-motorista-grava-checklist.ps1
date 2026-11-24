param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Motorista grava o checklist da vistoria na hora: concede Write (Basic) em new_checklistveiculo ao papel Acesso-Motoristas.
# A Custom API new_SolicitarChecklistVeiculo exige prvWritenew_ChecklistVeiculo (em qualquer profundidade) de quem a executa;
# sem ele o App Motoristas levaria 403 ao tocar em "Fazer vistoria agora". Basic basta: o plugin atribui o checklist ao
# systemuser do motorista (ownerid), entao ele so alcanca os proprios; a escrita em si roda como SYSTEM no plugin.
# O papel ja esta na BetinhosCore (e na AppBetinhos), por isso o privilegio segue para o PROD pelas solucoes.
# Idempotente (confere roleprivileges antes). Somente DEV.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Papel = "Acesso-Motoristas"
$Privilegio = "prvWritenew_ChecklistVeiculo"

$papeis = @(Get-Rows "roles" "roleid,_businessunitid_value" "name eq '$Papel' and _parentroleid_value eq null")
if ($papeis.Count -ne 1) { throw "Papel $Papel nao encontrado (ou duplicado) na unidade raiz: $($papeis.Count)." }
$privs = @(Get-Rows "privileges" "privilegeid" "name eq '$Privilegio'")
if ($privs.Count -ne 1) { throw "Privilegio $Privilegio nao encontrado (ou duplicado)." }
$roleId = [string] $papeis[0].roleid
$privId = [string] $privs[0].privilegeid

$atual = @(Get-Rows "roleprivilegescollection" "roleprivilegeid,privilegedepthmask" "roleid eq $roleId and privilegeid eq $privId")
if ($atual.Count -gt 1) { throw "$Privilegio duplicado no papel $Papel." }
if ($atual.Count -eq 1) { Write-Step "ja existe: $Papel tem $Privilegio (depthmask=$($atual[0].privilegedepthmask)). Nada a fazer."; return }
if (-not $Apply) { Write-Step "dry-run: concederia $Privilegio (Basic) ao papel $Papel."; return }

Invoke-Dv "POST" "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @(@{
  "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $privId; Depth = "Basic"; BusinessUnitId = $papeis[0]._businessunitid_value; PrivilegeName = $Privilegio }) } | Out-Null
$confere = @(Get-Rows "roleprivilegescollection" "roleprivilegeid" "roleid eq $roleId and privilegeid eq $privId")
if ($confere.Count -ne 1) { throw "Concessao de $Privilegio ao papel $Papel nao confirmada." }
Write-Step "OK: $Papel recebeu $Privilegio (Basic)."
