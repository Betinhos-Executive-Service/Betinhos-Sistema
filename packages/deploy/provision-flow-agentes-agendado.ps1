# Somente DEV. Cria (ou atualiza) o flow "Flow Agentes | Agendado" na solução AppBetinhos e o ativa.
#
# Recorrência às 07:00 (America/Sao_Paulo) de segunda a sexta: cria uma cr40f_agenteexecucao Financeiro e uma Pessoas,
# origem Agendado, status Pendente. O flow "Flow Agentes | Executar" processa cada uma. Logística não entra (roda ao abrir a tela).
# Sem segredo e sem chamada HTTP: só duas ações CreateRecord no Dataverse.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-agentes-agendado.ps1 -Restaurar <arquivo de backup>
# Para conferir a definição sem gravar (checkFlowErrors):
#   powershell -File packages/deploy/provision-flow-agentes-agendado.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Agentes | Agendado'
$dataverseFlow = 'Flow Comprovantes Despesas Assincrono | App Motoristas'   # fonte da connection reference do Dataverse
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[agentes-agendado] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-Agentes-Agendado-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[agentes-agendado] backup: $file"
}
function Apply($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -ne 1) { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null; return }
  Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
  }
}
function FlowRows() { @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value) }

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Criar_financeiro) { throw 'O arquivo não é um backup deste flow.' }
  $rows = @(FlowRows)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  Backup $rows[0]
  Apply $rows[0] $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar (statecode mantido: $($rows[0].statecode))."
  return
}

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# Connection reference do Dataverse, a mesma do flow de comprovantes.
$dvSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$dataverseFlow' and category eq 5").value)
if ($dvSource.Count -ne 1) { throw 'Flow de referência do Dataverse ausente no DEV.' }
$dataverse = ($dvSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_commondataserviceforapps
if (-not $dataverse.connection.connectionReferenceLogicalName) { throw 'Connection reference do Dataverse ausente.' }

$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": {
    "Todo_dia_util_07h": { "type": "Recurrence", "recurrence": { "frequency": "Week", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": ["7"], "minutes": [0] } } }
  },
  "actions": {
    "Hoje": { "type": "Compose", "runAfter": {}, "inputs": "@convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'dd/MM/yyyy')" },
    "Criar_financeiro": {
      "type": "OpenApiConnection", "runAfter": { "Hoje": ["Succeeded"] },
      "inputs": {
        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
        "parameters": { "entityName": "cr40f_agenteexecucaos", "item/cr40f_agenteexecucaonome": "Financeiro @{outputs('Hoje')} (agendado)", "item/cr40f_agente": 100000000, "item/cr40f_origem": 100000000, "item/cr40f_status": 100000000 },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Criar_pessoas": {
      "type": "OpenApiConnection", "runAfter": { "Criar_financeiro": ["Succeeded", "Failed"] },
      "inputs": {
        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
        "parameters": { "entityName": "cr40f_agenteexecucaos", "item/cr40f_agenteexecucaonome": "Pessoas @{outputs('Hoje')} (agendado)", "item/cr40f_agente": 100000002, "item/cr40f_origem": 100000000, "item/cr40f_status": 100000000 },
        "authentication": "@parameters('$authentication')"
      }
    }
  },
  "outputs": {}
}
'@
$definition = $definitionText | ConvertFrom-Json
$definitionJson = $definition | ConvertTo-Json -Depth 90 -Compress
AssertSemMojibake $definitionJson 'definição do script'
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{ shared_commondataserviceforapps = $dataverse } }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

function Conferir($lido) {
  $t = $lido.triggers.Todo_dia_util_07h
  $r = $t.recurrence
  $fin = $lido.actions.Criar_financeiro.inputs.parameters
  $pes = $lido.actions.Criar_pessoas.inputs.parameters
  $checks = [ordered]@{
    'gatilho Recurrence semanal, intervalo 1' = $t.type -eq 'Recurrence' -and $r.frequency -eq 'Week' -and $r.interval -eq 1
    'fuso E. South America Standard Time' = $r.timeZone -ceq 'E. South America Standard Time'
    'hora 7, minuto 0' = (@($r.schedule.hours) -join ',') -eq '7' -and (@($r.schedule.minutes) -join ',') -eq '0'
    'cinco dias úteis' = (@($r.schedule.weekDays) -join ',') -ceq 'Monday,Tuesday,Wednesday,Thursday,Friday'
    'Criar_financeiro: CreateRecord em cr40f_agenteexecucaos, agente 100000000, origem 100000000, status 100000000' = $lido.actions.Criar_financeiro.inputs.host.operationId -eq 'CreateRecord' -and $fin.entityName -ceq 'cr40f_agenteexecucaos' -and $fin.'item/cr40f_agente' -eq 100000000 -and $fin.'item/cr40f_origem' -eq 100000000 -and $fin.'item/cr40f_status' -eq 100000000
    'Criar_pessoas: CreateRecord em cr40f_agenteexecucaos, agente 100000002, origem 100000000, status 100000000' = $lido.actions.Criar_pessoas.inputs.host.operationId -eq 'CreateRecord' -and $pes.entityName -ceq 'cr40f_agenteexecucaos' -and $pes.'item/cr40f_agente' -eq 100000002 -and $pes.'item/cr40f_origem' -eq 100000000 -and $pes.'item/cr40f_status' -eq 100000000
    'Criar_pessoas roda após Criar_financeiro (Succeeded, Failed)' = (@($lido.actions.Criar_pessoas.runAfter.Criar_financeiro) -join ',') -eq 'Succeeded,Failed'
    'nomes com a data de hoje' = $fin.'item/cr40f_agenteexecucaonome' -ceq "Financeiro @{outputs('Hoje')} (agendado)" -and $pes.'item/cr40f_agenteexecucaonome' -ceq "Pessoas @{outputs('Hoje')} (agendado)"
  }
  $falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
  if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
  $checks.Keys | ForEach-Object { Write-Host "[agentes-agendado] ok: $_" }
}

$flows = @(FlowRows)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($SomenteValidar) {
  if (-not $flows.Count) { throw 'Flow ainda não existe no DEV; não há o que validar.' }
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flows[0].workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = $definition
  $check = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $check -UseBasicParsing
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
  Conferir $definition
  return
}
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  AssertSemMojibake $flows[0].clientdata 'clientdata atual'
  $atual = ($flows[0].clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  $novo = ($clientData | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  if ($atual -ne $novo) {
    Backup $flows[0]
    Apply $flows[0] $clientData
  } else { Write-Host '[agentes-agendado] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Todo dia útil às 07:00 (America/Sao_Paulo) cria uma execução Financeiro e uma Pessoas (origem Agendado, status Pendente) para o flow Executar processar.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null }

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=statecode,clientdata"
if ($row.statecode -ne 1) { throw 'Flow não ativou.' }
AssertSemMojibake $row.clientdata 'clientdata gravado'
Conferir (($row.clientdata | ConvertFrom-Json).properties.definition)
if (-not @((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $flowId").value).Count) { throw 'Flow fora da AppBetinhos.' }
Write-Output "DEV: '$flowName' ativo ($flowId), na $solutionName."
