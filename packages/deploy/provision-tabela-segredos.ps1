# Somente DEV, à mão, do checkout principal na develop atualizada. Cria (idempotente) a tabela cr40f_segredo ("Segredo"),
# que guarda as chaves que antes ficavam em variável de ambiente (que qualquer Basic User lê pela Web API). Sem Azure:
# a proteção é a segurança de coluna em cr40f_valor. O distribuidor leva tabela, colunas, chave e perfil à BetinhosCore
# (tipos 1 e 70 em solucoes/regras.json). Os REGISTROS nunca entram em solução: cada ambiente grava os seus com
# gravar-segredo.ps1.
# - cr40f_name: nome do segredo (ex.: anthropic.combustivel), chave alternativa cr40f_segredounico;
# - cr40f_valor: texto até 4000, IsSecured, sem auditoria;
# - cr40f_descricao: para que serve e quem consome;
# - perfil de segurança de coluna "Segredos – automação" com leitura e gravação em cr40f_valor, sem membros por padrão.
#   Administrador do sistema sempre lê; plugin com CreateOrganizationService(null) roda como SYSTEM. Conta de flow que não
#   for administrador (ex.: noreply) entra no perfil com -Membros noreply@... (ou na UI: Configurações > Segurança >
#   Perfis de segurança de coluna > Segredos – automação > Usuários). Ela também precisa de leitura na tabela, que nenhum
#   papel tem: dê por um papel próprio só dessa conta, nunca por um papel de uso geral.
# - nenhum papel recebe privilégio na tabela; o script retira os que o Dataverse concede sozinho a tabela nova (ex.:
#   Personalizador do Sistema) e só o Administrador do Sistema fica.
# Para conferir sem gravar nada: powershell -File packages/deploy/provision-tabela-segredos.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV. Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).
param([switch] $SomenteValidar, [string[]] $Membros = @())
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$perfilNome = 'Segredos – automação'
$perfilDescricao = 'Leitura e gravação do valor dos segredos (cr40f_segredo.cr40f_valor). Sem membros: administradores e plugins (SYSTEM) já leem.'
$adminTemplate = '627090ff-40a3-4053-8790-584edc5be201'  # roletemplateid do Administrador do Sistema
$supportTemplate = '2d101bb3-5ced-4122-83f1-94d5efde4e3b'  # Usuário de Suporte (a plataforma recusa alterar)
function Write-Step([string] $m) { Write-Host "[segredos-schema] $m" }

$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  if ($SomenteValidar -and $Method -ne 'GET') { throw "Modo -SomenteValidar tentou gravar ($Method $Path)." }
  Write-Step "$Method $($Path.Split('?')[0])"
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 180; UseBasicParsing = $true }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  $bytes = (Invoke-WebRequest @p).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return @((Dv GET $Path).value) }
function Esc([string] $s) { return $s.Replace("'", "''") }
if ((Dv GET WhoAmI).OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @(Rows "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$solutionName'")
if ($solution.Count -ne 1 -or [bool]$solution[0].ismanaged) { throw "Solução $solutionName não é unmanaged única." }
$solutionId = $solution[0].solutionid

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function Base([string] $type, [string] $schema, [string] $nome, [string] $desc, [string] $req = 'None') {
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label $desc); RequiredLevel = @{ Value = $req; CanBeChanged = $true } }
}
function GetEntity() {
  $r = @(Rows "EntityDefinitions?`$select=MetadataId,EntitySetName&`$filter=LogicalName eq '$entidade'")
  if ($r.Count -eq 1) { return $r[0] } else { return $null }
}
function Atributo([string] $logical) {
  $r = @(Rows "EntityDefinitions(LogicalName='$entidade')/Attributes?`$select=LogicalName,IsSecured,IsAuditEnabled&`$filter=LogicalName eq '$logical'")
  if ($r.Count -eq 1) { return $r[0] } else { return $null }
}
function NaSolucao([string] $id, [int] $tipo) { return @(Rows "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and objectid eq $id and componenttype eq $tipo") }
function PapeisComPrivilegio($privs) {
  return @(foreach ($pv in $privs) {
    foreach ($r in @(Rows "privileges($($pv.privilegeid))/roleprivileges_association?`$select=roleid,name,_roletemplateid_value,iscustomizable")) {
      # Papéis de plataforma (Leitor/Gravador/Exclusão de Serviço, da AuthorizationCore) não aceitam alteração e só têm
      # usuários de aplicação da Microsoft; o Usuário de Suporte (só leitura, conta de suporte da Microsoft) também é
      # imutável. Ficam, e a coluna cr40f_valor continua protegida pela segurança de campo.
      if (-not $r.iscustomizable.Value -or "$($r._roletemplateid_value)" -eq $supportTemplate) { continue }
      if ("$($r._roletemplateid_value)" -ne $adminTemplate) { [pscustomobject]@{ privilegio = $pv; papel = $r } }
    }
  })
}

