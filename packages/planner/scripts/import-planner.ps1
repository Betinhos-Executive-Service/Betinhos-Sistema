param(
  [Parameter(Mandatory = $true)]
  [string] $PlanId,
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SourcePath = "",
  [string] $EmployeeMapPath = "",
  [string] $OutputDirectory = "output\planner-import",
  [string] $TenantId = "organizations",
  [string] $ClientId = "",
  [switch] $DeviceCode,
  [switch] $DryRun,
  [switch] $CollectOnly,
  [switch] $SkipDetails
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$graphBaseUrl = "https://graph.microsoft.com/v1.0"
$dataverseApiVersion = "v9.2"
$taskTable = "cr40f_plannertarefa"
$taskSet = "cr40f_plannertarefas"
$eventTable = "cr40f_plannertarefaevento"
$eventSet = "cr40f_plannertarefaeventos"
$assigneeRelationTable = "cr40f_plannertarearesponsavel"
$assigneeRelationSet = "cr40f_plannertarearesponsavels"
$employeeTable = "cr40f_funcionarios"
$employeeSet = "cr40f_funcionarioses"
$checklistField = "cr40f_checklistjson"
$sourcePrefix = "MSPLANNER:"

function Write-Step([string] $Message) {
  Write-Host "[import-planner] $Message"
}

function Escape-OData([string] $Value) {
  return ([string]$Value).Replace("'", "''")
}

function Get-ResponseStatusCode($ErrorRecord) {
  try { return [int] $ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

function Invoke-GraphGet([string] $Uri) {
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      return Invoke-MgGraphRequest -Method GET -Uri $Uri -OutputType PSObject
    }
    catch {
      $message = $_.Exception.Message
      if ($attempt -eq 5 -or $message -notmatch "429|Too Many Requests|5\d\d|temporar") { throw }
      $delay = [Math]::Min(30, [Math]::Pow(2, $attempt))
      Write-Step "Graph temporariamente indisponível; tentando novamente em ${delay}s ($attempt/4)"
      Start-Sleep -Seconds $delay
    }
  }
  throw "Falha inesperada ao consultar o Microsoft Graph."
}

function Get-GraphCollection([string] $InitialUri, $InitialPage = $null) {
  $items = [System.Collections.Generic.List[object]]::new()
  $page = $InitialPage
  $uri = $InitialUri
  do {
    if (-not $page) { $page = Invoke-GraphGet $uri }
    foreach ($item in @($page.value)) { $items.Add($item) }
    $uri = [string] $page.'@odata.nextLink'
    $page = $null
    if ($uri) { Write-Step "Paginação Graph: $($items.Count) itens coletados" }
  } while ($uri)
  return @($items)
}

function Load-Json([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "JSON não encontrado: $Path" }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-FirstPropertyValue($Object, [string[]] $Names) {
  foreach ($name in $Names) {
    $property = $Object.PSObject.Properties[$name]
    if ($property -and $null -ne $property.Value -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
      return $property.Value
    }
  }
  return ""
}

function Load-EmployeeMap([string] $Path) {
  $map = @{}
  if ([string]::IsNullOrWhiteSpace($Path)) { return $map }
  $raw = Load-Json $Path
  if ($raw -is [System.Array]) {
    foreach ($item in $raw) {
      $graphId = [string](Get-FirstPropertyValue $item @("graphUserId", "userId", "microsoftId"))
      $employeeId = [string](Get-FirstPropertyValue $item @("employeeId", "dataverseEmployeeId"))
      if ($graphId -and $employeeId) { $map[$graphId.ToLowerInvariant()] = $employeeId }
    }
    return $map
  }
  foreach ($property in $raw.PSObject.Properties) {
    if ($property.Name -and $property.Value) { $map[$property.Name.ToLowerInvariant()] = [string]$property.Value }
  }
  return $map
}

function Get-TaskStatusChoice([int] $PercentComplete) {
  if ($PercentComplete -ge 100) { return 100000003 }
  if ($PercentComplete -gt 0) { return 100000001 }
  return 100000000
}

function Get-TaskPriorityChoice([int] $Priority) {
  switch ($Priority) {
    1 { return 100000003 }
    3 { return 100000002 }
    9 { return 100000000 }
    default { return 100000001 }
  }
}

function Get-ChecklistItems($Details) {
  $items = [System.Collections.Generic.List[object]]::new()
  if (-not $Details -or -not $Details.checklist) { return @($items) }
  foreach ($property in $Details.checklist.PSObject.Properties) {
    $item = $property.Value
    $title = [string](Get-FirstPropertyValue $item @("title"))
    if (-not $title) { continue }
    $items.Add([ordered]@{
      id = [string]$property.Name
      title = $title
      done = [bool]$item.isChecked
    })
  }
  return @($items)
}

function Get-TaskDescription($Details) {
  if (-not $Details) { return "" }
  return [string](Get-FirstPropertyValue $Details @("description"))
}

function Get-DateOnly([string] $Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return ([DateTimeOffset]::Parse($Value)).ToUniversalTime().ToString("yyyy-MM-ddT12:00:00Z")
}

function Get-TaskImportRows($Tasks, $Details, $Buckets, $EmployeeMap) {
  $detailsById = @{}
  foreach ($item in @($Details)) { $detailsById[[string]$item.taskId] = $item.details }
  $bucketById = @{}
  foreach ($bucket in @($Buckets)) { $bucketById[[string]$bucket.id] = [string]$bucket.name }

  $rows = [System.Collections.Generic.List[object]]::new()
  foreach ($task in @($Tasks)) {
    $taskId = [string]$task.id
    $taskDetails = $detailsById[$taskId]
    $assigned = [System.Collections.Generic.List[object]]::new()
    if ($task.assignments) {
      foreach ($property in $task.assignments.PSObject.Properties) {
        $graphUserId = [string]$property.Name
        $employeeId = $EmployeeMap[$graphUserId.ToLowerInvariant()]
        $assigned.Add([ordered]@{
          graphUserId = $graphUserId
          employeeId = if ($employeeId) { $employeeId } else { "" }
        })
      }
    }
    $rows.Add([ordered]@{
      plannerTaskId = $taskId
      planId = [string]$task.planId
      bucketId = [string]$task.bucketId
      bucketName = $bucketById[[string]$task.bucketId]
      title = [string]$task.title
      description = Get-TaskDescription $taskDetails
      checklist = @(Get-ChecklistItems $taskDetails)
      status = Get-TaskStatusChoice ([int]$task.percentComplete)
      priority = Get-TaskPriorityChoice ([int]$task.priority)
      dueDate = Get-DateOnly ([string]$task.dueDateTime)
      createdDateTime = [string]$task.createdDateTime
      completedDateTime = [string]$task.completedDateTime
      assignments = @($assigned)
    })
  }
  return @($rows)
}

function Get-DataverseToken([string] $EnvironmentUrl, [string] $Tenant, [string] $ConfiguredClientId, [switch] $UseDeviceCode) {
  if ($PSVersionTable.PSEdition -eq "Core" -or $PSHOME -like "*codex-runtimes*") {
    $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    throw "Execute este importador no Windows PowerShell 5.1 para autenticar no Dataverse."
  }
  if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "MSAL.PS não encontrado. Instale com: Install-Module MSAL.PS -Scope CurrentUser" }
  Import-Module MSAL.PS -ErrorAction Stop
  $clientId = if ($ConfiguredClientId) { $ConfiguredClientId } else { "51f81489-12ee-4a9e-aaae-a2591f45987d" }
  $application = New-MsalClientApplication -ClientId $clientId -TenantId $Tenant -RedirectUri ([Uri]"http://localhost")
  Enable-MsalTokenCacheOnDisk -PublicClientApplication $application
  $scope = "$($EnvironmentUrl.TrimEnd('/'))/user_impersonation"
  try { $token = Get-MsalToken -PublicClientApplication $application -Scopes $scope -Silent }
  catch {
    if ($UseDeviceCode) { $token = Get-MsalToken -PublicClientApplication $application -Scopes $scope -DeviceCode }
    else { $token = Get-MsalToken -PublicClientApplication $application -Scopes $scope -Interactive }
  }
  if (-not $token.AccessToken) { throw "Não foi possível obter token do Dataverse." }
  return [string]$token.AccessToken
}

function Get-DataverseHeaders([string] $AccessToken) {
  return @{
    Authorization = "Bearer $AccessToken"
    Accept = "application/json"
    "OData-MaxVersion" = "4.0"
    "OData-Version" = "4.0"
    "Content-Type" = "application/json; charset=utf-8"
    Prefer = 'odata.include-annotations="*",return=representation'
  }
}

function Invoke-Dataverse([string] $Method, [string] $Uri, [hashtable] $Headers, $Body = $null) {
  $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ErrorAction = "Stop" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 20) }
  return Invoke-RestMethod @params
}

