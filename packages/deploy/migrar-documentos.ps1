param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Migra CNH e ASO da ficha do funcionario (cr40f_validadedacnh, cr40f_datadoaso) para cr40f_documento, um Vigente por funcionario e tipo.
# Idempotente: pula quem ja tem documento Vigente do tipo. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler textos acentuados.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[migrar-documentos] $Message" }
function Escape-OData([string] $Value) { $Value.Replace("'", "''") }
function Label([string] $Text) { @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1046 }) } }

function Read-DotEnv([string] $Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  return $values
}
$dotEnv = Read-DotEnv (Join-Path $root ".env")
function Get-Setting([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $dotEnv.ContainsKey($Name)) { $value = $dotEnv[$Name] }
  return $value
}

$environmentUrl = Get-Setting "DV_ENVIRONMENT_URL"
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw "DV_ENVIRONMENT_URL ausente no .env." }
$script:baseUrl = $environmentUrl.TrimEnd("/")
$environmentHost = ([Uri] $script:baseUrl).Host.ToLowerInvariant()
$blockedHosts = @((Get-Setting "DV_BLOCKED_HOSTS") -split "," | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw "DV_BLOCKED_HOSTS ausente. Informe o host de PROD." }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost esta bloqueado (PROD exige pedido explicito)." }
$SolutionUniqueName = Get-Setting "DV_SOLUTION"
if ([string]::IsNullOrWhiteSpace($SolutionUniqueName)) { throw "DV_SOLUTION ausente no .env." }
$clientId = Get-Setting "DV_CLIENT_ID"
$clientGuid = [Guid]::Empty
if (-not [Guid]::TryParse($clientId, [ref] $clientGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env." }

function Get-AccessToken {
  $secret = Get-Setting "DV_CLIENT_SECRET"
  if (-not [string]::IsNullOrWhiteSpace($secret)) {
    $tenant = Get-Setting "DV_TENANT_ID"
    $body = @{ grant_type = "client_credentials"; client_id = $clientId; client_secret = $secret; scope = "$script:baseUrl/.default" }
    return (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" -Body $body).access_token
  }
  if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Modulo MSAL.PS nao encontrado. Install-Module MSAL.PS -Scope CurrentUser" }
  Import-Module MSAL.PS -ErrorAction Stop
  $client = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
  Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
  $scope = "$script:baseUrl/user_impersonation"
  try { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken }
  catch {
    if ($DeviceCode) { return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken }
    return (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Interactive).AccessToken
  }
}

Write-Step "autenticacao em $environmentHost"
$script:token = Get-AccessToken
if ([string]::IsNullOrWhiteSpace($script:token)) { throw "Token Dataverse nao obtido." }

function Invoke-Dataverse {
  param([string] $Method, [string] $Path, [object] $Body)
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
  $params = @{ Method = $Method; Uri = "$script:baseUrl/api/data/v9.2/$Path"; Headers = $headers; ContentType = "application/json; charset=utf-8" }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)) }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}

function Get-Rows([string] $EntitySet, [string] $Select, [string] $Filter = "") {
  $path = "${EntitySet}?`$select=$Select"
  if ($Filter) { $path += "&`$filter=$([uri]::EscapeDataString($Filter))" }
  return @((Invoke-Dataverse "GET" $path).value)
}

$solution = @(Get-Rows "solutions" "solutionid,ismanaged" "uniquename eq '$(Escape-OData $SolutionUniqueName)'")
if ($solution.Count -ne 1 -or [bool]$solution[0].ismanaged) { throw "Solucao $SolutionUniqueName nao e unmanaged unica." }
$solutionId = $solution[0].solutionid

function Add-SolutionComponent([object] $ComponentId, [int] $ComponentType, [string] $Label, [switch] $IncludeSubcomponents) {
  if (-not $Apply -or -not $ComponentId) { return }
  $filter = "_solutionid_value eq $solutionId and objectid eq $ComponentId and componenttype eq $ComponentType"
  if (@(Get-Rows "solutioncomponents" "solutioncomponentid" $filter).Count -gt 0) { return }
  Invoke-Dataverse "POST" "AddSolutionComponent" @{ ComponentId = $ComponentId; ComponentType = $ComponentType; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = -not $IncludeSubcomponents } | Out-Null
  Write-Step "na solucao: $Label"
}

