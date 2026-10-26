param([switch] $DeviceCode, [switch] $EnsureSchema)

$ErrorActionPreference = "Stop"
$environmentUrl = "https://org23b93544.crm2.dynamics.com"
$api = "$environmentUrl/api/data/v9.2"
Import-Module MSAL.PS -ErrorAction Stop
$clientId = [Environment]::GetEnvironmentVariable("DV_CLIENT_ID")
if (-not $clientId) { $clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d" }
$app = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $app
try { $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -Silent }
catch {
  if (-not $DeviceCode) { throw "Sem sessão MSAL em cache para o DEV. Execute com -DeviceCode." }
  $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -DeviceCode
}
$headers = @{ Authorization = "Bearer $($token.AccessToken)"; Accept = "application/json"; "OData-Version" = "4.0" }
$solution = Invoke-RestMethod -Method Get -Uri "$api/solutions?`$select=solutionid,uniquename&`$filter=uniquename eq 'AppBetinhos'" -Headers $headers
if ($solution.value.Count -ne 1) { throw "AppBetinhos não encontrada no DEV." }
if ($EnsureSchema) {
  # Carrega somente as funções do provisionamento existente, sem executar o deploy.
  $source = Join-Path $PSScriptRoot "publish-webresource.ps1"
  $tokens = $null; $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($source, [Text.Encoding]::UTF8), [ref] $tokens, [ref] $parseErrors)
  if ($parseErrors.Count) { throw "Script de provisionamento contém erros de sintaxe." }
  $names = @("Write-Step", "Escape-OData", "Get-ResponseStatusCode", "New-DataverseLabel", "Get-EntityMetadata", "Invoke-MetadataPost", "Wait-EntityMetadata", "Ensure-PlannerTable", "Get-PlannerRelationships", "Get-PlannerRelationship", "Ensure-PlannerRelationship", "Get-PlannerAttribute", "Ensure-PlannerStringAttribute", "Ensure-PlannerDateAttribute", "Ensure-PlannerMemoAttribute", "Ensure-QuoteScenarioSchema", "Publish-XmlWithRetry")
  foreach ($name in $names) {
    $definition = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($definition.Count -ne 1) { throw "Função de provisionamento $name ausente ou ambígua." }
    . ([scriptblock]::Create($definition[0].Extent.Text))
  }
  $solutionUniqueName = "AppBetinhos"
  $headers["MSCRM.SolutionUniqueName"] = $solutionUniqueName
  Ensure-QuoteScenarioSchema -Headers $headers -ApiBaseUrl $api
  $xml = "<importexportxml><entities><entity>cr40f_pedidodecotacao</entity><entity>cr40f_cotacaoopcao</entity><entity>cr40f_cotacaoopcaoitem</entity><entity>cr40f_cotacaopropostaversao</entity></entities></importexportxml>"
  Publish-XmlWithRetry -Headers $headers -ApiBaseUrl $api -ParameterXml $xml -Label "Schema de opções e versões da cotação"
}
$table = "cr40f_cotacaopropostaversao"
$columns = @("cr40f_conteudo", "cr40f_enviadoem", "cr40f_autorid", "cr40f_autornome", "cr40f_pedidocotacao")
$attributes = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='$table')/Attributes?`$select=LogicalName,AttributeType,MetadataId" -Headers $headers
foreach ($column in $columns) {
  $attribute = @($attributes.value | Where-Object { $_.LogicalName -eq $column })
  if ($attribute.Count -ne 1) { throw "Coluna $column não encontrada no DEV." }
  [PSCustomObject]@{ Column = $column; Type = $attribute[0].AttributeType }
}
$content = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='cr40f_conteudo')/Microsoft.Dynamics.CRM.MemoAttributeMetadata?`$select=LogicalName,MaxLength" -Headers $headers
if ($content.MaxLength -lt 100000) { throw "Conteúdo da versão possui limite insuficiente: $($content.MaxLength)." }
$definition = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='$table')?`$select=MetadataId,EntitySetName" -Headers $headers
$solutionId = $solution.value[0].solutionid
$components = Invoke-RestMethod -Method Get -Uri "$api/solutioncomponents?`$select=objectid,componenttype&`$filter=_solutionid_value eq $solutionId and objectid eq $($definition.MetadataId) and componenttype eq 1" -Headers $headers
if (-not $components.value.Count) { throw "Tabela de versões não pertence à AppBetinhos no DEV." }
Write-Host "DEV verificado: $environmentUrl; solução AppBetinhos; conteúdo JSON suporta $($content.MaxLength) caracteres."
if (-not $EnsureSchema) { Write-Host "Nenhuma alteração realizada." }
