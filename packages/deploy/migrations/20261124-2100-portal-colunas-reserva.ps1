param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply,
  # Usuario de aplicacao do Worker do portal (portal-cliente-dev). No PROD, quando o Worker existir, entra no perfil a mao.
  [string] $AppIdPortal = "f58ea2bc-e96d-47ed-ab0f-1036da43e5e2"
)

# Colunas protegidas da reserva para o Worker do portal (24/11/2026). Os acessos por perfil protegeram colunas de
# cr40f_reservadeveculos e o Worker ficou sem perfil para elas: o "Pedir servico" falhava com 403 (0x8004f502, sem
# permissao de criar em cr40f_endereodesada) e a leitura voltava vazia em silencio (origem, CR e tipo de veiculo no
# Meus servicos e na validacao). Perfil "Portal do cliente - reserva": le, cria e grava a saida e a observacao interna
# (o pedido grava as duas e o cancelamento acrescenta a nota); so le CR, tipo de veiculo e a composicao de preco (expand
# da validacao). Membro: so o usuario de aplicacao do Worker. Perfil e permissoes vao na solucao (componente 70); o
# membro nao vai (cada ambiente poe o seu). Idempotente. Somente DEV.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_reservadeveculos"
$perfilNome = "Portal do cliente - reserva"
$perfilDescricao = "Colunas protegidas da reserva que o Worker do portal le e grava. Membro: so o usuario de aplicacao do Worker do portal."
$grava = @{ canread = 4; cancreate = 4; canupdate = 4 }
$le = @{ canread = 4; cancreate = 0; canupdate = 0 }
$permissoes = [ordered] @{
  cr40f_endereodesada = $grava
  cr40f_observaointerna = $grava
  cr40f_cr = $le
  cr40f_tipodeveiculo = $le
  new_composicaodepreco = $le
}

$app = @(Get-Rows "systemusers" "systemuserid" "applicationid eq $AppIdPortal")
if ($app.Count -ne 1) { throw "Usuario de aplicacao $AppIdPortal nao encontrado." }
$perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilNome'")

if (-not $Apply) {
  Write-Step "DRY RUN: perfil '$perfilNome' $(if ($perfis.Count) { 'existe' } else { 'seria criado' }) com $($permissoes.Count) colunas de $tabela."
  return
}

if ($perfis.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles" @{ name = $perfilNome; description = $perfilDescricao } | Out-Null
  $perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilNome'")
  Write-Step "criado o perfil '$perfilNome'"
}
$perfilId = [string] $perfis[0].fieldsecurityprofileid
Add-ComponenteNaSolucao $perfilId 70

foreach ($coluna in $permissoes.Keys) {
  $p = $permissoes[$coluna]
  $fp = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread,cancreate,canupdate" "_fieldsecurityprofileid_value eq $perfilId and entityname eq '$tabela' and attributelogicalname eq '$coluna'")
  if ($fp.Count -eq 0) {
    Invoke-Dv "POST" "fieldpermissions" ($p + @{ "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"; entityname = $tabela; attributelogicalname = $coluna }) | Out-Null
  } elseif ($fp[0].canread -ne $p.canread -or $fp[0].cancreate -ne $p.cancreate -or $fp[0].canupdate -ne $p.canupdate) {
    Invoke-Dv "PATCH" "fieldpermissions($($fp[0].fieldpermissionid))" $p | Out-Null
  }
}

$uid = [string] $app[0].systemuserid
$ja = @((Invoke-Dv "GET" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association?`$select=systemuserid&`$filter=systemuserid eq $uid").value)
if ($ja.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association/`$ref" @{ "@odata.id" = "$script:DvApi/systemusers($uid)" } | Out-Null
  Write-Step "usuario de aplicacao do portal entrou no perfil"
}

$fim = @(Get-Rows "fieldpermissions" "attributelogicalname" "_fieldsecurityprofileid_value eq $perfilId and entityname eq '$tabela'")
if ($fim.Count -lt $permissoes.Count) { throw "Perfil '$perfilNome' ficou com $($fim.Count) de $($permissoes.Count) colunas." }
Write-Step "OK: perfil '$perfilNome' com $($fim.Count) colunas de $tabela e o Worker do portal."