function Get-EntityId([string] $LogicalName) {
  $rows = @((Invoke-Dataverse "GET" "EntityDefinitions?`$select=MetadataId&`$filter=LogicalName eq '$LogicalName'").value)
  if ($rows.Count -eq 1) { return $rows[0].MetadataId }
  return $null
}
function Get-AttributeId([string] $Entity, [string] $LogicalName) {
  $rows = @(Get-Rows "EntityDefinitions(LogicalName='$Entity')/Attributes" "MetadataId" "LogicalName eq '$LogicalName'")
  if ($rows.Count -eq 1) { return $rows[0].MetadataId }
  return $null
}

foreach ($required in @("cr40f_tipodocumento", "cr40f_documento", "cr40f_funcionarios")) { if (-not (Get-EntityId $required)) { throw "Tabela $required nao existe neste ambiente. Rode provision-documentos.ps1 -Apply antes." } }

$tipoSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_tipodocumento')?`$select=EntitySetName").EntitySetName
$docSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_documento')?`$select=EntitySetName").EntitySetName
$funcSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_funcionarios')?`$select=EntitySetName").EntitySetName
# Mesma regra de getDataverseEnvironmentLabel (pages/funcionarios/data/dataverse.ts:24-29)
$envLabel = switch ($environmentHost) { 'org23b93544.crm2.dynamics.com' { 'DEV' } 'orgf261ae8e.crm2.dynamics.com' { 'PROD' } default { 'Dataverse' } }

$tipos = @{}
foreach ($t in Get-Rows $tipoSet "cr40f_tipodocumentoid,cr40f_codigo" "cr40f_codigo eq 'CNH' or cr40f_codigo eq 'ASO'") { $tipos[$t.cr40f_codigo] = $t.cr40f_tipodocumentoid }
if (-not $tipos.ContainsKey("CNH") -or -not $tipos.ContainsKey("ASO")) { throw "Tipos CNH/ASO ausentes. Rode provision-documentos.ps1 -Apply antes." }

# Documentos Vigentes ja existentes, por funcionario + tipo (garante a idempotencia)
$existentes = @{}
foreach ($d in Get-Rows $docSet "_cr40f_tipo_value,_cr40f_funcionario_value" "cr40f_situacao eq 100000000 and _cr40f_funcionario_value ne null") { $existentes["$($d._cr40f_funcionario_value)|$($d._cr40f_tipo_value)"] = $true }

$funcs = Get-Rows $funcSet "cr40f_funcionariosid,new_apelido,cr40f_nomecompleto,cr40f_validadedacnh,cr40f_datadoaso" "statecode eq 0 and (cr40f_validadedacnh ne null or cr40f_datadoaso ne null)"
$criados = 0; $pulados = 0
foreach ($f in $funcs) {
  $nome = if ($f.new_apelido) { $f.new_apelido } else { $f.cr40f_nomecompleto }
  $pasta = "Funcionarios/$(if ($envLabel -eq 'DEV') { 'DEV/' })$($f.cr40f_funcionariosid)/Documentos"
  $itens = @()
  if ($f.cr40f_validadedacnh) { $itens += @{ codigo = "CNH"; emissao = $null; validade = $f.cr40f_validadedacnh.Substring(0, 10) } }
  if ($f.cr40f_datadoaso) {
    $emissaoAso = $f.cr40f_datadoaso.Substring(0, 10)
    $itens += @{ codigo = "ASO"; emissao = $emissaoAso; validade = ([datetime]::ParseExact($emissaoAso, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)).AddMonths(12).ToString('yyyy-MM-dd') }
  }
  foreach ($i in $itens) {
    $tid = $tipos[$i.codigo]
    if ($existentes.ContainsKey("$($f.cr40f_funcionariosid)|$tid")) { $pulados++; continue }
    $body = @{
      cr40f_name = "$($i.codigo) · $nome"; cr40f_emissao = $i.emissao; cr40f_validade = $i.validade; cr40f_situacao = 100000000
      cr40f_pasta = "$pasta/$($i.codigo)"; cr40f_observacao = "Migrado da ficha do funcionário em $(Get-Date -Format 'dd/MM/yyyy')"
      "cr40f_Tipo@odata.bind" = "/$tipoSet($tid)"; "cr40f_Funcionario@odata.bind" = "/$funcSet($($f.cr40f_funcionariosid))"
    }
    if ($Apply) { Invoke-Dataverse "POST" $docSet $body | Out-Null }
    $criados++
    Write-Step "$(if ($Apply) { 'criado' } else { 'DRY RUN criaria' }) $($i.codigo) · $nome"
  }
}
Write-Step "$(if ($Apply) { 'MIGRACAO OK' } else { 'DRY RUN OK' }): $criados a criar/criados, $pulados ja existiam"
