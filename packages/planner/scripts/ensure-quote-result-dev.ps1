param([switch] $DeviceCode)

$ErrorActionPreference = "Stop"
$environmentUrl = "https://org23b93544.crm2.dynamics.com"
$api = "$environmentUrl/api/data/v9.2"
$entity = "cr40f_pedidodecotacao"
$solution = "AppBetinhos"

if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "MSAL.PS não encontrado." }
Import-Module MSAL.PS -ErrorAction Stop
$clientId = [Environment]::GetEnvironmentVariable("DV_CLIENT_ID")
if (-not $clientId) { $clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d" }
$app = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $app
try { $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -Silent }
catch {
  if (-not $DeviceCode) { throw "Sem sessão MSAL em cache para o DEV. Execute este script com -DeviceCode." }
  $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -DeviceCode
}
$headers = @{
  Authorization = "Bearer $($token.AccessToken)"
  Accept = "application/json"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
  "MSCRM.SolutionUniqueName" = $solution
}

$solutionRows = Invoke-RestMethod -Method Get -Uri "$api/solutions?`$select=solutionid&`$filter=uniquename eq '$solution'" -Headers $headers
if ($solutionRows.value.Count -ne 1) { throw "Solution $solution não encontrada no DEV." }

$fieldUri = "$api/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='cr40f_motivoperda')/Microsoft.Dynamics.CRM.StringAttributeMetadata?`$select=LogicalName,MaxLength"
try { $field = Invoke-RestMethod -Method Get -Uri $fieldUri -Headers $headers }
catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; $field = $null }
if ($field -and $field.MaxLength -lt 1000) { throw "cr40f_motivoperda existe com limite menor que 1.000." }
if (-not $field) {
  $label = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = "Motivo da perda"; LanguageCode = 1046 }) }
  $body = @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_MotivoPerda"; DisplayName = $label; RequiredLevel = @{ Value = "None" }; MaxLength = 1000 } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri "$api/EntityDefinitions(LogicalName='$entity')/Attributes" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
  Write-Host "Campo cr40f_motivoperda criado no DEV."
} else { Write-Host "Campo cr40f_motivoperda já existe no DEV." }

$choiceUri = "$api/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='cr40f_statuscotacao')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet"
$choice = Invoke-RestMethod -Method Get -Uri $choiceUri -Headers $headers
$option = @($choice.OptionSet.Options | Where-Object { $_.Value -eq 100004007 })
if ($option.Count -ne 1) { throw "Opção 100004007 não encontrada ou ambígua no DEV." }
$currentLabel = @($option[0].Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 } | Select-Object -First 1)[0].Label
if ($currentLabel -ne "Aceita pelo cliente") {
  $label = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = "Aceita pelo cliente"; LanguageCode = 1046 }) }
  $body = @{ EntityLogicalName = $entity; AttributeLogicalName = "cr40f_statuscotacao"; Value = 100004007; Label = $label; MergeLabels = $true } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri "$api/UpdateOptionValue" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
  Write-Host "Rótulo da opção 100004007 atualizado no DEV."
} else { Write-Host "Rótulo da opção 100004007 já está atualizado." }

$xml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>"
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
Write-Host "Metadata da cotação publicada no DEV."
