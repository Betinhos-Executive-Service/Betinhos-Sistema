param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply,
  # Usuario de aplicacao do Worker do portal (portal-cliente-dev). No PROD, quando o Worker existir, entra no perfil a mao.
  [string] $AppIdPortal = "f58ea2bc-e96d-47ed-ab0f-1036da43e5e2"
)

# Seguranca de coluna no hash da senha do portal (24/11/2026, pedido do Renan): cr40f_validadorcliente.cr40f_senhahash
# passa a IsSecured e sem auditoria. So o perfil "Portal do cliente - senha" (ler, criar e gravar; membro: o usuario de
# aplicacao do Worker) e o Administrador do Sistema enxergam. O "Zerar senha" do shell limpa so cr40f_senhadefinidaem
# (o Worker trata data vazia como sem senha), entao ninguem do shell precisa do perfil. O perfil e a permissao vao na
# solucao (componente 70); o membro nao vai (cada ambiente poe o seu). Idempotente. Somente DEV.
# Substitui a 20261124-1700, que criava a permissao antes de proteger a coluna e falhou (0x8004f508).
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_validadorcliente"
$coluna = "cr40f_senhahash"
$perfilNome = "Portal do cliente - senha"
$perfilDescricao = "Le e grava o hash da senha do portal (cr40f_validadorcliente.cr40f_senhahash). Membro: so o usuario de aplicacao do Worker do portal."
$caminho = "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.StringAttributeMetadata"

$attr = Invoke-Dv "GET" $caminho
$app = @(Get-Rows "systemusers" "systemuserid" "applicationid eq $AppIdPortal")
if ($app.Count -ne 1) { throw "Usuario de aplicacao $AppIdPortal nao encontrado." }
$perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilNome'")

if (-not $Apply) {
  Write-Step "DRY RUN: perfil '$perfilNome' $(if ($perfis.Count) { 'existe' } else { 'seria criado' }); $coluna IsSecured=$($attr.IsSecured) auditoria=$($attr.IsAuditEnabled.Value)."
  return
}

# 1. Coluna protegida e sem auditoria (o historico guardaria o hash). Vem antes do perfil: o Dataverse so aceita
# fieldpermission em coluna ja protegida. O Worker fica sem ler o hash por alguns segundos, ate entrar no perfil.
if (-not $attr.IsSecured -or $attr.IsAuditEnabled.Value) {
  $attr.PSObject.Properties.Remove("@odata.context")
  $attr.IsSecured = $true
  $attr.IsAuditEnabled.Value = $false
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$tabela')/Attributes($($attr.MetadataId))" $attr @{ "MSCRM.MergeLabels" = "true" } | Out-Null
  Publish-Tabela $tabela
  Write-Step "$tabela.$coluna com seguranca de coluna e sem auditoria"
}

# 2. Perfil, permissao e membro (o perfil pode ja existir: a 1700 o criou antes de falhar).
if ($perfis.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles" @{ name = $perfilNome; description = $perfilDescricao } | Out-Null
  $perfis = @(Get-Rows "fieldsecurityprofiles" "fieldsecurityprofileid" "name eq '$perfilNome'")
  Write-Step "criado o perfil '$perfilNome'"
}
$perfilId = [string] $perfis[0].fieldsecurityprofileid
Add-ComponenteNaSolucao $perfilId 70

$permissao = @{ canread = 4; cancreate = 4; canupdate = 4 }
$fp = @(Get-Rows "fieldpermissions" "fieldpermissionid,canread,cancreate,canupdate" "_fieldsecurityprofileid_value eq $perfilId and entityname eq '$tabela' and attributelogicalname eq '$coluna'")
if ($fp.Count -eq 0) {
  Invoke-Dv "POST" "fieldpermissions" ($permissao + @{ "fieldsecurityprofileid@odata.bind" = "/fieldsecurityprofiles($perfilId)"; entityname = $tabela; attributelogicalname = $coluna }) | Out-Null
} elseif ($fp[0].canread -ne 4 -or $fp[0].cancreate -ne 4 -or $fp[0].canupdate -ne 4) {
  Invoke-Dv "PATCH" "fieldpermissions($($fp[0].fieldpermissionid))" $permissao | Out-Null
}

$uid = [string] $app[0].systemuserid
$ja = @((Invoke-Dv "GET" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association?`$select=systemuserid&`$filter=systemuserid eq $uid").value)
if ($ja.Count -eq 0) {
  Invoke-Dv "POST" "fieldsecurityprofiles($perfilId)/systemuserprofiles_association/`$ref" @{ "@odata.id" = "$script:DvApi/systemusers($uid)" } | Out-Null
  Write-Step "usuario de aplicacao do portal entrou no perfil"
}

$fim = Invoke-Dv "GET" $caminho
if (-not $fim.IsSecured -or $fim.IsAuditEnabled.Value) { throw "$coluna nao ficou protegida (IsSecured=$($fim.IsSecured), auditoria=$($fim.IsAuditEnabled.Value))." }
Write-Step "OK: $coluna protegida; perfil '$perfilNome' com o Worker do portal."
