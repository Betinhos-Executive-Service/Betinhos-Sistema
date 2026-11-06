# Somente DEV. Cria (idempotente) em cr40f_pagantes as colunas do destinatário do recibo, na solução AppBetinhos, publica e confere.
#   cr40f_destinatariorecibo: lookup para cr40f_bancodedados. Pessoa cadastrada que recebe o recibo.
#   cr40f_emailrecibo: e-mail digitado sem cadastro. O recibo vai para ele e saúda o pagante.
# As duas vazias: o recibo vai para o próprio pagante. Quem grava é o plugin Gerar Pagantes; os flows de recibo leem.
# Roda antes do PR que passa a usar as colunas: a tela pede as duas no $select.
# Para conferir sem gravar nada:
#   powershell -File packages/deploy/provision-recibo-destinatario-schema.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV. Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).
param([switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$entidade = 'cr40f_pagantes'
$relacionamento = 'cr40f_bancodedados_cr40f_pagantes_destinatariorecibo'
function Write-Step([string] $m) { Write-Host "[recibo-destinatario] $m" }

$inicio = [IO.File]::ReadAllBytes($PSCommandPath)[0..2]
if ($inicio[0] -ne 0xEF -or $inicio[1] -ne 0xBB -or $inicio[2] -ne 0xBF) { throw "$PSCommandPath sem BOM UTF-8." }

$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  if ($SomenteValidar -and $Method -ne 'GET') { throw "Modo -SomenteValidar tentou gravar ($Method $Path)." }
  Write-Host "[recibo-destinatario] $Method $($Path.Split('?')[0])"
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 180 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  $bytes = (Invoke-WebRequest @p -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return @((Dv GET $Path).value) }
if ((Dv GET WhoAmI).OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function TemAtributo([string] $logical) {
  return @(Rows "EntityDefinitions(LogicalName='$entidade')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$logical'").Count -eq 1
}

$gravou = $false
if (TemAtributo 'cr40f_emailrecibo') { Write-Step 'cr40f_emailrecibo já existe' }
elseif ($SomenteValidar) { Write-Step 'criaria cr40f_emailrecibo' }
else {
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'; SchemaName = 'cr40f_EmailRecibo'
    DisplayName = (Label 'E-mail do recibo'); Description = (Label 'E-mail digitado sem cadastro para receber o recibo.')
    RequiredLevel = @{ Value = 'None'; CanBeChanged = $true }; MaxLength = 320; FormatName = @{ Value = 'Email' }
  } | Out-Null
  $gravou = $true
}

if (TemAtributo 'cr40f_destinatariorecibo') { Write-Step 'cr40f_destinatariorecibo já existe' }
elseif ($SomenteValidar) { Write-Step 'criaria cr40f_destinatariorecibo' }
else {
  Dv POST 'RelationshipDefinitions' @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'; SchemaName = $relacionamento
    ReferencedEntity = 'cr40f_bancodedados'; ReferencedAttribute = 'cr40f_bancodedadosid'; ReferencingEntity = $entidade
    CascadeConfiguration = @{ Assign = 'NoCascade'; Delete = 'RemoveLink'; Merge = 'NoCascade'; Reparent = 'NoCascade'; Share = 'NoCascade'; Unshare = 'NoCascade' }
    Lookup = @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'; SchemaName = 'cr40f_DestinatarioRecibo'
      DisplayName = (Label 'Destinatário do recibo'); Description = (Label 'Pessoa cadastrada que recebe o recibo no lugar do pagante.')
      RequiredLevel = @{ Value = 'None'; CanBeChanged = $true }
    }
  } | Out-Null
  $gravou = $true
}

if ($SomenteValidar) { Write-Step 'validação concluída; nada foi gravado'; exit 0 }
if ($gravou) { Dv POST 'PublishXml' @{ ParameterXml = "<importexportxml><entities><entity>$entidade</entity></entities></importexportxml>" } | Out-Null }

foreach ($coluna in 'cr40f_emailrecibo', 'cr40f_destinatariorecibo') { if (-not (TemAtributo $coluna)) { throw "$coluna ausente depois da publicação." } }
$solutionId = (Rows "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'")[0].solutionid
$tabela = (Rows "EntityDefinitions?`$select=MetadataId&`$filter=LogicalName eq '$entidade'")[0].MetadataId
$noRaiz = @(Rows "solutioncomponents?`$select=rootcomponentbehavior&`$filter=_solutionid_value eq $solutionId and objectid eq $tabela and componenttype eq 1")
if ($noRaiz.Count -ne 1) { throw "$entidade fora da solução $solutionName." }
Write-Step 'colunas publicadas e conferidas'
