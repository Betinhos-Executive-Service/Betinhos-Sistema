param([switch] $Apply)

# Cria (ou atualiza) no DEV o conector personalizado "Betinhos Banco MCP" (Open Finance da mcp.ai, só leitura) e a connection reference
# new_BetinhosBancoMcp, ambos na solução do .env. A definição vem de conectores/banco-mcp.openapi.json.
# A API key NUNCA passa por aqui: o Renan cria a conexão no Power Automate (Conexões > Nova > Betinhos Banco MCP), cola "Bearer sk_live_..."
# e liga a conexão à connection reference (Soluções > AppBetinhos > Referências de conexão). Só então o flow diário pode ser ligado.
# Windows: az login no DEV. Linux/macOS: packages/deploy/rodar-linux.sh provision-conector-banco-mcp.ps1 [-Apply]. Sem -Apply roda em DRY RUN.
# Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Write-Step([string] $Message) { Write-Host "[conector-banco-mcp] $Message" }

function Read-DotEnv([string] $Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  return $values
}
$dotEnv = Read-DotEnv (Join-Path $root '.env')
function Get-Setting([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $dotEnv.ContainsKey($Name)) { $value = $dotEnv[$Name] }
  return $value
}

$environmentUrl = Get-Setting 'DV_ENVIRONMENT_URL'
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw 'DV_ENVIRONMENT_URL ausente no .env.' }
$environmentUrl = $environmentUrl.TrimEnd('/')
$environmentHost = ([Uri] $environmentUrl).Host.ToLowerInvariant()
if ($environmentHost -eq 'orgf261ae8e.crm2.dynamics.com') { throw "$environmentHost é o PROD: este script nunca roda em PROD." }
$blockedHosts = @((Get-Setting 'DV_BLOCKED_HOSTS') -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw 'DV_BLOCKED_HOSTS ausente. Informe o host de PROD.' }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost está bloqueado (PROD exige pedido explícito)." }
$solutionName = Get-Setting 'DV_SOLUTION'
if ([string]::IsNullOrWhiteSpace($solutionName)) { throw 'DV_SOLUTION ausente no .env.' }

$dvToken = Get-Setting 'DV_ACCESS_TOKEN'
if ([string]::IsNullOrWhiteSpace($dvToken)) { $dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv }
if (-not $dvToken) { throw 'Token do Dataverse indisponível (rode az login ou informe DV_ACCESS_TOKEN).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 50 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  $bytes = (Invoke-WebRequest @params).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

Write-Step "ambiente $environmentHost, solução $solutionName, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw "Solução $solutionName ausente ou ambígua." }
$solutionId = $solution[0].solutionid

$nome = 'new_betinhos-20banco-20mcp'
$exibicao = 'Betinhos Banco MCP'
$refNome = 'new_BetinhosBancoMcp'
$openApi = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'conectores\banco-mcp.openapi.json'), [Text.Encoding]::UTF8)
$null = $openApi | ConvertFrom-Json
# Parâmetro da conexão: a chave fica só na conexão do Power Platform (securestring, nunca exibida de volta).
$parametros = '{"api_key":{"type":"securestring","uiDefinition":{"displayName":"Banco MCP API key","description":"Chave da API Banco MCP (mcp.ai). Armazenada somente na conexão Power Platform.","tooltip":"Bearer sk_live_...","constraints":{"tabIndex":1,"clearText":false,"required":"true"}}}}'

function Include([string] $id, [int] $tipo, [string] $rotulo) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $tipo and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $tipo; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "$rotulo não entrou na $solutionName." }
  Write-Step "na solução: $rotulo"
}

$atual = @((Dv GET "connectors?`$select=connectorid,connectorinternalid,openapidefinition,connectionparameters&`$filter=name eq '$nome'").value)
if ($atual.Count -gt 1) { throw "Conector $nome duplicado no DEV." }
if (-not $Apply) {
  Write-Step "DRY RUN: conector '$exibicao' seria $(if ($atual.Count) { 'atualizado' } else { 'criado' }) (host api.mcp.ai, ListarConexoes, ListarContas, ListarTransacoes)."
  $temRef = @((Dv GET "connectionreferences?`$select=connectionreferenceid&`$filter=connectionreferencelogicalname eq '$refNome'").value).Count
  Write-Step "DRY RUN: connection reference $refNome $(if ($temRef) { 'já existe' } else { 'seria criada' })."
  return
}

$corpo = @{ name = $nome; displayname = $exibicao; connectortype = 1; iconbrandcolor = '#0B3D2E'; openapidefinition = $openApi; connectionparameters = $parametros; description = 'Open Finance (mcp.ai/Pluggy), só leitura: conexões, contas de cartão e transações.' }
if ($atual.Count) {
  $norm = { param($t) ($t | ConvertFrom-Json | ConvertTo-Json -Depth 50 -Compress) }
  if ((& $norm $atual[0].openapidefinition) -ne (& $norm $openApi)) {
    Dv PATCH "connectors($($atual[0].connectorid))" @{ openapidefinition = $openApi; connectionparameters = $parametros } | Out-Null
    Write-Step 'conector atualizado'
  } else { Write-Step 'conector já igual' }
} else {
  Dv POST connectors $corpo | Out-Null
  Write-Step 'conector criado'
}
$conector = @((Dv GET "connectors?`$select=connectorid,connectorinternalid&`$filter=name eq '$nome'").value)
if ($conector.Count -ne 1 -or -not $conector[0].connectorinternalid) { throw "Conector $nome sem connectorinternalid depois da gravação." }
Include $conector[0].connectorid 372 "conector $exibicao"
$apiId = "/providers/Microsoft.PowerApps/apis/$($conector[0].connectorinternalid)"

$ref = @((Dv GET "connectionreferences?`$select=connectionreferenceid,connectorid,connectionid&`$filter=connectionreferencelogicalname eq '$refNome'").value)
if (-not $ref.Count) {
  Dv POST connectionreferences @{ connectionreferencelogicalname = $refNome; connectionreferencedisplayname = $exibicao; connectorid = $apiId; description = 'Conexão do flow da conciliação do cartão com a API Banco MCP (a key fica só na conexão).' } | Out-Null
  $ref = @((Dv GET "connectionreferences?`$select=connectionreferenceid,connectorid,connectionid&`$filter=connectionreferencelogicalname eq '$refNome'").value)
  Write-Step "connection reference $refNome criada"
}
if ($ref[0].connectorid -ne $apiId) { throw "Connection reference $refNome aponta para $($ref[0].connectorid), esperado $apiId." }
$tipoRef = @((Dv GET "solutioncomponentdefinitions?`$select=solutioncomponenttype&`$filter=primaryentityname eq 'connectionreference'").value)
if ($tipoRef.Count -eq 1) { Include $ref[0].connectionreferenceid $tipoRef[0].solutioncomponenttype "connection reference $refNome" }
if ($ref[0].connectionid) { Write-Step "OK: $refNome já tem conexão; rode provision-flow-conciliacao-cartao.ps1 -Apply para ligar o flow." }
else { Write-Output "PRÓXIMO PASSO (Renan): Power Automate DEV > Conexões > Nova > '$exibicao' > cole 'Bearer sk_live_...'; depois Soluções > $solutionName > Referências de conexão > '$exibicao' > escolha a conexão." }
