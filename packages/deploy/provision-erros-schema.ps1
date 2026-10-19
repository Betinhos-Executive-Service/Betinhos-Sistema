# Somente DEV. Cria (idempotente) a tabela cr40f_errodosistema na solução AppBetinhos, publica e concede
# Create/Read (nível Usuário) aos papéis que usam o shell, para o app registrar os próprios erros.
# Quem lê e trata os erros é o plantão (skill plantao-erros), com credencial de administrador.
# Valores dos choices: 100000000 + índice na ordem abaixo.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$papeis = @('Acesso-Betinhos-Canvas', 'Acesso-Betinhos-MDA', 'DEV - Usuário')
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[erros-schema] $Method $($Path.Split('?')[0])"
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 180 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  $bytes = (Invoke-WebRequest @p -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function Base([string] $type, [string] $schema, [string] $nome) {
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label "Erro do sistema: $nome."); RequiredLevel = @{ Value = 'None'; CanBeChanged = $true } }
}
function Opcoes([string[]] $nomes) { $i = 0; @($nomes | ForEach-Object { @{ Value = 100000000 + $i++; Label = (Label $_) } }) }
function Choice([string] $schema, [string] $nome, [string[]] $opcoes) {
  $a = Base 'PicklistAttributeMetadata' $schema $nome
  $a.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = (Opcoes $opcoes) }
  $a
}
function Texto([string] $schema, [string] $nome, [int] $max) { $a = Base 'StringAttributeMetadata' $schema $nome; $a.MaxLength = $max; $a.FormatName = @{ Value = 'Text' }; $a }
function Memo([string] $schema, [string] $nome) { $a = Base 'MemoAttributeMetadata' $schema $nome; $a.MaxLength = 100000; $a.Format = 'TextArea'; $a }

$entidade = 'cr40f_errodosistema'
$existe = $true
try { Dv GET "EntityDefinitions(LogicalName='$entidade')?`$select=LogicalName" | Out-Null } catch { $existe = $false }
if ($existe) { Write-Host "[erros-schema] tabela $entidade já existe" } else {
  $primaria = Texto 'cr40f_ErroDoSistemaNome' 'Resumo' 200
  $primaria.IsPrimaryName = $true
  Dv POST EntityDefinitions @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName = 'cr40f_ErroDoSistema'; DisplayName = (Label 'Erro do sistema'); DisplayCollectionName = (Label 'Erros do sistema')
    Description = (Label 'Erro capturado no app (shell) para o plantão de correção automática.')
    OwnershipType = 'UserOwned'; HasActivities = $false; HasNotes = $false; IsActivity = $false; Attributes = @($primaria)
  } | Out-Null
}

$COLUNAS = @(
  (Choice 'cr40f_Origem' 'Origem' @('App', 'Flow', 'Plugin')),
  (Texto 'cr40f_Assinatura' 'Assinatura' 64),
  (Texto 'cr40f_Mensagem' 'Mensagem' 2000),
  (Memo 'cr40f_Detalhe' 'Detalhe (stack)'),
  (Texto 'cr40f_Rota' 'Rota' 300),
  (Texto 'cr40f_Versao' 'Versão do app' 60),
  (Texto 'cr40f_Navegador' 'Navegador' 300),
  (Choice 'cr40f_Situacao' 'Situação' @('Novo', 'Em correção', 'Corrigido', 'Ignorado')),
  (Texto 'cr40f_Pr' 'PR da correção' 300)
)
foreach ($c in $COLUNAS) {
  $logical = $c.SchemaName.ToLower()
  $tem = $true
  try { Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='$logical')?`$select=LogicalName" | Out-Null } catch { $tem = $false }
  if ($tem) { Write-Host "[erros-schema] $entidade.$logical já existe" } else { Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" $c | Out-Null }
}

Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entidade</entity></entities></importexportxml>" } | Out-Null

# Create e Read no nível Usuário: cada usuário grava e enxerga só os erros que ele mesmo gerou.
$priv = @{}
foreach ($nome in "prvCreate$entidade", "prvRead$entidade") {
  $r = @((Dv GET "privileges?`$select=privilegeid,name&`$filter=name eq '$nome'").value)
  if ($r.Count -ne 1) { throw "Privilégio $nome não encontrado." }
  $priv[$nome] = $r[0].privilegeid
}
foreach ($papel in $papeis) {
  $nomeOData = $papel.Replace("'", "''")
  $rs = @((Dv GET "roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$nomeOData' and _parentroleid_value eq null").value)
  if ($rs.Count -ne 1) { throw "Papel '$papel' não encontrado (ou ambíguo) na unidade raiz: $($rs.Count)." }
  $concessoes = @($priv.GetEnumerator() | ForEach-Object {
    @{ '@odata.type' = 'Microsoft.Dynamics.CRM.RolePrivilege'; PrivilegeId = $_.Value; Depth = 'Basic'; BusinessUnitId = $rs[0]._businessunitid_value; PrivilegeName = $_.Key }
  })
  Dv POST "roles($($rs[0].roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $atual = @((Dv GET "roleprivilegescollection?`$select=privilegeid&`$filter=roleid eq $($rs[0].roleid)").value) | Where-Object { $priv.Values -contains $_.privilegeid }
  if (@($atual).Count -lt 2) { throw "$papel ficou com $(@($atual).Count) de 2 privilégios." }
  Write-Host "[erros-schema] ${papel}: Create/Read (Usuário) em $entidade"
}

# Conferência por leitura de volta.
$set = (Dv GET "EntityDefinitions(LogicalName='$entidade')?`$select=EntitySetName").EntitySetName
if ($set -ne 'cr40f_errodosistemas') { throw "EntitySetName inesperado: $set. Ajuste apps/shell/src/app/erros.ts." }
foreach ($c in $COLUNAS) { Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='$($c.SchemaName.ToLower())')?`$select=LogicalName" | Out-Null }
Write-Output "DEV: $entidade ($set) criada, publicada, conferida na $solutionName e liberada para $($papeis -join ', ')."
