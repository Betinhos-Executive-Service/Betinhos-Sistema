param(
  [switch] $DeviceCode
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$environmentUrl = "https://org23b93544.crm2.dynamics.com"
$apiBase = "$environmentUrl/api/data/v9.2"
$roleName = "Acesso-Betinhos-MDA"
$clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d"
$privilegeNames = @(
  "prvReadcr40f_boasideias",
  "prvCreatecr40f_boasideias",
  "prvWritecr40f_boasideias"
)
$deletePrivilegeName = "prvDeletecr40f_boasideias"

Import-Module MSAL.PS -ErrorAction Stop
$app = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $app
$scope = "$environmentUrl/user_impersonation"
try {
  $token = Get-MsalToken -PublicClientApplication $app -Scopes $scope -Silent
}
catch {
  if (-not $DeviceCode) { throw "Sessão MSAL indisponível. Execute com -DeviceCode para entrar no DEV." }
  $token = Get-MsalToken -PublicClientApplication $app -Scopes $scope -DeviceCode
}
if ([string]::IsNullOrWhiteSpace($token.AccessToken)) { throw "Não foi possível autenticar no Dataverse DEV." }

$headers = @{
  Authorization = "Bearer $($token.AccessToken)"
  Accept = "application/json"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
}

$roleFilter = [Uri]::EscapeDataString("name eq '$roleName'")
$roles = (Invoke-RestMethod -Method Get -Uri "$apiBase/roles?`$select=roleid,name,_businessunitid_value&`$filter=$roleFilter" -Headers $headers).value
if (@($roles).Count -ne 1) { throw "Esperada uma role $roleName no DEV; encontradas $(@($roles).Count)." }
$role = @($roles)[0]
if (-not $role._businessunitid_value) { throw "Business unit da role não encontrada." }

$namesFilter = [Uri]::EscapeDataString(((@($privilegeNames) + $deletePrivilegeName) | ForEach-Object { "name eq '$_'" }) -join " or ")
$definitions = (Invoke-RestMethod -Method Get -Uri "$apiBase/privileges?`$select=privilegeid,name&`$filter=$namesFilter" -Headers $headers).value
if (@($definitions).Count -ne 4) { throw "Definições de Read/Create/Write/Delete da tabela não encontradas no DEV." }
$definitionsByName = @{}
foreach ($definition in $definitions) { $definitionsByName[$definition.name] = $definition }

function Get-IdeaRolePrivileges {
  $filter = [Uri]::EscapeDataString("roleid eq $($role.roleid)")
  return @((Invoke-RestMethod -Method Get -Uri "$apiBase/roleprivilegescollection?`$select=privilegeid,privilegedepthmask&`$filter=$filter" -Headers $headers).value)
}

$existing = Get-IdeaRolePrivileges
$toAdd = @()
foreach ($name in $privilegeNames) {
  $definition = $definitionsByName[$name]
  $current = @($existing | Where-Object { $_.privilegeid -eq $definition.privilegeid })
  if ($current.Count -gt 0) {
    if ($current[0].privilegedepthmask -ne 8) { throw "$name já existe com profundidade diferente de Organização; revise manualmente." }
    continue
  }
  $toAdd += @{
    Depth = "Global"
    PrivilegeId = $definition.privilegeid
    BusinessUnitId = $role._businessunitid_value
    PrivilegeName = $name
  }
}

if ($toAdd.Count -gt 0) {
  $payload = @{ Privileges = $toAdd } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Post -Uri "$apiBase/roles($($role.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $payload | Out-Null
}

$verified = Get-IdeaRolePrivileges
foreach ($name in $privilegeNames) {
  $id = $definitionsByName[$name].privilegeid
  if (-not @($verified | Where-Object { $_.privilegeid -eq $id -and $_.privilegedepthmask -eq 8 }).Count) {
    throw "Verificação falhou para $name."
  }
}
if (@($verified | Where-Object { $_.privilegeid -eq $definitionsByName[$deletePrivilegeName].privilegeid }).Count) {
  throw "A role recebeu Delete de cr40f_boasideias; revise a permissão antes de liberar o uso."
}
Write-Output "Role ${roleName}: Read/Create/Write de cr40f_boasideias em escopo Organização confirmados; Delete não foi alterado."
