param([switch] $DeviceCode)

# Cotações V1.1: cria no DEV os campos do pedido que a etapa "Pedido" grava
# (perfil do passageiro e observações internas). Idempotente; só DEV.

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

function Ensure-StringField([string] $logicalName, [string] $schemaName, [string] $label, [int] $maxLength, [string] $format) {
  $uri = "$api/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$logicalName')?`$select=LogicalName"
  try { Invoke-RestMethod -Method Get -Uri $uri -Headers $headers | Out-Null; Write-Host "Campo $logicalName já existe no DEV."; return }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw } }
  $displayName = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $label; LanguageCode = 1046 }) }
  $body = if ($format -eq "memo") {
    @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = $schemaName; DisplayName = $displayName; RequiredLevel = @{ Value = "None" }; MaxLength = $maxLength; Format = "TextArea" }
  } else {
    @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $schemaName; DisplayName = $displayName; RequiredLevel = @{ Value = "None" }; MaxLength = $maxLength; FormatName = @{ Value = "Text" } }
  }
  Invoke-RestMethod -Method Post -Uri "$api/EntityDefinitions(LogicalName='$entity')/Attributes" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
  Write-Host "Campo $logicalName criado no DEV."
}

# Nomes lógicos usados em src/dataverse.js (QUOTE_REQUEST_FIELDS).
Ensure-StringField "cr40f_perfilpassageiro" "cr40f_PerfilPassageiro" "Perfil do passageiro" 300 "text"
Ensure-StringField "cr40f_observacoesinternas" "cr40f_ObservacoesInternas" "Observações internas" 4000 "memo"

$xml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>"
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
Write-Host "Metadata da cotação publicada no DEV."
