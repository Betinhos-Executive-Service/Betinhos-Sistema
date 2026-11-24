param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Papel "Portal do Cliente": o minimo que o Worker do portal (apps/portal-cliente/worker) usa no Dataverse com o usuario
# de aplicacao do portal (app registration proprio, um por ambiente). Tabelas e operacoes conferidas no codigo do Worker
# em 24/11/2026: login (validador, codigo, dispositivo), Validar (validacao, mensagem, composicao), Pedir e Meus servicos
# (reserva, passageiros, cliente). Profundidade Global (o usuario de aplicacao nao e dono dos registros; o isolamento por
# cliente e feito no Worker). Sem Delete em nada. So concede o que falta ou esta abaixo; nunca rebaixa nem remove.
# O usuario de aplicacao e criado e recebe o papel a mao em cada ambiente (nao vai em solucao).
# Aditivo e idempotente. Somente DEV; o PROD recebe o papel pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$nomePapel = "Portal do Cliente"
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$acessos = [ordered]@{
  "cr40f_ValidacaoServico"     = @("Read", "Write", "AppendTo")
  "cr40f_ValidadorCliente"     = @("Create", "Read", "Write", "Append", "AppendTo")
  "cr40f_MensagemValidacao"    = @("Create", "Read", "Append")
  "cr40f_CodigoAcesso"         = @("Create", "Read", "Write", "Append")
  "cr40f_DispositivoConfiavel" = @("Create", "Read", "Write", "Append")
  "cr40f_Clientes1"            = @("Read", "AppendTo")
  "cr40f_Reservadeveculos"     = @("Create", "Read", "Write", "Append")
  "cr40f_ServicosporPassageiro" = @("Read")
  "cr40f_ComposicaodePrecos"   = @("Read")
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
if ($achados.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o papel $nomePapel com: $(($pedido.Keys) -join ', ')"; return }
  Invoke-Dv "POST" "roles" @{ name = $nomePapel; description = (U "Usuário de aplicação do portal do cliente (Worker portal-cliente). Mínimo que o Worker usa."); "businessunitid@odata.bind" = "/businessunits($bu)" } | Out-Null
  $achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$nomePapel' and _businessunitid_value eq $bu")
  if ($achados.Count -ne 1) { throw "Papel '$nomePapel' nao apareceu depois do POST." }
  Write-Step "criado o papel $nomePapel"
}
$papel = $achados[0]
if ($Apply) { Add-ComponenteNaSolucao $papel.roleid 20 }

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
Write-Step "OK: papel $nomePapel na solucao $script:SolucaoDev. Atribua ao usuario de aplicacao do portal."