function Get-LookupNavigation([string] $ApiBaseUrl, [hashtable] $Headers, [string] $Entity, [string] $Attribute, [string] $Target) {
  $entityEscaped = Escape-OData $Entity
  $metadata = Invoke-Dataverse GET "$ApiBaseUrl/EntityDefinitions(LogicalName='$entityEscaped')/ManyToOneRelationships?`$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity" $Headers
  $match = @($metadata.value) | Where-Object { $_.ReferencingAttribute -ieq $Attribute -and $_.ReferencedEntity -ieq $Target } | Select-Object -First 1
  if (-not $match) { throw "Lookup não encontrado: $Entity.$Attribute -> $Target" }
  return [string]$match.ReferencingEntityNavigationPropertyName
}

function Get-ExistingTaskId([string] $ApiBaseUrl, [hashtable] $Headers, [string] $SourceCode) {
  $escaped = Escape-OData $SourceCode
  $uri = "$ApiBaseUrl/$taskSet?`$select=cr40f_plannertarefaid&`$filter=cr40f_codigoorigem eq '$escaped'&`$top=1"
  $result = Invoke-Dataverse GET $uri $Headers
  return [string]$result.value[0].cr40f_plannertarefaid
}

function Import-DataverseTasks($Rows, [string] $Environment, [hashtable] $Headers) {
  $apiBaseUrl = "$($Environment.TrimEnd('/'))/api/data/$dataverseApiVersion"
  $taskAssigneeNavigation = Get-LookupNavigation $apiBaseUrl $Headers $taskTable "cr40f_cr40f_funcionarioresponsavel" $employeeTable
  $relationTaskNavigation = Get-LookupNavigation $apiBaseUrl $Headers $assigneeRelationTable "cr40f_tarefa" $taskTable
  $relationEmployeeNavigation = Get-LookupNavigation $apiBaseUrl $Headers $assigneeRelationTable "cr40f_funcionario" $employeeTable
  $eventTaskNavigation = Get-LookupNavigation $apiBaseUrl $Headers $eventTable "cr40f_tarefa" $taskTable
  $results = [System.Collections.Generic.List[object]]::new()

  foreach ($row in @($Rows)) {
    $sourceCode = "$sourcePrefix$($row.plannerTaskId)"
    $existingId = Get-ExistingTaskId $apiBaseUrl $Headers $sourceCode
    if ($existingId) {
      $results.Add([ordered]@{ plannerTaskId = $row.plannerTaskId; result = "already_exists"; dataverseTaskId = $existingId })
      continue
    }
    $payload = [ordered]@{
      cr40f_titulo = $row.title
      cr40f_descricao = $row.description
      cr40f_status = $row.status
      cr40f_prioridade = $row.priority
      cr40f_prazo = $row.dueDate
      cr40f_origem = 100000000
      cr40f_codigoorigem = $sourceCode
      $checklistField = if (@($row.checklist).Count) { (@($row.checklist) | ConvertTo-Json -Compress -Depth 10) } else { "[]" }
    }
    $firstEmployeeId = [string](@($row.assignments | Where-Object { $_.employeeId })[0].employeeId)
    if ($firstEmployeeId) { $payload["$taskAssigneeNavigation@odata.bind"] = "/$employeeSet($firstEmployeeId)" }
    $created = Invoke-Dataverse POST "$apiBaseUrl/$taskSet" $Headers $payload
    $taskId = [string]$created.cr40f_plannertarefaid
    if (-not $taskId) { throw "Dataverse criou a tarefa '$($row.title)' sem retornar ID." }

    foreach ($assignment in @($row.assignments | Where-Object { $_.employeeId })) {
      $relationPayload = [ordered]@{
        cr40f_name = "$taskId-$($assignment.employeeId)"
        "$relationTaskNavigation@odata.bind" = "/$taskSet($taskId)"
        "$relationEmployeeNavigation@odata.bind" = "/$employeeSet($($assignment.employeeId))"
      }
      Invoke-Dataverse POST "$apiBaseUrl/$assigneeRelationSet" $Headers $relationPayload | Out-Null
    }
    $eventPayload = [ordered]@{
      cr40f_tipo = 100000000
      cr40f_descricao = "Tarefa importada do Microsoft Planner."
      cr40f_ocorridoem = (Get-Date).ToUniversalTime().ToString("o")
      "$eventTaskNavigation@odata.bind" = "/$taskSet($taskId)"
    }
    Invoke-Dataverse POST "$apiBaseUrl/$eventSet" $Headers $eventPayload | Out-Null
    $results.Add([ordered]@{ plannerTaskId = $row.plannerTaskId; result = "created"; dataverseTaskId = $taskId })
  }
  return @($results)
}

