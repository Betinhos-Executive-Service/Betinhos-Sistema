# Somente DEV. Cria (idempotente) as tabelas cr40f_agenteexecucao e cr40f_agenteproposta na solução AppBetinhos e publica.
# Valores dos choices: 100000000 + índice na ordem abaixo (ver docs/superpowers/plans/2026-10-14-agentes-departamento.md).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[agentes-schema] $Method $($Path.Split('?')[0])"
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
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label "Agentes por departamento: $nome."); RequiredLevel = @{ Value = 'None'; CanBeChanged = $true } }
}
function Opcoes([string[]] $nomes) { $i = 0; @($nomes | ForEach-Object { @{ Value = 100000000 + $i++; Label = (Label $_) } }) }
function Choice([string] $schema, [string] $nome, [string[]] $opcoes) {
  $a = Base 'PicklistAttributeMetadata' $schema $nome
  $a.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = (Opcoes $opcoes) }
  $a
}
function Texto([string] $schema, [string] $nome, [int] $max) { $a = Base 'StringAttributeMetadata' $schema $nome; $a.MaxLength = $max; $a.FormatName = @{ Value = 'Text' }; $a }
function Memo([string] $schema, [string] $nome) { $a = Base 'MemoAttributeMetadata' $schema $nome; $a.MaxLength = 100000; $a.Format = 'TextArea'; $a }
function Inteiro([string] $schema, [string] $nome) { $a = Base 'IntegerAttributeMetadata' $schema $nome; $a.Format = 'None'; $a.MinValue = 0; $a.MaxValue = 100000000; $a }
function DataHora([string] $schema, [string] $nome) { $a = Base 'DateTimeAttributeMetadata' $schema $nome; $a.Format = 'DateAndTime'; $a.DateTimeBehavior = @{ Value = 'UserLocal' }; $a }

function Tabela([string] $schema, [string] $nome, [string] $plural, [string] $descricao) {
  $logical = $schema.ToLower()
  $existe = $true
  try { Dv GET "EntityDefinitions(LogicalName='$logical')?`$select=LogicalName" | Out-Null } catch { $existe = $false }
  if ($existe) { Write-Host "[agentes-schema] tabela $logical já existe"; return }
  $primaria = Texto "${schema}Nome" 'Nome' 200
  $primaria.IsPrimaryName = $true
  $body = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName = $schema; DisplayName = (Label $nome); DisplayCollectionName = (Label $plural); Description = (Label $descricao)
    OwnershipType = 'UserOwned'; HasActivities = $false; HasNotes = $false; IsActivity = $false; Attributes = @($primaria)
  }
  Dv POST EntityDefinitions $body | Out-Null
}
function Coluna([string] $entidade, $c) {
  $logical = $c.SchemaName.ToLower()
  $existe = $true
  try { Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='$logical')?`$select=LogicalName" | Out-Null } catch { $existe = $false }
  if ($existe) { Write-Host "[agentes-schema] $entidade.$logical já existe"; return }
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" $c | Out-Null
}
function Lookup([string] $nomeRelacao, [string] $de, [string] $para, [string] $schemaLookup, [string] $rotulo) {
  $existe = $true
  try { Dv GET "RelationshipDefinitions(SchemaName='$nomeRelacao')?`$select=SchemaName" | Out-Null } catch { $existe = $false }
  if ($existe) { Write-Host "[agentes-schema] relação $nomeRelacao já existe"; return }
  $body = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'; SchemaName = $nomeRelacao; ReferencedEntity = $para; ReferencingEntity = $de
    CascadeConfiguration = @{ Assign = 'NoCascade'; Delete = 'RemoveLink'; Merge = 'NoCascade'; Reparent = 'NoCascade'; Share = 'NoCascade'; Unshare = 'NoCascade' }
    Lookup = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'; SchemaName = $schemaLookup; DisplayName = (Label $rotulo); RequiredLevel = @{ Value = 'None'; CanBeChanged = $true } }
  }
  Dv POST RelationshipDefinitions $body | Out-Null
}

$TIPOS = @('SemRecibo', 'OPPendenteAntiga', 'RepasseAguardando', 'MargemNegativa', 'OSSemCobranca', 'ServicoSemMotorista', 'ServicoSemVeiculo', 'ConflitoHorario', 'MotoristaSemVeiculoAtual', 'CNHVencendo', 'ASOVencendo', 'DocumentoVencido', 'Aniversario', 'MultaSemMotorista', 'ComunicadoSugerido', 'FrotaPrioridade', 'FrotaReincidencia', 'FrotaPreventiva', 'FrotaAgendadaVencida', 'FrotaCustoAlto', 'FrotaHodometro')
$AGENTES = @('Financeiro', 'Logística', 'Pessoas', 'Frota')

