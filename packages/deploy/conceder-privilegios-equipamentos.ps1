param(
  [switch] $Apply,
  [switch] $DeviceCode,
  # Papeis que recebem nas tabelas de equipamentos o mesmo acesso que ja tem em cr40f_funcionarios. Padrao: so MDA e DEV - Usuario
  # (decisao do Renan, 21/10/2026; o Canvas fica de fora). O AVISO do script aponta os demais papeis que acessam cr40f_funcionarios.
  [string[]] $Roles = @("Acesso-Betinhos-MDA", "DEV - Usuário")
)

# Copia, para cr40f_tipoequipamento, cr40f_equipamento e cr40f_fotoequipamento, os privilegios (e a profundidade) que cada papel listado tem em cr40f_funcionarios.
# Spec de equipamentos, decisao 9: as tabelas novas recebem os mesmos privilegios dos papeis que hoje acessam cr40f_funcionarios.
# Sem -Apply roda em DRY RUN. Idempotente: AddPrivilegesRole define a profundidade; repetir nao duplica.
# Arquivo salvo com BOM: o Windows PowerShell 5.1 precisa dele para ler os nomes acentuados.

$ErrorActionPreference = "Stop"
# Os rotulos acentuados e o BOM dependem do Windows PowerShell 5.1 (pwsh le o arquivo de outro jeito).
if ($PSVersionTable.PSEdition -ne "Desktop") { throw "Rode com powershell.exe (Windows PowerShell 5.1)." }
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Step([string] $Message) { Write-Host "[privilegios-equipamentos] $Message" }
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

# Fotos: o mesmo acesso das outras duas (Create/Append em foto e AppendTo em equipamento para enviar; Delete para excluir).
$tabelas = @("cr40f_tipoequipamento", "cr40f_equipamento", "cr40f_fotoequipamento")
$profundidade = @{ 1 = "Basic"; 2 = "Local"; 4 = "Deep"; 8 = "Global" }

# Privilegios de cr40f_funcionarios, indexados pelo prefixo (prvRead, prvWrite...).
$origem = @{}
foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'cr40f_funcionarios')")) {
  $prefixo = $p.name.Substring(0, $p.name.Length - "cr40f_funcionarios".Length)
  $origem[[string]$p.privilegeid] = $prefixo
}
if ($origem.Count -eq 0) { throw "Privilegios de cr40f_funcionarios nao encontrados." }

# Decisao 9 do spec: papeis raiz que acessam cr40f_funcionarios e ficaram fora de -Roles so geram AVISO (nada e concedido a eles).
$papeisOrigem = @{}
foreach ($privId in @($origem.Keys)) {
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "roleid" "privilegeid eq $privId")) { $papeisOrigem[[string]$rp.roleid] = $true }
}
$foraDaLista = @()
foreach ($roleId in @($papeisOrigem.Keys)) {
  $role = @(Get-Rows "roles" "name" "roleid eq $roleId and _parentroleid_value eq null")
  if ($role.Count -eq 1 -and $Roles -notcontains $role[0].name) { $foraDaLista += $role[0].name }
}
foreach ($nome in @($foraDaLista | Sort-Object -Unique)) { Write-Step "AVISO: o papel '$nome' acessa cr40f_funcionarios e nao esta em -Roles; inclua-o em -Roles se ele deve acessar equipamentos (decisao 9 do spec)." }

# Privilegios das tabelas novas, por nome (prvReadcr40f_equipamento...).
$destino = @{}
foreach ($t in $tabelas) {
  foreach ($p in @(Get-Rows "privileges" "privilegeid,name" "endswith(name,'$t')")) { $destino[$p.name] = $p.privilegeid }
}

foreach ($nome in $Roles) {
  $papeis = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$(Escape-OData $nome)' and _parentroleid_value eq null")
  if ($papeis.Count -ne 1) { throw "Papel '$nome' nao encontrado (ou ambiguo) na unidade raiz: $($papeis.Count)." }
  $papel = $papeis[0]
  $concessoes = @()
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) {
    $prefixo = $origem[[string]$rp.privilegeid]
    if (-not $prefixo) { continue }
    $depth = $profundidade[[int]$rp.privilegedepthmask]
    if (-not $depth) { throw "Profundidade desconhecida $($rp.privilegedepthmask) em $nome." }
    foreach ($t in $tabelas) {
      $alvo = "$prefixo$t"
      if (-not $destino.ContainsKey($alvo)) { throw "Privilegio $alvo nao existe (rode provision-equipamentos.ps1 -Apply antes)." }
      $concessoes += @{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $destino[$alvo]; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $alvo }
    }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$nome nao tem privilegio em cr40f_funcionarios; nada a conceder"; continue }
  # Tabelas UserOwned: leitura abaixo de Global esconde os registros de outros donos (os tipos semeados ficam com quem rodou o provision; as fotos, com quem enviou).
  foreach ($c in @($concessoes | Where-Object { $_.PrivilegeName -like "prvRead*" -and $_.Depth -ne "Global" })) { Write-Step "AVISO: $nome recebe $($c.PrivilegeName) com profundidade $($c.Depth); usuarios desse papel nao verao itens/tipos de outros donos (o spec espera Global)." }
  $resumo = ($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ", "
  if (-not $Apply) { Write-Step "DRY RUN $nome receberia: $resumo"; continue }
  Invoke-Dataverse "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $atual = @(@(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)") | Where-Object { $destino.Values -contains $_.privilegeid })
  if ($atual.Count -lt $concessoes.Count) { throw "$nome ficou com $($atual.Count) de $($concessoes.Count) privilegios esperados." }
  # Confere tambem a profundidade de cada privilegio concedido.
  foreach ($c in $concessoes) {
    $linha = @($atual | Where-Object { [string]$_.privilegeid -eq [string]$c.PrivilegeId })
    if ($linha.Count -ne 1 -or $profundidade[[int]$linha[0].privilegedepthmask] -ne $c.Depth) { throw "$nome ficou com $($c.PrivilegeName) fora da profundidade esperada ($($c.Depth))." }
  }
  Write-Step "$nome concedido: $resumo"
}
Write-Step $(if ($Apply) { "PRIVILEGIOS OK" } else { "DRY RUN OK; use -Apply" })
