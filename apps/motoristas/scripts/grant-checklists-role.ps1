param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Motorista le somente os proprios checklists e fotos (Basic). Conclusao passa pela Custom API.
. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

$ErrorActionPreference = "Stop"
$baseUrl = $EnvironmentUrl.TrimEnd("/")
Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = (Get-MsalToken -PublicClientApplication $client -Scopes "$baseUrl/user_impersonation" -Silent).AccessToken
if (-not $token) { throw "Token DEV indisponivel." }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }
function Rows([string] $Path) { return @((Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers).value) }

$role = @(Rows "roles?`$select=roleid,_businessunitid_value&`$filter=name eq 'Acesso-Motoristas'")
if ($role.Count -ne 1) { throw "Papel Acesso-Motoristas ausente ou duplicado." }
$roleId = [guid]$role[0].roleid
foreach ($name in @("prvReadnew_ChecklistVeiculo", "prvReadnew_ChecklistVeiculoFoto")) {
  $privilege = @(Rows "privileges?`$select=privilegeid,name&`$filter=name eq '$name'")
  if ($privilege.Count -ne 1) { throw "Privilegio $name ausente ou duplicado." }
  $privilegeId = [guid]$privilege[0].privilegeid
  $existing = @(Rows "roleprivilegescollection?`$select=roleprivilegeid,privilegedepthmask&`$filter=roleid eq $roleId and privilegeid eq $privilegeId")
  if ($existing.Count -gt 1) { throw "Privilegio $name duplicado no papel de motorista." }
  if ($existing.Count -eq 1) { Write-Output "Acesso-Motoristas ja tem $name : depthmask=$($existing[0].privilegedepthmask)"; continue }
  if (-not $Apply) { Write-Output "DRY RUN: concederia $name (Basic) ao papel Acesso-Motoristas."; continue }
  $body = @{ Privileges = @(@{ Depth = "Basic"; PrivilegeId = $privilegeId; BusinessUnitId = [guid]$role[0]._businessunitid_value; PrivilegeName = $name }) } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri "$api/roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
  $verified = @(Rows "roleprivilegescollection?`$select=roleprivilegeid&`$filter=roleid eq $roleId and privilegeid eq $privilegeId")
  if ($verified.Count -ne 1) { throw "Concessao de $name nao confirmada." }
  Write-Output "Acesso-Motoristas: $name (Basic) concedido e verificado."
}
