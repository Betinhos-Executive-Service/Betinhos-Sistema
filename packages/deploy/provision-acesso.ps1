param(
  [switch] $Apply,
  [switch] $DeviceCode
)

# Provisiona no DEV a funcao de seguranca "Acesso - Gestão de Motoristas" e grava a configuracao segura (clientSecret do Graph)
# nos steps do plugin de acesso. Sem -Apply roda em DRY RUN. O segredo e digitado, nunca lido do .env nem versionado.
# Configuracao vem do .env da raiz do monorepo. Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os acentos.

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[acesso] $Message" }
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

# Em erro, a mensagem traz so o detalhe da resposta do Dataverse (nunca o corpo enviado, que pode conter o segredo).
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
# Valor de lookup pode vir ausente ou nulo; StrictMode nao deixa ler propriedade inexistente.
function Get-Prop([object] $Row, [string] $Name) {
  $p = $Row.PSObject.Properties[$Name]
  if ($null -eq $p -or $null -eq $p.Value) { return "" }
  return [string] $p.Value
}

$FuncaoNome = "Acesso - Gestão de Motoristas"
$StepNames = @("Cr40f.Acesso: cadastrar acesso", "Cr40f.Acesso: encerrar acesso")
$SecureCol = "_sdkmessageprocessingstepsecureconfigid_value"

# 1. Funcao de seguranca (na unidade de negocios raiz)
$bu = (Get-Rows "businessunits" "businessunitid" "parentbusinessunitid eq null")[0].businessunitid
$papel = @(Get-Rows "roles" "roleid" "name eq '$(Escape-OData $FuncaoNome)' and _businessunitid_value eq $bu")
if ($papel.Count -eq 0) {
  Write-Step "funcao '$FuncaoNome' ausente"
  if ($Apply) { Invoke-Dataverse "POST" "roles" @{ name = $FuncaoNome; "businessunitid@odata.bind" = "/businessunits($bu)" } | Out-Null; Write-Step "funcao criada" }
} else { Write-Step "funcao ja existe" }

# 2. Configuracao segura dos steps
$steps = @{}
foreach ($name in $StepNames) {
  $rows = @(Get-Rows "sdkmessageprocessingsteps" "sdkmessageprocessingstepid,$SecureCol" "name eq '$(Escape-OData $name)'")
  if ($rows.Count -ne 1) { throw "Step '$name' nao encontrado ($($rows.Count)). Rode 'pnpm push:plugin:acesso:dev' antes." }
  $steps[$name] = $rows[0]
}
if ($Apply) {
  $secure = Read-Host -AsSecureString "clientSecret do app registration do Graph"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $secure.Dispose()
  if ([string]::IsNullOrWhiteSpace($plain)) { throw "clientSecret vazio." }
  $json = (@{ clientSecret = $plain } | ConvertTo-Json -Compress)
  try {
    foreach ($name in $StepNames) {
      $step = $steps[$name]
      $secureId = Get-Prop $step $SecureCol
      if ($secureId) { Invoke-Dataverse "PATCH" "sdkmessageprocessingstepsecureconfigs($secureId)" @{ secureconfig = $json } | Out-Null }
      else {
        # Prefer return=representation: o Invoke-RestMethod devolve o JSON do registro criado (o id vem no corpo).
        $created = Invoke-Dataverse "POST" "sdkmessageprocessingstepsecureconfigs" @{ secureconfig = $json } -ExtraHeaders @{ Prefer = "return=representation" }
        Invoke-Dataverse "PATCH" "sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" @{ "sdkmessageprocessingstepsecureconfigid@odata.bind" = "/sdkmessageprocessingstepsecureconfigs($($created.sdkmessageprocessingstepsecureconfigid))" } | Out-Null
      }
      Write-Step "configuracao segura gravada em '$name'"
    }
  }
  finally { $plain = $null; $json = $null; $secure = $null }
} else { Write-Step "DRY RUN: $($steps.Count) steps encontrados; use -Apply para gravar o clientSecret" }

# 3. Checagem final: nenhum step sem configuracao segura
foreach ($name in $StepNames) {
  $row = (Get-Rows "sdkmessageprocessingsteps" $SecureCol "name eq '$(Escape-OData $name)'")[0]
  if ($Apply -and -not (Get-Prop $row $SecureCol)) { throw "Step '$name' continua sem configuracao segura." }
}
Write-Step "concluido"