Tabela 'cr40f_agenteexecucao' 'Execução de agente' 'Execuções de agente' 'Uma rodada do assistente de departamento (Claude): contexto, resposta e custo.'
$exec = 'cr40f_agenteexecucao'
foreach ($c in @(
  (Choice 'cr40f_Agente' 'Agente' $AGENTES),
  (Choice 'cr40f_Origem' 'Origem' @('Agendado', 'Manual')),
  (Texto 'cr40f_Pergunta' 'Pergunta' 2000),
  (Choice 'cr40f_Status' 'Status' @('Pendente', 'Processando', 'Concluída', 'Erro')),
  (Texto 'cr40f_Erro' 'Erro' 2000),
  (Memo 'cr40f_Contexto' 'Contexto enviado'),
  (Memo 'cr40f_Resposta' 'Resposta bruta'),
  (Texto 'cr40f_Resumo' 'Resumo' 500),
  (Texto 'cr40f_Modelo' 'Modelo' 100),
  (Inteiro 'cr40f_TokensEntrada' 'Tokens de entrada'),
  (Inteiro 'cr40f_TokensSaida' 'Tokens de saída')
)) { Coluna $exec $c }

Tabela 'cr40f_agenteproposta' 'Proposta de agente' 'Propostas de agente' 'Proposta gerada por um assistente de departamento e a decisão humana sobre ela.'
$prop = 'cr40f_agenteproposta'
foreach ($c in @(
  (Choice 'cr40f_Tipo' 'Tipo' $TIPOS),
  (Texto 'cr40f_Titulo' 'Título' 200),
  (Texto 'cr40f_Justificativa' 'Justificativa' 2000),
  (Choice 'cr40f_Prioridade' 'Prioridade' @('Alta', 'Média', 'Baixa')),
  (Texto 'cr40f_EntidadeAlvo' 'Entidade alvo' 100),
  (Texto 'cr40f_IdAlvo' 'Id alvo' 40),
  (Memo 'cr40f_Acao' 'Ação (JSON)'),
  (Choice 'cr40f_Decisao' 'Decisão' @('Pendente', 'Aprovada', 'Descartada')),
  (Texto 'cr40f_MotivoDescarte' 'Motivo do descarte' 500),
  (DataHora 'cr40f_DecididoEm' 'Decidido em')
)) { Coluna $prop $c }
Lookup 'cr40f_agenteexecucao_agenteproposta_execucao' $prop $exec 'cr40f_Execucao' 'Execução'
Lookup 'cr40f_systemuser_agenteproposta_decididopor' $prop 'systemuser' 'cr40f_DecididoPor' 'Decidido por'

# Choice já criado em versão anterior: acrescenta as opções novas (Agente Frota) com o valor fixo 100000000 + índice.
function GarantirOpcoes([string] $entidade, [string] $coluna, [string[]] $nomes) {
  $atuais = @((Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)").OptionSet.Options | ForEach-Object { $_.Value })
  for ($i = 0; $i -lt $nomes.Count; $i++) {
    $valor = 100000000 + $i
    if ($atuais -contains $valor) { continue }
    Dv POST InsertOptionValue @{ EntityLogicalName = $entidade; AttributeLogicalName = $coluna; Value = $valor; Label = (Label $nomes[$i]); SolutionUniqueName = $solutionName } | Out-Null
    Write-Host "[agentes-schema] $entidade.$coluna ganhou $valor ($($nomes[$i]))"
  }
}
GarantirOpcoes $exec 'cr40f_agente' $AGENTES
GarantirOpcoes $prop 'cr40f_tipo' $TIPOS

Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$exec</entity><entity>$prop</entity></entities></importexportxml>" } | Out-Null

# Conferência por leitura de volta: nomes dos sets, colunas e lookups.
$sets = @{}
foreach ($e in $exec, $prop) { $sets[$e] = (Dv GET "EntityDefinitions(LogicalName='$e')?`$select=EntitySetName").EntitySetName }
if ($sets[$exec] -ne 'cr40f_agenteexecucaos' -or $sets[$prop] -ne 'cr40f_agentepropostas') { throw "EntitySetName inesperado: $($sets | ConvertTo-Json -Compress). Ajuste queries.ts e o flow." }
foreach ($col in 'cr40f_agente', 'cr40f_origem', 'cr40f_pergunta', 'cr40f_status', 'cr40f_erro', 'cr40f_contexto', 'cr40f_resposta', 'cr40f_resumo', 'cr40f_modelo', 'cr40f_tokensentrada', 'cr40f_tokenssaida') { Dv GET "EntityDefinitions(LogicalName='$exec')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
foreach ($col in 'cr40f_tipo', 'cr40f_titulo', 'cr40f_justificativa', 'cr40f_prioridade', 'cr40f_entidadealvo', 'cr40f_idalvo', 'cr40f_acao', 'cr40f_decisao', 'cr40f_motivodescarte', 'cr40f_decididoem', 'cr40f_execucao', 'cr40f_decididopor') { Dv GET "EntityDefinitions(LogicalName='$prop')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
$tipo = Dv GET "EntityDefinitions(LogicalName='$prop')/Attributes(LogicalName='cr40f_tipo')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
if (@($tipo.OptionSet.Options).Count -ne $TIPOS.Count) { throw "cr40f_tipo tem $(@($tipo.OptionSet.Options).Count) opções; esperado $($TIPOS.Count)." }
Write-Output "DEV: $exec ($($sets[$exec])) e $prop ($($sets[$prop])) criadas, publicadas e conferidas na $solutionName."
