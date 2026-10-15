# Cria no DEV as colunas da análise de despesas por IA em cr40f_despesaoperacional (solução AppBetinhos) e publica.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$entity = 'cr40f_despesaoperacional'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 120 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @p
}
$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function Base([string] $type, [string] $schema, [string] $nome) {
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label "Análise de despesa por IA: $nome."); RequiredLevel = @{ Value = 'None'; CanBeChanged = $true } }
}
function Opcoes([string[]] $nomes) { $i = 0; @($nomes | ForEach-Object { @{ Value = 100000000 + $i++; Label = (Label $_) } }) }
function Choice([string] $schema, [string] $nome, [string[]] $opcoes) {
  $a = Base 'PicklistAttributeMetadata' $schema $nome
  $a.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = (Opcoes $opcoes) }
  $a
}
function Texto([string] $schema, [string] $nome, [int] $max) { $a = Base 'StringAttributeMetadata' $schema $nome; $a.MaxLength = $max; $a.FormatName = @{ Value = 'Text' }; $a }
function Memo([string] $schema, [string] $nome) { $a = Base 'MemoAttributeMetadata' $schema $nome; $a.MaxLength = 100000; $a.Format = 'TextArea'; $a }

$colunas = @(
  (Choice 'cr40f_IaStatusAnalise' 'IA: status da análise' @('Pendente', 'Processando', 'Concluída', 'Erro')),
  (Choice 'cr40f_IaDecisao' 'IA: decisão' @('Validar', 'Precisa corrigir')),
  (Memo 'cr40f_IaMotivos' 'IA: motivos'),
  ((Base 'MoneyAttributeMetadata' 'cr40f_IaValorLido' 'IA: valor lido') + @{ PrecisionSource = 2 }),
  ((Base 'DateTimeAttributeMetadata' 'cr40f_IaDataLida' 'IA: data lida') + @{ Format = 'DateOnly'; DateTimeBehavior = @{ Value = 'DateOnly' } }),
  (Texto 'cr40f_IaCnpjLido' 'IA: CNPJ lido' 20),
  (Texto 'cr40f_IaEstabelecimentoLido' 'IA: estabelecimento lido' 200),
  ((Base 'DecimalAttributeMetadata' 'cr40f_IaConfianca' 'IA: confiança') + @{ Precision = 2; MinValue = 0; MaxValue = 1 }),
  (Memo 'cr40f_IaJson' 'IA: resposta bruta'),
  ((Base 'DateTimeAttributeMetadata' 'cr40f_IaDataAnalise' 'IA: data da análise') + @{ Format = 'DateAndTime'; DateTimeBehavior = @{ Value = 'UserLocal' } }),
  (Texto 'cr40f_IaModelo' 'IA: modelo' 60)
)
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLower()
  $existe = $true
  try { Dv GET "EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$logical')?`$select=LogicalName" | Out-Null } catch { $existe = $false }
  if ($existe) { Write-Host "[schema] $logical já existe"; continue }
  Write-Host "[schema] criando $logical"
  Dv POST "EntityDefinitions(LogicalName='$entity')/Attributes" $c | Out-Null
}
Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>" } | Out-Null
foreach ($c in $colunas) { Dv GET "EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$($c.SchemaName.ToLower())')?`$select=LogicalName" | Out-Null }
Write-Host '[schema] colunas conferidas e publicadas'
