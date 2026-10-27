param([switch] $Apply, [switch] $RouteOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$environmentBaseUrl = 'https://org23b93544.crm2.dynamics.com'
$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
$table = 'cr40f_pedidodecotacao'
$entitySet = 'cr40f_pedidodecotacaos'
$solution = 'AppBetinhos'

Import-Module MSAL.PS -ErrorAction Stop
$app = New-MsalClientApplication -ClientId '51f81489-12ee-4a9e-aaae-a2591f45987d' -TenantId 'organizations' -RedirectUri ([Uri] 'http://localhost')
$accessToken = (Get-MsalToken -PublicClientApplication $app -Scopes "$environmentBaseUrl/user_impersonation" -DeviceCode).AccessToken
$headers = @{
  Authorization = "Bearer $accessToken"
  Accept = 'application/json'
  'Content-Type' = 'application/json; charset=utf-8'
  'OData-MaxVersion' = '4.0'
  'OData-Version' = '4.0'
  'MSCRM.SolutionUniqueName' = $solution
}

function Get-Attribute([string] $logicalName) {
  try {
    Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$logicalName')?`$select=LogicalName,AttributeType" -Headers $headers
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { return $null }
    throw
  }
}

$fields = @(
  @{ logical = 'cr40f_origemcompleta'; label = 'Origem completa'; legacy = 'cr40f_origem' },
  @{ logical = 'cr40f_destinocompleto'; label = 'Destino completo'; legacy = 'cr40f_destino' }
)
$routeLogicalName = 'cr40f_trajeto'
$existing = @{}
foreach ($field in $fields) {
  $existing[$field.logical] = Get-Attribute $field.logical
  Write-Output "$($field.logical): $(if ($existing[$field.logical]) { 'existente' } else { 'ausente' })"
}
try {
  $routeExists = Get-Attribute $routeLogicalName
  Write-Output "$routeLogicalName`: $(if ($routeExists) { 'existente' } else { 'ausente' })"
} catch { throw }
if (-not $Apply) { Write-Output 'Prévia somente leitura. Use -Apply para alterar apenas o DEV.'; return }

$schemaFields = if ($RouteOnly) { @() } else { $fields }
foreach ($field in $schemaFields) {
  if ($existing[$field.logical]) { continue }
  $payload = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
    SchemaName = $field.logical
    DisplayName = @{ LocalizedLabels = @(@{ Label = $field.label; LanguageCode = 1046 }) }
    Description = @{ LocalizedLabels = @(@{ Label = 'Texto integral da rota, até 10.000 caracteres.'; LanguageCode = 1046 }) }
    RequiredLevel = @{ Value = 'None' }
    MaxLength = 10000
    Format = 'TextArea'
  } | ConvertTo-Json -Depth 12
  Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/EntityDefinitions(LogicalName='$table')/Attributes" -Headers $headers -Body $payload | Out-Null
  Write-Output "Criada: $($field.logical)"
}
$routeExists = Get-Attribute $routeLogicalName
if (-not $routeExists) {
  $routePayload = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
    SchemaName = $routeLogicalName
    DisplayName = @{ LocalizedLabels = @(@{ Label = 'Trajeto'; LanguageCode = 1046 }) }
    Description = @{ LocalizedLabels = @(@{ Label = 'Pontos do trajeto separados por barra, até 10.000 caracteres.'; LanguageCode = 1046 }) }
    RequiredLevel = @{ Value = 'None' }
    MaxLength = 10000
    Format = 'TextArea'
  } | ConvertTo-Json -Depth 12
  Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/EntityDefinitions(LogicalName='$table')/Attributes" -Headers $headers -Body $routePayload | Out-Null
  Write-Output "Criada: $routeLogicalName"
}

$publishBody = @{ ParameterXml = "<importexportxml><entities><entity>$table</entity></entities><nodes/><securityroles/><settings/><workflows/></importexportxml>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/PublishXml" -Headers $headers -Body $publishBody | Out-Null
if ($RouteOnly) { Write-Output 'Campo Trajeto publicado em DEV. Nenhum registro foi migrado.'; return }

$select = 'cr40f_pedidodecotacaoid,cr40f_origem,cr40f_destino,cr40f_origemcompleta,cr40f_destinocompleto'
$next = "$apiBaseUrl/${entitySet}?`$select=$select"
$updated = 0
while ($next) {
  $page = Invoke-RestMethod -Method Get -Uri $next -Headers $headers
  foreach ($row in $page.value) {
    $patch = @{}
    foreach ($field in $fields) {
      if (-not [string]::IsNullOrEmpty($row.($field.logical))) { continue }
      if ([string]::IsNullOrEmpty($row.($field.legacy))) { continue }
      $patch[$field.logical] = $row.($field.legacy)
    }
    if ($patch.Count -eq 0) { continue }
    $body = $patch | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Method Patch -Uri "$apiBaseUrl/$entitySet($($row.cr40f_pedidodecotacaoid))" -Headers $headers -Body $body | Out-Null
    $updated++
  }
  $next = if ($page.PSObject.Properties['@odata.nextLink']) { $page.'@odata.nextLink' } else { $null }
}
Write-Output "DEV publicado. Registros com texto legado migrado: $updated"