if (-not (Test-Path -LiteralPath $OutputDirectory)) { New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null }
$employeeMap = Load-EmployeeMap $EmployeeMapPath

if (-not (Get-Module -ListAvailable Microsoft.Graph.Authentication)) {
  throw "Microsoft.Graph.Authentication não encontrado. Instale com: Install-Module Microsoft.Graph.Authentication -Scope CurrentUser"
}
Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
Connect-MgGraph -Scopes "Tasks.Read" -TenantId $TenantId -NoWelcome | Out-Null

$seedPage = $null
if ($SourcePath) { $seedPage = Load-Json $SourcePath }
$taskUri = "$graphBaseUrl/planner/plans/$([Uri]::EscapeDataString($PlanId))/tasks"
$tasks = Get-GraphCollection $taskUri $seedPage
$buckets = @(Get-GraphCollection "$graphBaseUrl/planner/plans/$([Uri]::EscapeDataString($PlanId))/buckets")
$details = [System.Collections.Generic.List[object]]::new()

if (-not $SkipDetails) {
  $detailCandidates = @($tasks | Where-Object { $_.hasDescription -or $_.checklistItemCount -gt 0 })
  Write-Step "Buscando detalhes de $($detailCandidates.Count) tarefas"
  foreach ($task in $detailCandidates) {
    $detail = Invoke-GraphGet "$graphBaseUrl/planner/tasks/$([Uri]::EscapeDataString([string]$task.id))/details"
    $details.Add([ordered]@{ taskId = [string]$task.id; details = $detail })
  }
}

