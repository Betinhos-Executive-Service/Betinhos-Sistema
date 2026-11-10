param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

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
$businessUnitId = [guid]$role[0]._businessunitid_value
# Motorista cria, lê, apaga e associa (lookup do funcionário) só as próprias inscrições de Web Push (Basic).
$all = @(Rows "privileges?`$select=privilegeid,name&`$filter=contains(name,'inscricaopushmotorista')")
$wanted = foreach ($action in "Create", "Read", "Delete", "Append") {
  $match = @($all | Where-Object { $_.name -ieq "prv${action}new_inscricaopushmotorista" })
  if ($match.Count -ne 1) { throw "Privilégio prv${action}new_inscricaopushmotorista ausente ou duplicado (rode create-inscricao-push-table.console.js antes)." }
  $match[0]
}
$missing = @()
foreach ($privilege in $wanted) {
  $id = [guid]$privilege.privilegeid
  $existing = @(Rows "roleprivilegescollection?`$select=roleprivilegeid&`$filter=roleid eq $roleId and privilegeid eq $id")
  if ($existing.Count -eq 0) { $missing += $privilege }
}
if ($missing.Count -eq 0) { Write-Output "Acesso-Motoristas já tem os 4 privilégios da inscrição de push."; return }
if (-not $Apply) { Write-Output "DRY RUN: concederia Basic em $($missing.name -join ', ') ao papel Acesso-Motoristas."; return }
$body = @{ Privileges = @($missing | ForEach-Object { @{ Depth = "Basic"; PrivilegeId = [guid]$_.privilegeid; BusinessUnitId = $businessUnitId; PrivilegeName = $_.name } }) } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "$api/roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
foreach ($privilege in $wanted) {
  $id = [guid]$privilege.privilegeid
  if (@(Rows "roleprivilegescollection?`$select=roleprivilegeid&`$filter=roleid eq $roleId and privilegeid eq $id").Count -ne 1) { throw "Concessão não confirmada: $($privilege.name)" }
}
Write-Output "Acesso-Motoristas: Create/Read/Delete/Append Basic da inscrição de push concedidos e verificados."
