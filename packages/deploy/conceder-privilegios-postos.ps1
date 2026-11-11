param(
  [switch] $Apply,
  [switch] $DeviceCode,
  # Papel do App Motoristas: precisa ler new_postocombustivel (tela Postos proximos, consulta pela Web API do motorista).
  [string] $Role = "Acesso-Motoristas"
)

# Concede SO leitura (prvReadnew_postocombustivel) em profundidade Organizacao (Global) ao papel do App Motoristas.
# O Leitor de Servicos ja tem esse privilegio com profundidade Global; o papel do motorista nao tinha.
# Windows: powershell.exe (5.1). Linux/macOS: packages/deploy/rodar-linux.sh conceder-privilegios-postos.ps1 [-Apply].
# Sem -Apply roda em DRY RUN. Idempotente: AddPrivilegesRole define a profundidade; repetir nao duplica. So DEV (PROD vai pelas solucoes).
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os nomes acentuados.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[privilegios-postos] $Message" }
function Escape-OData([string] $Value) { $Value.Replace("'", "''") }

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
# PROD bloqueado no codigo, alem do DV_BLOCKED_HOSTS: este script so roda no DEV.
$prodHost = "orgf261ae8e.crm2.dynamics.com"
if ($environmentHost -eq $prodHost) { throw "$environmentHost e o PROD: este script nunca roda em PROD." }
$blockedHosts = @((Get-Setting "DV_BLOCKED_HOSTS") -split "," | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw "DV_BLOCKED_HOSTS ausente. Informe o host de PROD." }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost esta bloqueado (PROD exige pedido explicito)." }
$SolutionUniqueName = Get-Setting "DV_SOLUTION"
if ([string]::IsNullOrWhiteSpace($SolutionUniqueName)) { throw "DV_SOLUTION ausente no .env." }
$clientId = Get-Setting "DV_CLIENT_ID"
$clientGuid = [Guid]::Empty
if ([string]::IsNullOrWhiteSpace((Get-Setting "DV_ACCESS_TOKEN")) -and -not [Guid]::TryParse($clientId, [ref] $clientGuid)) { throw "DV_CLIENT_ID ausente ou invalido no .env (ou informe DV_ACCESS_TOKEN)." }

function Get-AccessToken {
  $pronto = Get-Setting "DV_ACCESS_TOKEN"
  if (-not [string]::IsNullOrWhiteSpace($pronto)) { return $pronto }
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
  param([string] $Method, [string] $Path, [object] $Body, [hashtable] $ExtraHeaders = @{})
  $headers = @{ Authorization = "Bearer $script:token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
  foreach ($key in $ExtraHeaders.Keys) { $headers[$key] = $ExtraHeaders[$key] }
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

$privilegio = "prvReadnew_postocombustivel"
$privilegios = @(Get-Rows "privileges" "privilegeid,name" "name eq '$privilegio'")
if ($privilegios.Count -ne 1) { throw "Privilegio $privilegio nao encontrado: $($privilegios.Count)." }
$privilegioId = $privilegios[0].privilegeid

$papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $Role)' and _parentroleid_value eq null")
if ($papeis.Count -ne 1) { throw "Papel '$Role' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
$papel = $papeis[0]

$profundidade = @{ 1 = "Basic"; 2 = "Local"; 4 = "Deep"; 8 = "Global" }
function Get-Atual { @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid) and privilegeid eq $privilegioId") }
$atual = Get-Atual
$depthAtual = if ($atual.Count -eq 1) { $profundidade[[int]$atual[0].privilegedepthmask] } else { "nenhum" }
if ($depthAtual -eq "Global") { Write-Step "$Role ja tem $privilegio=Global; nada a fazer"; Write-Step "PRIVILEGIOS OK"; return }
if (-not $Apply) { Write-Step "DRY RUN $Role receberia $privilegio=Global (hoje: $depthAtual)"; Write-Step "DRY RUN OK; use -Apply"; return }

$concessao = @{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $privilegioId; Depth = "Global"; BusinessUnitId = $papel._businessunitid_value }
Invoke-Dataverse "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = @($concessao) } | Out-Null
$depois = Get-Atual
if ($depois.Count -ne 1 -or $profundidade[[int]$depois[0].privilegedepthmask] -ne "Global") { throw "$Role ficou com $privilegio fora da profundidade esperada (Global)." }
Write-Step "$Role concedido: $privilegio=Global"
Write-Step "PRIVILEGIOS OK"