$entidade = 'cr40f_segredo'
$chave = 'cr40f_segredounico'
$valor = Base 'StringAttributeMetadata' 'cr40f_Valor' 'Valor' 'Valor do segredo. Coluna com segurança de campo; nunca auditada nem exibida em log.'
$valor.MaxLength = 4000; $valor.FormatName = @{ Value = 'Text' }; $valor.IsSecured = $true; $valor.IsAuditEnabled = @{ Value = $false; CanBeChanged = $true }
$descricao = Base 'StringAttributeMetadata' 'cr40f_Descricao' 'Descrição' 'Para que serve e quem consome (plugin, flow).'
$descricao.MaxLength = 1000; $descricao.FormatName = @{ Value = 'Text' }
$COLUNAS = @($valor, $descricao)

# 1. Tabela e colunas
$tabela = GetEntity
if (-not $tabela) {
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria a tabela $entidade" }
  else {
    $primaria = Base 'StringAttributeMetadata' 'cr40f_Name' 'Nome' 'Nome lógico do segredo, ex.: anthropic.combustivel.' 'ApplicationRequired'
    $primaria.MaxLength = 100; $primaria.FormatName = @{ Value = 'Text' }; $primaria.IsPrimaryName = $true
    Dv POST EntityDefinitions @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName = 'cr40f_Segredo'; DisplayName = (Label 'Segredo'); DisplayCollectionName = (Label 'Segredos')
      Description = (Label 'Chaves e client secrets lidos pelos plugins e flows. Valor protegido por segurança de coluna; registros nunca entram em solução.'); PrimaryNameAttribute = 'cr40f_name'
      OwnershipType = 'OrganizationOwned'; HasActivities = $false; HasNotes = $false; IsActivity = $false
      IsAuditEnabled = @{ Value = $false; CanBeChanged = $true }; ChangeTrackingEnabled = $false; Attributes = @($primaria)
    } | Out-Null
    $tabela = GetEntity
    if (-not $tabela) { throw "Tabela $entidade não apareceu depois do POST." }
  }
}
foreach ($c in $COLUNAS) {
  $logical = $c.SchemaName.ToLower()
  if ($tabela -and (Atributo $logical)) { Write-Step "$entidade.$logical já existe"; continue }
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria $entidade.$logical"; continue }
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" $c | Out-Null
}
$temChave = $false
if ($tabela) { $temChave = @(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=LogicalName&`$filter=LogicalName eq '$chave'").Count -eq 1 }
$perfis = @(Rows "fieldsecurityprofiles?`$select=fieldsecurityprofileid,description&`$filter=name eq '$(Esc $perfilNome)'")
if ($perfis.Count -gt 1) { throw "Perfil '$perfilNome' duplicado." }
$perfilId = if ($perfis.Count -eq 1) { [string]$perfis[0].fieldsecurityprofileid } else { $null }
if ($SomenteValidar) {
  Write-Output "VALIDAR OK: nada gravado no DEV; chave $(if ($temChave) { 'existe' } else { 'seria criada' }); perfil $(if ($perfilId) { 'existe' } else { 'seria criado' })."
  return
}

# 2. Chave, solução e publicação
if (-not $temChave) {
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Keys" @{ '@odata.type' = 'Microsoft.Dynamics.CRM.EntityKeyMetadata'; SchemaName = 'cr40f_SegredoUnico'; DisplayName = (Label 'Nome único'); KeyAttributes = @('cr40f_name') } | Out-Null
}
if (-not @(NaSolucao $tabela.MetadataId 1).Count) {
  Dv POST AddSolutionComponent @{ ComponentId = $tabela.MetadataId; ComponentType = 1; SolutionUniqueName = $solutionName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
}
Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entidade</entity></entities></importexportxml>" } | Out-Null

# 3. Perfil de segurança de coluna
if (-not $perfilId) {
  Dv POST fieldsecurityprofiles @{ name = $perfilNome; description = $perfilDescricao } | Out-Null
  $perfilId = [string]@(Rows "fieldsecurityprofiles?`$select=fieldsecurityprofileid&`$filter=name eq '$(Esc $perfilNome)'")[0].fieldsecurityprofileid
} elseif ($perfis[0].description -cne $perfilDescricao) { Dv PATCH "fieldsecurityprofiles($perfilId)" @{ description = $perfilDescricao } | Out-Null }
$fp = @(Rows "fieldpermissions?`$select=fieldpermissionid,canread,cancreate,canupdate&`$filter=_fieldsecurityprofileid_value eq $perfilId and entityname eq '$entidade' and attributelogicalname eq 'cr40f_valor'")
if ($fp.Count -gt 1) { throw "Perfil tem $($fp.Count) permissões para cr40f_valor; corrija à mão." }
$permissao = @{ canread = 4; cancreate = 4; canupdate = 4 }
if ($fp.Count -eq 0) { Dv POST fieldpermissions ($permissao + @{ 'fieldsecurityprofileid@odata.bind' = "/fieldsecurityprofiles($perfilId)"; entityname = $entidade; attributelogicalname = 'cr40f_valor' }) | Out-Null }
elseif ($fp[0].canread -ne 4 -or $fp[0].cancreate -ne 4 -or $fp[0].canupdate -ne 4) { Dv PATCH "fieldpermissions($($fp[0].fieldpermissionid))" $permissao | Out-Null }
if (-not @(NaSolucao $perfilId 70).Count) {
  Dv POST AddSolutionComponent @{ ComponentId = $perfilId; ComponentType = 70; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
}
foreach ($upn in $Membros) {
  $u = @(Rows "systemusers?`$select=systemuserid&`$filter=domainname eq '$(Esc $upn)'")
  if ($u.Count -ne 1) { throw "Usuário '$upn' não encontrado." }
  $ja = @(Rows "fieldsecurityprofiles($perfilId)/systemuserprofiles_association?`$select=systemuserid&`$filter=systemuserid eq $($u[0].systemuserid)")
  if ($ja.Count) { Write-Step "$upn já está no perfil"; continue }
  Dv POST "fieldsecurityprofiles($perfilId)/systemuserprofiles_association/`$ref" @{ '@odata.id' = "$environmentUrl/api/data/v9.2/systemusers($($u[0].systemuserid))" } | Out-Null
  Write-Step "$upn entrou no perfil"
}

# 4. Só o Administrador do Sistema com privilégio na tabela
$privs = @(Rows "privileges?`$select=privilegeid,name&`$filter=endswith(name,'cr40f_segredo')")
foreach ($x in (PapeisComPrivilegio $privs)) {
  Dv POST "roles($($x.papel.roleid))/Microsoft.Dynamics.CRM.RemovePrivilegeRole" @{ Privilege = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.privilege'; privilegeid = $x.privilegio.privilegeid } } | Out-Null
  Write-Step "$($x.privilegio.name) retirado do papel $($x.papel.name)"
}

# 5. Conferência
$set = (Dv GET "EntityDefinitions(LogicalName='$entidade')?`$select=EntitySetName").EntitySetName
if ($set -ne 'cr40f_segredos') { throw "EntitySetName inesperado: $set (gravar-segredo.ps1 usa cr40f_segredos)." }
foreach ($l in 'cr40f_name', 'cr40f_valor', 'cr40f_descricao') { if (-not (Atributo $l)) { throw "Coluna $l ausente após publicar." } }
$attrValor = Atributo 'cr40f_valor'
if (-not $attrValor.IsSecured) { throw 'cr40f_valor não está com segurança de coluna (IsSecured).' }
if ($attrValor.IsAuditEnabled.Value) { throw 'cr40f_valor está com auditoria ligada; desligue (o valor nunca pode ir para o log de auditoria).' }
$status = ''
for ($i = 1; $i -le 20; $i++) {
  $status = "$(@(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=EntityKeyIndexStatus&`$filter=LogicalName eq '$chave'") | Select-Object -First 1 -ExpandProperty EntityKeyIndexStatus)"
  if ($status -in 'Active', 'Failed') { break }
  Start-Sleep -Seconds 15
}
if ($status -ne 'Active') { throw "Chave $chave com índice $status (esperado Active)." }
if (@(NaSolucao $tabela.MetadataId 1).Count -ne 1) { throw "Tabela $entidade não está na $solutionName." }
if (@(NaSolucao $perfilId 70).Count -ne 1) { throw "Perfil '$perfilNome' não está na $solutionName." }
if (-not $privs.Count) { throw "Privilégios de $entidade não encontrados (a tabela foi publicada?)." }
$sobra = @(PapeisComPrivilegio $privs)
if ($sobra.Count) { throw "Papéis ainda com privilégio em ${entidade}: $(@($sobra | ForEach-Object { $_.papel.name } | Sort-Object -Unique) -join ', ')" }
Write-Output "DEV: $entidade ($set), chave e perfil '$perfilNome' conferidos na $solutionName; só o Administrador do Sistema tem privilégio. Próximo passo: gravar-segredo.ps1 por segredo."
