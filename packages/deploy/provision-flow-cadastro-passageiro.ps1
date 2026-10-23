# Cria (ou atualiza) no DEV o flow "Cadastro do passageiro | Link" (gatilho HTTP chamado pelo Worker do link público),
# na solução AppBetinhos; o distribuir-apos-push.ps1 leva o flow (tipo 29) para a BetinhosAutomacao.
# A definição vem de flows/cadastro-passageiro-link.json; site, biblioteca e pasta do SharePoint das fotos entram por parâmetro
# (nunca no repo). O Worker manda só o SHA-256 do token; o token puro não passa pelo Power Automate.
# Pré-requisitos: tabela cr40f_linkcadastro (provision-link-cadastro.ps1 -Apply), connection references de Dataverse
# e SharePoint na solução, e `az login --use-device-code` no DEV. Idempotente. Sem -Apply só confere e mostra o que faria.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[^/]+\.sharepoint\.com/sites/[^/]+$')] [string] $SiteUrl,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[0-9a-fA-F-]{36}$')] [string] $BibliotecaId,
  [Parameter(Mandatory = $true)] [ValidatePattern('^/')] [string] $Pasta,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaSharePoint,
  [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Cadastro do passageiro | Link'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  if ($Method -ne 'GET' -and -not $Apply) { Write-Host "[cadastro-passageiro] DRY RUN $Method $($Path.Split('?')[0])"; return $null }
  Write-Host "[cadastro-passageiro] $Method $($Path.Split('?')[0])"
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

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if ($Apply -and -not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# 1. Entity sets lidos da metadata, não supostos.
function EntitySet([string] $logical) {
  $set = (Dv GET "EntityDefinitions(LogicalName='$logical')?`$select=EntitySetName").EntitySetName
  if (-not $set) { throw "Tabela $logical ausente no DEV." }
  return $set
}
$setLinks = EntitySet 'cr40f_linkcadastro'
$setPassageiros = EntitySet 'cr40f_bancodedados'
$setServicos = EntitySet 'cr40f_servicosporpassageiro'
$setReservas = EntitySet 'cr40f_reservadeveculos'
foreach ($campo in 'new_linkdafoto', 'cr40f_telefone', 'cr40f_email', 'cr40f_nomedopassageiro') {
  if (-not @((Dv GET "EntityDefinitions(LogicalName='cr40f_bancodedados')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$campo'").value).Count) { throw "Coluna cr40f_bancodedados.$campo ausente no DEV." }
}

# 2. Connection references (Dataverse e SharePoint).
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
function Referencia([string] $conector, [string] $preferida, [string] $parametro) {
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    if (@($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida }).Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -$parametro."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse 'ReferenciaDataverse'
$refSharePoint = Referencia 'shared_sharepointonline' $ReferenciaSharePoint 'ReferenciaSharePoint'

# 3. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\cadastro-passageiro-link.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__SET_LINKS__', $setLinks).Replace('__SET_PASSAGEIROS__', $setPassageiros).Replace('__SET_SERVICOS__', $setServicos).Replace('__SET_RESERVAS__', $setReservas)
$raw = $raw.Replace('__SITE_URL__', $SiteUrl.TrimEnd('/')).Replace('__LIBRARY_ID__', $BibliotecaId.ToLowerInvariant()).Replace('__FOLDER_PATH__', $Pasta.TrimEnd('/'))
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_sharepointonline = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refSharePoint }; api = @{ name = 'shared_sharepointonline' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 4. Cria ou atualiza o flow, inclui na solução e ativa.
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($flows.Count) {
  $flowId = $flows[0].workflowid
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
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Recebe do Worker do link público (só o hash do token) a leitura dos passageiros do serviço e o envio de foto, telefone e e-mail.' } | Out-Null
  if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo, na $solutionName. Copie a URL do gatilho (com SAS) no Power Automate para o secret FLOW_URL do Worker."
