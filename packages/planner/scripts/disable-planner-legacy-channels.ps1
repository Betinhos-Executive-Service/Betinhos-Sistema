param(
  [string]$EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com'
)

$ErrorActionPreference = 'Stop'
if ($EnvironmentUrl.TrimEnd('/') -ne 'https://org23b93544.crm2.dynamics.com') { throw 'Esta operação é permitida somente em DEV.' }
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw 'Azure CLI não retornou token do Dataverse DEV.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json; charset=utf-8' }
$api = "$EnvironmentUrl/api/data/v9.2"

foreach ($flow in @(
  @{ Id = '83f50be1-55ac-f111-aaac-7ced8da8c473'; Label = 'teste' },
  @{ Id = '4ff83211-5bac-f111-aaac-7ced8da8c473'; Label = 'e-mail automático' }
)) {
  $uri = "$api/workflows($($flow.Id))"
  $current = Invoke-RestMethod -Uri "$uri`?`$select=name,statecode" -Headers $headers
  if ($current.name -notmatch 'Planner|Teste|notifica') { throw "Flow inesperado para $($flow.Label): $($current.name)" }
  if ([int]$current.statecode -eq 1) {
    $body = '{"statecode":0,"statuscode":1}'
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Patch -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  }
  Write-Output "Flow $($flow.Label) desativado: $($flow.Id)"
}

$filter = [uri]::EscapeDataString("name eq 'Planner Notifications - Tarefa evento'")
$steps = @( (Invoke-RestMethod -Uri "$api/sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode&`$filter=$filter" -Headers $headers).value )
if ($steps.Count -ne 1) { throw "Esperado um step nativo do Planner; encontrados $($steps.Count)." }
$step = $steps[0]
if ([int]$step.statecode -eq 0) {
  $body = '{"statecode":1,"statuscode":2}'
  Invoke-RestMethod -Uri "$api/sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" -Headers $headers -Method Patch -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
}
Write-Output "Aviso nativo desativado: $($step.sdkmessageprocessingstepid)"
