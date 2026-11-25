param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# "Pedir servico" com passageiros cadastrados (25/11/2026). O Worker passa a ler e criar pessoas (cr40f_bancodedados), criar
# o vinculo cr40f_servicosporpassageiro (com bind para a reserva e a pessoa, o que pede AppendTo nas duas) e gravar o tipo de
# veiculo preferido da reserva. Esta migration so ACRESCENTA ao papel "Portal do Cliente" (nunca rebaixa nem remove):
#   cr40f_Reservadeveculos      + AppendTo (o vinculo aponta para a reserva)
#   cr40f_BancodeDados          Create, Read, Write, Append, AppendTo (busca, pessoa nova, correcao de contato)
#   cr40f_ServicosporPassageiro + Create, Append
# e, no perfil de coluna "Portal do cliente - reserva", cr40f_tipodeveiculo passa de so leitura para leitura e criacao.
# Sem Delete: se o vinculo falhar depois da reserva criada, o Worker tenta apagar a reserva e, sem o privilegio, cancela
# com nota (decisao a confirmar com o Renan). Idempotente. Somente DEV; o PROD recebe pelas solucoes (conferir a mao o
# papel atribuido ao usuario de aplicacao do portal e o membro do perfil de coluna).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$nomePapel = "Portal do Cliente"
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$acessos = [ordered]@{
  "cr40f_Reservadeveculos"      = @("AppendTo")
  "cr40f_BancodeDados"          = @("Create", "Read", "Write", "Append", "AppendTo")
  "cr40f_ServicosporPassageiro" = @("Create", "Append")
}
$pedido = [ordered]@{}
foreach ($t in $acessos.Keys) { foreach ($p in $acessos[$t]) { $pedido["prv$p$t"] = "Global" } }

$privs = @{}
foreach ($nome in $pedido.Keys) {
  $achado = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nome'")
  if ($achado.Count -ne 1) { throw "Privilegio $nome nao encontrado." }
  $privs[$nome] = [string] $achado[0].privilegeid
}

$raiz = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
if ($raiz.Count -ne 1) { throw "Unidade de negocio raiz nao encontrada (ou ambigua): $($raiz.Count)." }
$bu = [string] $raiz[0].businessunitid
$achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$nomePapel' and _businessunitid_value eq $bu")
if ($achados.Count -gt 1) { throw "Papel '$nomePapel' duplicado na unidade raiz." }
if ($achados.Count -eq 0) { throw "Papel '$nomePapel' nao existe: rode antes a migration 20261124-1000-portal-cliente-papel." }
$papel = $achados[0]

$atual = @{}
foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $atual[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
$concessoes = @()
foreach ($nome in $pedido.Keys) {
  $id = $privs[$nome]; $depth = $pedido[$nome]
  if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
  $concessoes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $bu; PrivilegeName = $nome }
}
if ($concessoes.Count -eq 0) { Write-Step "$nomePapel ja tem tudo: nada a conceder" }
elseif (-not $Apply) { Write-Step "DRY RUN concederia: $(($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ', ')" }
else {
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $depois[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  foreach ($c in $concessoes) {
    if (-not $depois.ContainsKey($c.PrivilegeId) -or $depois[$c.PrivilegeId] -lt $ordem[$c.Depth]) { throw "$nomePapel ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$nomePapel concedido: $(($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ', ')"
}


# Perfil de coluna da reserva: tipo de veiculo passa a ser gravavel pelo Worker (leitura e criacao).
$perfilNome = "Portal do cliente - reserva"
$perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilNome'")
if ($perfis.Count -ne 1) { throw "Perfil '$perfilNome' nao encontrado: rode antes a migration 20261124-2100-portal-colunas-reserva." }
$perfilId = [string] $perfis[0].fieldsecurityprofileid
$fp = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread,cancreate,canupdate" "_fieldsecurityprofileid_value eq $perfilId and entityname eq 'cr40f_reservadeveculos' and attributelogicalname eq 'cr40f_tipodeveiculo'")
if ($fp.Count -gt 1) { throw "Permissao duplicada de cr40f_tipodeveiculo no perfil '$perfilNome'." }
$alvo = @{ canread = 4; cancreate = 4; canupdate = 0 }
if ($fp.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a permissao de cr40f_tipodeveiculo (ler e criar) no perfil '$perfilNome'." }
  else { Invoke-Dv "POST" "fieldpermissions" ($alvo + @{ "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"; entityname = "cr40f_reservadeveculos"; attributelogicalname = "cr40f_tipodeveiculo" }) | Out-Null }
} elseif ($fp[0].cancreate -ne 4 -or $fp[0].canread -ne 4) {
  if (-not $Apply) { Write-Step "DRY RUN passaria cr40f_tipodeveiculo para ler e criar no perfil '$perfilNome'." }
  else { Invoke-Dv "PATCH" "fieldpermissions($($fp[0].fieldpermissionid))" $alvo | Out-Null; Write-Step "cr40f_tipodeveiculo: ler e criar" }
} else { Write-Step "cr40f_tipodeveiculo ja le e cria no perfil" }
Write-Step "OK: Portal do Cliente com acesso a pessoas e vinculos de passageiros."
