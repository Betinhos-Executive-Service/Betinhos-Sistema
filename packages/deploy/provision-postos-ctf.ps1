param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply
)

# Somente DEV: o PROD recebe a coluna pelas solucoes (BetinhosCore).
if (([Uri]$EnvironmentUrl).Host -ne "org23b93544.crm2.dynamics.com") { throw "Somente DEV." }

# Coluna new_aceitactf em new_postocombustivel: posto da rede CTF (cartao Sem Parar Combustivel). Os registros vem de
# packages/deploy/carregar-postos-ctf.ps1, rodado em cada ambiente.
# Aditivo e idempotente. Dry-run por padrao. Schema: roda a mao, do checkout principal na develop (requer az login).

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$table = "new_postocombustivel"
$column = "new_aceitactf"
function Label([string] $Text) { return @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1046 }) } }
function Write-Step([string] $Message) { Write-Host "[postos-ctf] $Message" }

$baseUrl = $EnvironmentUrl.TrimEnd("/")
$token = & az account get-access-token --resource "$baseUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token do Dataverse DEV indisponivel (rode az login)." }
$apiBase = "$baseUrl/api/data/v9.2"

function Invoke-Dv([string] $Method, [string] $Path, $Body = $null) {
  $headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }
  $params = @{ Method = $Method; Uri = "$apiBase/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 50 -Compress))
  }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}
function Get-Rows([string] $Set, [string] $Select, [string] $Filter) {
  return @((Invoke-Dv "GET" "${Set}?`$select=$Select&`$filter=$([uri]::EscapeDataString($Filter))").value)
}

$attrs = "EntityDefinitions(LogicalName='$table')/Attributes"
$found = @(Get-Rows $attrs "MetadataId,LogicalName" "LogicalName eq '$column'")
if ($found.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria $table.$column (sim/nao, padrao Nao). Use -Apply para aplicar."; return }
  Invoke-Dv "POST" $attrs @{
    "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
    SchemaName = $column
    DisplayName = (Label "Aceita CTF")
    Description = (Label "Posto da rede CTF (cart$([char]0xE3)o Sem Parar Combust$([char]0xED)vel).")
    RequiredLevel = @{ Value = "None" }
    DefaultValue = $false
    OptionSet = @{ TrueOption = @{ Value = 1; Label = (Label "Sim") }; FalseOption = @{ Value = 0; Label = (Label "N$([char]0xE3)o") } }
  } | Out-Null
  $found = @(Get-Rows $attrs "MetadataId,LogicalName" "LogicalName eq '$column'")
}
if ($found.Count -ne 1) { throw "Coluna $column nao ficou unica." }
if (-not $Apply) { Write-Step "coluna $column ja existe; dry-run: nada gravado."; return }

$solutionId = (Get-Rows "solutions" "solutionid" "uniquename eq '$SolutionUniqueName'")[0].solutionid
$inSolution = @(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $($found[0].MetadataId) and componenttype eq 2")
if ($inSolution.Count -eq 0) {
  Invoke-Dv "POST" "AddSolutionComponent" @{ ComponentId = $found[0].MetadataId; ComponentType = 2; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
}
Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$table</entity></entities></importexportxml>" } | Out-Null
Write-Step "OK: $table.$column publicada e na solucao $SolutionUniqueName."
