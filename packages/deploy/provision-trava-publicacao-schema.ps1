# Somente DEV. Cria (idempotente) a tabela cr40f_travapublicacao ("Trava de publicação") na solução AppBetinhos, publica e
# confere metadata e pertencimento. Uma linha por ambiente (dev, test, prod): dono e validade da publicação em andamento,
# usada pelo Sistema e pelo app-motoristas-v2 (solucoes/trava.ps1). O distribuidor leva a tabela ao BetinhosCore.
# Chave alternativa cr40f_travaunica em cr40f_name: dois runs não criam duas linhas para o mesmo ambiente.
# Para conferir sem gravar nada: powershell -File packages/deploy/provision-trava-publicacao-schema.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV. Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).
param([switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
function Write-Step([string] $m) { Write-Host "[trava-schema] $m" }

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
function TemAtributo([string] $logical) {
  return @(Rows "EntityDefinitions(LogicalName='$entidade')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$logical'").Count -eq 1
}
function NaSolucao($t) { return Rows "solutioncomponents?`$select=rootcomponentbehavior&`$filter=_solutionid_value eq $solutionId and objectid eq $($t.MetadataId) and componenttype eq 1" }

$entidade = 'cr40f_travapublicacao'
$chave = 'cr40f_travaunica'
$dono = Base 'StringAttributeMetadata' 'cr40f_Dono' 'Dono' 'Repositório e run que estão publicando.'
$dono.MaxLength = 200; $dono.FormatName = @{ Value = 'Text' }
$expira = Base 'DateTimeAttributeMetadata' 'cr40f_ExpiraEm' 'Expira em' 'Depois deste horário a trava pode ser tomada por outro run.'
$expira.Format = 'DateAndTime'
$COLUNAS = @($dono, $expira)

$tabela = GetEntity
if (-not $tabela) {
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria a tabela $entidade" }
  else {
    $primaria = Base 'StringAttributeMetadata' 'cr40f_Name' 'Ambiente' 'dev, test ou prod.' 'ApplicationRequired'
    $primaria.MaxLength = 20; $primaria.FormatName = @{ Value = 'Text' }; $primaria.IsPrimaryName = $true
    Dv POST EntityDefinitions @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName = 'cr40f_TravaPublicacao'; DisplayName = (Label 'Trava de publicação'); DisplayCollectionName = (Label 'Travas de publicação')
      Description = (Label 'Publicação em andamento por ambiente, entre o Sistema e o app-motoristas-v2.'); PrimaryNameAttribute = 'cr40f_name'
      OwnershipType = 'OrganizationOwned'; HasActivities = $false; HasNotes = $false; IsActivity = $false; Attributes = @($primaria)
    } | Out-Null
    $tabela = GetEntity
    if (-not $tabela) { throw "Tabela $entidade não apareceu depois do POST." }
  }
}
foreach ($c in $COLUNAS) {
  $logical = $c.SchemaName.ToLower()
  if ($tabela -and (TemAtributo $logical)) { Write-Step "$entidade.$logical já existe"; continue }
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria $entidade.$logical"; continue }
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" $c | Out-Null
}
$temChave = $false
if ($tabela) { $temChave = @(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=LogicalName&`$filter=LogicalName eq '$chave'").Count -eq 1 }
if ($SomenteValidar) { Write-Output "VALIDAR OK: nada gravado no DEV; chave $(if ($temChave) { 'existe' } else { 'seria criada' })."; return }
if (-not $temChave) {
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Keys" @{ '@odata.type' = 'Microsoft.Dynamics.CRM.EntityKeyMetadata'; SchemaName = 'cr40f_TravaUnica'; DisplayName = (Label 'Ambiente único'); KeyAttributes = @('cr40f_name') } | Out-Null
}
if (-not @(NaSolucao $tabela).Count) {
  Dv POST AddSolutionComponent @{ ComponentId = $tabela.MetadataId; ComponentType = 1; SolutionUniqueName = $solutionName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
}
Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entidade</entity></entities></importexportxml>" } | Out-Null

$set = (Dv GET "EntityDefinitions(LogicalName='$entidade')?`$select=EntitySetName").EntitySetName
if ($set -ne 'cr40f_travapublicacaos') { throw "EntitySetName inesperado: $set (trava.ps1 usa cr40f_travapublicacaos)." }
$faltando = @('cr40f_name', 'cr40f_dono', 'cr40f_expiraem' | Where-Object { -not (TemAtributo $_) })
if ($faltando.Count) { throw "Colunas ausentes após publicar: $($faltando -join ', ')" }
$status = ''
for ($i = 1; $i -le 20; $i++) {
  $status = "$(@(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=EntityKeyIndexStatus&`$filter=LogicalName eq '$chave'") | Select-Object -First 1 -ExpandProperty EntityKeyIndexStatus)"
  if ($status -in 'Active', 'Failed') { break }
  Start-Sleep -Seconds 15
}
if ($status -ne 'Active') { throw "Chave $chave com índice $status (esperado Active)." }
if (@(NaSolucao $tabela).Count -ne 1) { throw "Tabela $entidade não está na $solutionName." }
Write-Output "DEV: $entidade ($set) criada, publicada e conferida na $solutionName."
