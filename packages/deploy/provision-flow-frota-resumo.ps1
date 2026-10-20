# Cria (ou atualiza) no DEV a coluna new_notificacoesfrota ("Notificações de frota") em cr40f_funcionarios e o flow
# "Frota | Resumo semanal" (quarta 08:00), na solução AppBetinhos. A definição vem de flows/frota-pendencias-semanal.json;
# o e-mail da noreply entra por parâmetro (nunca no repo). Usa as variáveis new_URLSistemaBetinhos e new_EmailAdminAvisos
# criadas por provision-flow-documentos-resumo.ps1.
# Pré-requisitos: Custom API cr40f_FrotaPendencias registrada (pnpm push:plugin:frota:dev), connection references de
# Dataverse e Office 365 Outlook na solução, e `az login --use-device-code` no DEV. Idempotente. Só da main.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $Remetente,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaOutlook
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Frota | Resumo semanal'
$customApi = 'cr40f_FrotaPendencias'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[frota-resumo] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid

function Include([string] $id, [int] $type, [string] $tabela = '') {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  if ($tabela) {
    # Tabela já na solução com todos os subcomponentes: a coluna vai junto e o Dataverse não grava linha própria para ela.
    $tabelaId = (Dv GET "EntityDefinitions(LogicalName='$tabela')?`$select=MetadataId").MetadataId
    if (@((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 1 and objectid eq $tabelaId and rootcomponentbehavior eq 0").value).Count) { return }
  }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# 1. A Custom API precisa existir antes do flow.
if (@((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").value).Count -ne 1) {
  throw "Custom API $customApi ausente no DEV. Rode 'pnpm push:plugin:frota:dev' antes."
}

# 2. Coluna "Notificações de frota" no funcionário (mesmo padrão de new_notificacoesoperacionais).
$coluna = 'new_notificacoesfrota'
$atributo = @((Dv GET "EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes?`$select=MetadataId&`$filter=LogicalName eq '$coluna'").value)
if (-not $atributo.Count) {
  $label = { param($t) @{ LocalizedLabels = @(@{ Label = $t; LanguageCode = 1046 }) } }
  Dv POST "EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes" @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'; SchemaName = $coluna; RequiredLevel = @{ Value = 'None' }; DefaultValue = $false
    DisplayName = (& $label 'Notificações de frota'); Description = (& $label 'Recebe o resumo semanal de pendências da frota (quarta 08:00).')
    OptionSet = @{ TrueOption = @{ Value = 1; Label = (& $label 'Sim') }; FalseOption = @{ Value = 0; Label = (& $label 'Não') } }
  } | Out-Null
  $atributo = @((Dv GET "EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes?`$select=MetadataId&`$filter=LogicalName eq '$coluna'").value)
  Dv POST PublishXml @{ ParameterXml = '<importexportxml><entities><entity>cr40f_funcionarios</entity></entities></importexportxml>' } | Out-Null
}
Include $atributo[0].MetadataId 2 'cr40f_funcionarios'

# 3. Connection references (Dataverse e Office 365 Outlook).
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
function Referencia([string] $conector, [string] $preferida) {
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    $escolhida = @($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida })
    if ($escolhida.Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -Referencia$(if ($conector -eq 'shared_office365') { 'Outlook' } else { 'Dataverse' })."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse
$refOutlook = Referencia 'shared_office365' $ReferenciaOutlook

# 4. Variáveis de ambiente (criadas pelo resumo de documentos).
foreach ($schema in 'new_URLSistemaBetinhos', 'new_EmailAdminAvisos') {
  if (-not @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value).Count) {
    throw "Variável $schema ausente no DEV. Rode provision-flow-documentos-resumo.ps1 antes."
  }
}

# 5. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\frota-pendencias-semanal.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__REMETENTE__', $Remetente)
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 6. Cria ou atualiza o flow, inclui na solução e ativa.
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  # O Dataverse normaliza o clientdata; compara só definição e referências de conexão, ambas normalizadas igual.
  $normalizar = { param($o) if ($null -eq $o) { '' } else { ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) } }
  $guardado = $flows[0].clientdata | ConvertFrom-Json
  $novo = $clientData | ConvertFrom-Json
  $mudou = (& $normalizar $guardado.properties.definition) -ne (& $normalizar $novo.properties.definition) -or
           (& $normalizar $guardado.properties.connectionReferences) -ne (& $normalizar $novo.properties.connectionReferences)
  Write-Output "Definição do flow alterada: $(if ($mudou) { 'sim, atualizando' } else { 'não, mantida' })"
  if ($mudou) {
    if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
    Dv PATCH "workflows($flowId)" @{ clientdata = $clientData } | Out-Null
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Toda quarta às 08:00 envia as pendências proativas da frota (Custom API cr40f_FrotaPendencias) a quem tem Notificações de frota marcado. Sem pendências, não envia.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo e coluna $coluna na $solutionName."
