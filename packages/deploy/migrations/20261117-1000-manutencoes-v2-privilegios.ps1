param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Manutencoes v2, plano 2 (docs/superpowers/plans/2026-11-17-manutencoes-v2-2-frota.md, Tarefa 2):
# o escritorio passa a encaixar, reprovar, cancelar, concluir e abrir manutencao pelo shell. As Custom APIs
# cr40f_Manutencao* rodam no contexto de quem chama: o papel precisa criar e alterar a linha da Geral, a despesa
# e os anexos (antes o flow "Criar Servico de Manutencao na Geral" criava a linha com o dono dele).
# So concede o que falta ou esta abaixo da profundidade pedida; nunca rebaixa nem remove. Somente DEV;
# o PROD recebe os papeis pelas solucoes (BetinhosCore).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$papeis = @("Acesso-Betinhos-MDA", "DEV - Usu$([char]0xE1)rio")
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }

$pedido = [ordered]@{}
foreach ($t in @("cr40f_manutencoes", "cr40f_reservadeveculos", "cr40f_despesaoperacional")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvWrite$t"] = "Global"; $pedido["prvCreate$t"] = "Basic"
  $pedido["prvAppend$t"] = "Global"; $pedido["prvAppendTo$t"] = "Global"
}
foreach ($t in @("cr40f_anexodespesaoperacional", "new_fotomanutencao")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvCreate$t"] = "Basic"; $pedido["prvAppend$t"] = "Global"
}
foreach ($t in @("cr40f_veiculos", "cr40f_funcionarios", "cr40f_cidade", "cr40f_categoriadespesaoperacional", "cr40f_formapagamentodespesa")) {
  $pedido["prvRead$t"] = "Global"; $pedido["prvAppendTo$t"] = "Global"
}

$privs = @{}
foreach ($nome in $pedido.Keys) {
  $achado = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nome'")
  if ($achado.Count -ne 1) { throw "Privilegio $nome nao encontrado." }
  $privs[$nome] = [string] $achado[0].privilegeid
}

foreach ($nomePapel in $papeis) {
  $achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$($nomePapel.Replace("'", "''"))' and _parentroleid_value eq null")
  if ($achados.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou ambiguo) na unidade raiz: $($achados.Count)." }
  $papel = $achados[0]
  $atual = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $atual[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  $concessoes = @()
  foreach ($nome in $pedido.Keys) {
    $id = $privs[$nome]; $depth = $pedido[$nome]
    if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
    $concessoes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $nome }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$nomePapel ja tem tudo: nada a conceder"; continue }
  $resumo = ($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN $nomePapel receberia: $resumo"; continue }
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $depois[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  foreach ($c in $concessoes) {
    if (-not $depois.ContainsKey($c.PrivilegeId) -or $depois[$c.PrivilegeId] -lt $ordem[$c.Depth]) { throw "$nomePapel ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$nomePapel concedido: $resumo"
}