$rows = @(Get-TaskImportRows $tasks $details $buckets $employeeMap)
$snapshot = [ordered]@{
  planId = $PlanId
  retrievedAt = (Get-Date).ToUniversalTime().ToString("o")
  tasks = @($tasks)
  buckets = @($buckets)
  details = @($details)
  importRows = @($rows)
}
$snapshotPath = Join-Path $OutputDirectory "planner-snapshot.json"
$reportPath = Join-Path $OutputDirectory "planner-import-report.json"
$snapshot | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $snapshotPath -Encoding UTF8

$unresolved = @($rows | ForEach-Object { @($_.assignments | Where-Object { -not $_.employeeId }) } | Where-Object { $_ })
$report = [ordered]@{
  planId = $PlanId
  taskCount = $rows.Count
  bucketCount = $buckets.Count
  unresolvedAssignmentCount = $unresolved.Count
  unresolvedAssignments = @($unresolved)
  snapshotPath = $snapshotPath
  status = if ($CollectOnly) { "collected" } elseif ($DryRun) { "dry_run" } else { "pending_import" }
}

if ($CollectOnly -or $DryRun) {
  $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  Write-Step "Snapshot salvo em $snapshotPath"
  Write-Step "Relatório salvo em $reportPath"
  Write-Step "Tarefas: $($rows.Count); responsáveis sem mapeamento: $($unresolved.Count)"
  exit 0
}

$accessToken = Get-DataverseToken $EnvironmentUrl $TenantId $ClientId $DeviceCode
$headers = Get-DataverseHeaders $accessToken
$results = @(Import-DataverseTasks $rows $EnvironmentUrl $headers)
$report.results = $results
$report.status = "imported"
$report.createdCount = @($results | Where-Object result -eq "created").Count
$report.existingCount = @($results | Where-Object result -eq "already_exists").Count
$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Step "Importação concluída: criadas $($report.createdCount), já existentes $($report.existingCount)"
Write-Step "Relatório salvo em $reportPath"
