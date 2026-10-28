[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch] $DeviceCode,
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  [switch] $ConfirmProd
)

# Cotações V2/V2.1: garante as colunas da cotação e a lookup que liga avisos à cotação.
#  - cr40f_pedidodecotacao.cr40f_aguardandooque   (texto 500, V2.1: o que falta)
#  - cr40f_pedidodecotacao.cr40f_aguardandodequem (texto 200, V2.1: de quem)
#  - cr40f_pedidodecotacao.cr40f_aguardandoretorno (data, V2.1: retorno esperado)
#  - cr40f_pedidodecotacao.cr40f_criador     -> cr40f_funcionarios    (navigation cr40f_Criador)
#  - cr40f_plannernotificacao.cr40f_cotacao  -> cr40f_pedidodecotacao (navigation cr40f_Cotacao)
# Ordem: primeiro a cotação, por último a tabela de avisos (no DEV ela falha por metadata
# quebrada de cr40f_datareferencia). Cada item é isolado: um erro não impede os outros;
# o resumo no fim sai com código 1 se algum falhou.
# Idempotente (só cria se a coluna responder 404). DEV por padrão; outro ambiente exige -ConfirmProd.
# Use -WhatIf para listar o que seria feito sem autenticar nem chamar o Dataverse.

$ErrorActionPreference = "Stop"
$devUrl = "https://org23b93544.crm2.dynamics.com"
$solution = "AppBetinhos"
$fields = @(
  @{ Entity = "cr40f_pedidodecotacao"; LogicalName = "cr40f_aguardandooque"; SchemaName = "cr40f_AguardandoOQue"; Label = "Aguardando: o que falta"; Kind = "String"; MaxLength = 500 },
  @{ Entity = "cr40f_pedidodecotacao"; LogicalName = "cr40f_aguardandodequem"; SchemaName = "cr40f_AguardandoDeQuem"; Label = "Aguardando: de quem"; Kind = "String"; MaxLength = 200 },
  @{ Entity = "cr40f_pedidodecotacao"; LogicalName = "cr40f_aguardandoretorno"; SchemaName = "cr40f_AguardandoRetorno"; Label = "Aguardando: data de retorno"; Kind = "DateOnly" }
)
# A lookup da tabela de avisos fica por último (ver cabeçalho).
$lookups = @(
  @{ Referencing = "cr40f_pedidodecotacao"; Referenced = "cr40f_funcionarios"; LogicalName = "cr40f_criador"; SchemaName = "cr40f_Criador"; Label = "Criador"; Relationship = "cr40f_funcionarios_pedidodecotacao_criador" },
  @{ Referencing = "cr40f_plannernotificacao"; Referenced = "cr40f_pedidodecotacao"; LogicalName = "cr40f_cotacao"; SchemaName = "cr40f_Cotacao"; Label = "Cotação"; Relationship = "cr40f_pedidodecotacao_plannernotificacao_cotacao" }
)

if ($EnvironmentUrl.TrimEnd("/") -ne $devUrl -and -not $ConfirmProd) {
  throw "Ambiente $EnvironmentUrl não é o DEV. Para outro ambiente, repita com -ConfirmProd."
}

if (-not $PSCmdlet.ShouldProcess($EnvironmentUrl, "autenticar e criar colunas e lookups da V2/V2.1 de cotações")) {
  foreach ($f in $fields) { Write-Host "WhatIf: garantiria $($f.Entity).$($f.LogicalName) ($($f.Kind)$(if ($f.MaxLength) { " $($f.MaxLength)" })) na solução $solution." }
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

function Test-Attribute([string] $entity, [string] $logicalName) {
  try { Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$logicalName')?`$select=LogicalName" -Headers $headers | Out-Null; return $true }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; return $false }
}

function Ensure-Field($f) {
  if (Test-Attribute $f.Entity $f.LogicalName) { Write-Host "Coluna $($f.Entity).$($f.LogicalName) já existe."; return $false }
  $body = if ($f.Kind -eq "DateOnly") {
    @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $f.SchemaName; DisplayName = New-Label $f.Label; RequiredLevel = @{ Value = "None" }; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
  } else {
    @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $f.SchemaName; DisplayName = New-Label $f.Label; RequiredLevel = @{ Value = "None" }; MaxLength = $f.MaxLength; FormatName = @{ Value = "Text" } }
  }
  Invoke-RestMethod -Method Post -Uri "$api/EntityDefinitions(LogicalName='$($f.Entity)')/Attributes" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
  Write-Host "Coluna $($f.Entity).$($f.LogicalName) criada."
  return $true
}

function Ensure-Lookup($l) {
  if (Test-Attribute $l.Referencing $l.LogicalName) { Write-Host "Lookup $($l.Referencing).$($l.LogicalName) já existe."; return $false }
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
  return $true
}

# Cada item isolado: um erro (ex.: metadata quebrada na tabela de avisos) não impede os demais.
$failures = @()
$items = @($fields | ForEach-Object { @{ Name = "$($_.Entity).$($_.LogicalName)"; Entity = $_.Entity; Run = { param($x) Ensure-Field $x }; Spec = $_ } }) +
  @($lookups | ForEach-Object { @{ Name = "$($_.Referencing).$($_.LogicalName)"; Entity = $_.Referencing; Run = { param($x) Ensure-Lookup $x }; Spec = $_ } })
# Só publica a tabela que recebeu coluna nova (publicar a de avisos falha no DEV mesmo sem mudança).
$touched = @{}
foreach ($item in $items) {
  try { if (& $item.Run $item.Spec) { $touched[$item.Entity] = $true } }
  catch { $failures += "$($item.Name): $($_.Exception.Message)"; Write-Warning "Falhou $($item.Name): $($_.Exception.Message)" }
}

foreach ($entity in $touched.Keys) {
  try {
    $xml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>"
    Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
  } catch { $failures += "publicar $($entity): $($_.Exception.Message)"; Write-Warning "Falhou publicar $($entity): $($_.Exception.Message)" }
}

foreach ($item in $items) {
  try { if (Test-Attribute $item.Entity $item.Spec.LogicalName) { Write-Host "Conferido: $($item.Name)." } else { $failures += "$($item.Name): ausente após a criação" } }
  catch { $failures += "conferir $($item.Name): $($_.Exception.Message)" }
}

Write-Host ""
if ($failures.Count) {
  Write-Host "Resumo: $($failures.Count) falha(s):"
  $failures | Select-Object -Unique | ForEach-Object { Write-Host " - $_" }
  exit 1
}
Write-Host "Resumo: todas as colunas e lookups conferidas."
