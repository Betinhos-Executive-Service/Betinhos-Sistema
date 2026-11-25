param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Meus servicos sem lista (25/11/2026, OS-2009 no DEV): a lista do portal le as reservas com $expand dos passageiros e o
# Dataverse recusa com 403 se o usuario nao pode ler a metadata ("SecLib::CheckPrivilege failed ... prvReadEntity").
# Esta migration so ACRESCENTA ao papel "Portal do Cliente" a leitura de metadata (tabela, coluna e relacionamento),
# que so aceita profundidade Global e nao da acesso a nenhum registro. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$nomePapel = "Portal do Cliente"
$nomesPriv = @("prvReadEntity", "prvReadAttribute", "prvReadRelationship")

$raiz = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
if ($raiz.Count -ne 1) { throw "Unidade de negocio raiz nao encontrada (ou ambigua): $($raiz.Count)." }
$bu = [string] $raiz[0].businessunitid
$papeis = @(Get-Rows "roles" "roleid" "name eq '$nomePapel' and _businessunitid_value eq $bu")
if ($papeis.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou duplicado) na unidade raiz: $($papeis.Count)." }
$roleId = [string] $papeis[0].roleid

$faltam = @()
foreach ($nomePriv in $nomesPriv) {
  $achado = @(Get-Rows "privileges" "privilegeid" "name eq '$nomePriv'")
  if ($achado.Count -ne 1) { throw "Privilegio $nomePriv nao encontrado." }
  $privId = [string] $achado[0].privilegeid
  if (@(Get-Rows "roleprivilegescollection" "privilegeid" "roleid eq $roleId and privilegeid eq $privId").Count -gt 0) {
    Write-Step "$nomePapel ja tem ${nomePriv}: nada a conceder"
    continue
  }
  $faltam += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $privId; Depth = "Global"; BusinessUnitId = $bu; PrivilegeName = $nomePriv }
}

if ($faltam.Count -eq 0) { return }
$lista = ($faltam | ForEach-Object { $_.PrivilegeName }) -join ", "
if (-not $Apply) { Write-Step "DRY RUN concederia (Global): $lista"; return }
Invoke-Dv "POST" "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $faltam } | Out-Null
foreach ($p in $faltam) {
  if (@(Get-Rows "roleprivilegescollection" "privilegeid" "roleid eq $roleId and privilegeid eq $($p.PrivilegeId)").Count -eq 0) { throw "$nomePapel ficou sem $($p.PrivilegeName)." }
}
Write-Step "$nomePapel concedido (Global): $lista"
