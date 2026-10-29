# Cria (ou atualiza) no DEV o flow "Portal cliente – e-mails" (gatilho HTTP chamado pelo Worker do portal de validação),
# na solução AppBetinhos e na BetinhosAutomacao. Envia os e-mails de código, resumo diário e resposta da Betinhos
# pela caixa compartilhada do financeiro (Office 365 Outlook, SharedMailboxSendEmailV2).
# A definição vem de flows/portal-cliente-emails.json; os modelos HTML de flows/portal-cliente-emails/*.html entram
# no lugar dos tokens __TPL_*__; o endereço da caixa entra por parâmetro (nunca no repo).
# Pré-requisitos: connection reference do Office 365 Outlook na solução, com conexão de quem tem "Enviar como" na caixa,
# e `az login --use-device-code` no DEV. Idempotente. Sem -Apply só confere e mostra o que faria.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$')] [string] $CaixaCompartilhada,
  [string] $ReferenciaOutlook = 'new_sharedoffice365_f87d5',
  [switch] $Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$solucaoDestino = 'BetinhosAutomacao'
$flowName = 'Portal cliente – e-mails'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  if ($Method -ne 'GET' -and -not $Apply) { Write-Host "[portal-emails] DRY RUN $Method $($Path.Split('?')[0])"; return $null }
  Write-Host "[portal-emails] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solucoes = @{}
foreach ($nome in $solutionName, $solucaoDestino) {
  $s = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$nome'").value)
  if ($s.Count -ne 1) { throw "Solução $nome ausente ou ambígua." }
  $solucoes[$nome] = $s[0].solutionid
}

function Include([string] $id, [int] $type, [string] $solucao) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solucoes[$solucao]) and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { Write-Output "Já na ${solucao}: $type/$id"; return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solucao; AddRequiredComponents = $false } | Out-Null
  if ($Apply -and -not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solucao." }
}

# 1. Connection reference do Office 365 Outlook.
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
$candidatas = @($refs | Where-Object { $_.connectorid -like '*/shared_office365' })
if ($ReferenciaOutlook) {
  if (@($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $ReferenciaOutlook }).Count -ne 1) { throw "Connection reference '$ReferenciaOutlook' (shared_office365) não encontrada." }
  $refOutlook = $ReferenciaOutlook
} elseif ($candidatas.Count -eq 1) {
  $refOutlook = $candidatas[0].connectionreferencelogicalname
} else {
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de shared_office365 ($nomes). Informe uma com -ReferenciaOutlook."
}
Write-Output "Connection reference do Outlook: $refOutlook"

# 2. Definição do flow com os modelos HTML e a caixa trocados.
$pasta = Join-Path $PSScriptRoot 'flows'
$raw = [IO.File]::ReadAllText((Join-Path $pasta 'portal-cliente-emails.json'), [Text.Encoding]::UTF8)
$modelos = [ordered]@{
  __TPL_CODIGO__ = 'codigo.html'; __TPL_RESUMO__ = 'resumo-diario.html'; __TPL_LINHA_LIBERADO__ = 'resumo-linha-liberado.html'
  __TPL_LINHA_VENCENDO__ = 'resumo-linha-vencendo.html'; __TPL_RESPOSTA__ = 'resposta-betinhos.html'
}
foreach ($tok in $modelos.Keys) {
  $html = [IO.File]::ReadAllText((Join-Path $pasta "portal-cliente-emails\$($modelos[$tok])"), [Text.Encoding]::UTF8)
  if ($html.Contains('@{') -or $html.StartsWith('@')) { throw "Modelo $($modelos[$tok]) tem '@' que o Power Automate leria como expressão." }
  $raw = $raw.Replace("`"$tok`"", (ConvertTo-Json $html -Compress))
}
$raw = $raw.Replace('__CAIXA_COMPARTILHADA__', $CaixaCompartilhada.ToLowerInvariant())
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 3. Cria ou atualiza o flow, inclui nas soluções e ativa.
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
  Write-Output "Flow '$flowName' ainda não existe no DEV: será criado."
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Recebe do Worker do portal de validação os e-mails de código, resumo diário e resposta da Betinhos e envia pela caixa compartilhada do financeiro.' } | Out-Null
  if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29 $solutionName
Include $flowId 29 $solucaoDestino
if (-not $Apply) { Write-Output 'DRY RUN OK; use -Apply'; return }
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira a conexão da connection reference do Outlook no Power Automate.' }

# 4. URL do gatilho (com SAS) para o secret do Worker. Nunca é gravada em arquivo; só sai no console.
$url = $null
try {
  $paToken = & az account get-access-token --resource 'https://service.flow.microsoft.com/' --query accessToken -o tsv
  $envId = (Invoke-RestMethod -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $paToken" }).value |
    Where-Object { $_.properties.linkedEnvironmentMetadata.instanceUrl -like "$environmentUrl*" } | Select-Object -First 1 -ExpandProperty name
  $url = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$envId/flows/$flowId/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $paToken" }).response.value
} catch { Write-Warning "Não deu para ler a URL do gatilho pela API ($($_.Exception.Message))." }
Write-Output "DEV: '$flowName' ativo, na $solutionName e na $solucaoDestino."
if ($url) { Write-Output "URL do gatilho (secret do Worker, não cole em chat nem no repo):`n$url" }
else { Write-Output 'Copie a URL do gatilho (com SAS) no Power Automate para o secret do Worker.' }
