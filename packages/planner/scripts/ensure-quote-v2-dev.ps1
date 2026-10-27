[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch] $DeviceCode,
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  [switch] $ConfirmProd
)

# Cotações V2: cria as duas lookups que ligam avisos à cotação e guardam o criador.
#  - cr40f_plannernotificacao.cr40f_cotacao  -> cr40f_pedidodecotacao (navigation cr40f_Cotacao)
#  - cr40f_pedidodecotacao.cr40f_criador     -> cr40f_funcionarios    (navigation cr40f_Criador)
# Idempotente (só cria se a coluna responder 404). DEV por padrão; outro ambiente exige -ConfirmProd.
# Use -WhatIf para listar o que seria feito sem autenticar nem chamar o Dataverse.

$ErrorActionPreference = "Stop"
$devUrl = "https://org23b93544.crm2.dynamics.com"
$solution = "AppBetinhos"
$lookups = @(
  @{ Referencing = "cr40f_plannernotificacao"; Referenced = "cr40f_pedidodecotacao"; LogicalName = "cr40f_cotacao"; SchemaName = "cr40f_Cotacao"; Label = "Cotação"; Relationship = "cr40f_pedidodecotacao_plannernotificacao_cotacao" },
  @{ Referencing = "cr40f_pedidodecotacao"; Referenced = "cr40f_funcionarios"; LogicalName = "cr40f_criador"; SchemaName = "cr40f_Criador"; Label = "Criador"; Relationship = "cr40f_funcionarios_pedidodecotacao_criador" }
)

if ($EnvironmentUrl.TrimEnd("/") -ne $devUrl -and -not $ConfirmProd) {
  throw "Ambiente $EnvironmentUrl não é o DEV. Para outro ambiente, repita com -ConfirmProd."
}

if (-not $PSCmdlet.ShouldProcess($EnvironmentUrl, "autenticar e criar lookups da V2 de cotações")) {
  foreach ($l in $lookups) { Write-Host "WhatIf: garantiria $($l.Referencing).$($l.LogicalName) -> $($l.Referenced) (navigation $($l.SchemaName)) na solução $solution." }
  Write-Host "WhatIf: publicaria cr40f_plannernotificacao e cr40f_pedidodecotacao."
  return
}

$api = "$($EnvironmentUrl.TrimEnd('/'))/api/data/v9.2"
if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "MSAL.PS não encontrado." }
Import-Module MSAL.PS -ErrorAction Stop
$clientId = [Environment]::GetEnvironmentVariable("DV_CLIENT_ID")
if (-not $clientId) { $clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d" }
$app = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $app
try { $token = Get-MsalToken -PublicClientApplication $app -Scopes "$EnvironmentUrl/user_impersonation" -Silent }
catch {
  if (-not $DeviceCode) { throw "Sem sessão MSAL em cache. Execute este script com -DeviceCode." }
  $token = Get-MsalToken -PublicClientApplication $app -Scopes "$EnvironmentUrl/user_impersonation" -DeviceCode
}
$headers = @{
  Authorization = "Bearer $($token.AccessToken)"
  Accept = "application/json"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
  "MSCRM.SolutionUniqueName" = $solution
}

$solutionRows = Invoke-RestMethod -Method Get -Uri "$api/solutions?`$select=solutionid&`$filter=uniquename eq '$solution'" -Headers $headers
if ($solutionRows.value.Count -ne 1) { throw "Solution $solution não encontrada." }

function New-Label([string] $text) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $text; LanguageCode = 1046 }) }
}

function Ensure-Lookup($l) {
  $uri = "$api/EntityDefinitions(LogicalName='$($l.Referencing)')/Attributes(LogicalName='$($l.LogicalName)')?`$select=LogicalName"
  try { Invoke-RestMethod -Method Get -Uri $uri -Headers $headers | Out-Null; Write-Host "Lookup $($l.Referencing).$($l.LogicalName) já existe."; return }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw } }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    SchemaName = $l.Relationship
    ReferencedEntity = $l.Referenced
    ReferencingEntity = $l.Referencing
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
      SchemaName = $l.SchemaName
      DisplayName = New-Label $l.Label
      RequiredLevel = @{ Value = "None" }
    }
  }
  Invoke-RestMethod -Method Post -Uri "$api/RelationshipDefinitions" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
  Write-Host "Lookup $($l.Referencing).$($l.LogicalName) criada."
}

foreach ($l in $lookups) { Ensure-Lookup $l }

$xml = "<importexportxml><entities><entity>cr40f_plannernotificacao</entity><entity>cr40f_pedidodecotacao</entity></entities></importexportxml>"
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null

foreach ($l in $lookups) {
  $check = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='$($l.Referencing)')/Attributes(LogicalName='$($l.LogicalName)')?`$select=LogicalName" -Headers $headers
  Write-Host "Conferido: $($l.Referencing).$($check.LogicalName)."
}
