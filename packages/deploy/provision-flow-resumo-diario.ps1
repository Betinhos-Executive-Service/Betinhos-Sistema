# Somente DEV. Cria (ou atualiza) o flow "Flow Alertas | Resumo diário" e a variável de ambiente cr40f_ResumoEmailOperacao
# (só a definição, sem valor) na solução AppBetinhos. O flow nasce DESLIGADO.
#
# Todo dia útil às 07:00 (America/Sao_Paulo) manda UM e-mail à operação com as pendências de hoje: CNH vencida e ASO vencido
# de motorista escalado hoje, documento vigente vencido de veículo escalado hoje e multa sem condutor com prazo de indicação
# em até 3 dias. Sem itens, o flow termina sem enviar. Sem tabela, sem Worker, sem segredo no repositório.
#
# O valor de cr40f_ResumoEmailOperacao (e-mails separados por ponto e vírgula) é preenchido pelo Renan no maker portal;
# este script nunca lê nem grava esse valor. Exige uma referência de conexão do Office 365 Outlook na solução.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-resumo-diario.ps1 -Restaurar <arquivo de backup>
# Para conferir a definição sem gravar (checkFlowErrors):   -SomenteValidar
# Para ligar o flow (exige valor na variável de ambiente):  -Ativar
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '', [switch] $SomenteValidar, [switch] $Ativar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Alertas | Resumo diário'
$envVarName = 'cr40f_ResumoEmailOperacao'
$paramEmail = "$envVarName ($envVarName)"
$dataverseFlow = 'Flow Comprovantes Despesas Assincrono | App Motoristas'   # fonte da connection reference do Dataverse
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[resumo-diario] $Method $($Path.Split('?')[0])"
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
  $file = Join-Path $backupDir ("Flow-Resumo-Diario-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[resumo-diario] backup: $file"
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
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Escopo_resumo) { throw 'O arquivo não é um backup deste flow.' }
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

# Variável de ambiente: só a definição (String, sem valor padrão). O valor é do Renan e este script nunca o lê.
$envDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'").value)
if (-not $envDefs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $envVarName; displayname = $envVarName; type = 100000000; description = 'E-mails da operação que recebem o resumo diário de pendências (CNH, ASO, documento do veículo e multa), separados por ponto e vírgula. Valor preenchido só no ambiente.' } | Out-Null
  $envDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'").value)
}
if ($envDefs.Count -ne 1) { throw "Variável $envVarName ausente ou duplicada." }
# Valor padrão faz parte da definição e iria no export da solução. Confere pelo filtro, sem trazer o valor.
if (@((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName' and defaultvalue ne null").value).Count) { throw "A variável $envVarName tem valor padrão; ele iria no export da solução. Apague o valor padrão e use só o valor atual." }
$envId = $envDefs[0].environmentvariabledefinitionid
Include $envId 380
$temValor = [bool]@((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $envId").value).Count

# Connection references: Dataverse (a do flow de comprovantes) e Office 365 Outlook (uma da solução; criada pelo Renan no maker portal).
$dvSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$dataverseFlow' and category eq 5").value)
if ($dvSource.Count -ne 1) { throw 'Flow de referência do Dataverse ausente no DEV.' }
$dataverse = ($dvSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_commondataserviceforapps
if (-not $dataverse.connection.connectionReferenceLogicalName) { throw 'Connection reference do Dataverse ausente.' }
$outlookRefs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname&`$filter=connectorid eq '/providers/Microsoft.PowerApps/apis/shared_office365' and statecode eq 0").value)
if (-not $outlookRefs.Count) { throw 'NEEDS_CONTEXT: Crie uma referência de conexão do Office 365 Outlook na solução AppBetinhos (maker portal) e rode de novo.' }
$outlook = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $outlookRefs[0].connectionreferencelogicalname }; api = @{ name = 'shared_office365' } }

$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "__PARAM_EMAIL__": { "defaultValue": "", "type": "String", "metadata": { "schemaName": "cr40f_ResumoEmailOperacao" } }
  },
  "triggers": {
    "Dias_uteis_07h": {
      "type": "Recurrence",
      "recurrence": { "frequency": "Week", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": ["7"], "minutes": [0] } }
    }
  },
  "actions": {
    "Escopo_resumo": {
      "type": "Scope", "runAfter": {},
      "actions": {
        "Hoje": { "type": "Compose", "runAfter": {}, "inputs": "@convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')" },
        "Inicio_hoje": { "type": "Compose", "runAfter": { "Hoje": ["Succeeded"] }, "inputs": "@convertToUtc(concat(outputs('Hoje'), 'T00:00:00'), 'E. South America Standard Time')" },
        "Fim_hoje": { "type": "Compose", "runAfter": { "Inicio_hoje": ["Succeeded"] }, "inputs": "@addToTime(outputs('Inicio_hoje'), 1, 'Day')" },
        "Limite_aso": { "type": "Compose", "runAfter": { "Fim_hoje": ["Succeeded"] }, "inputs": "@formatDateTime(addToTime(outputs('Hoje'), -12, 'Month'), 'yyyy-MM-dd')" },
        "Limite_multa": { "type": "Compose", "runAfter": { "Limite_aso": ["Succeeded"] }, "inputs": "@formatDateTime(addToTime(outputs('Hoje'), 3, 'Day'), 'yyyy-MM-dd')" },
        "Escalados": {
          "type": "OpenApiConnection", "runAfter": { "Limite_multa": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_reservadeveculoses",
              "$select": "cr40f_reservadeveculosid,_cr40f_motorista_value,_cr40f_veiculo_value",
              "$filter": "statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge @{outputs('Inicio_hoje')} and cr40f_dataehorriodesada lt @{outputs('Fim_hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Ids_motoristas": { "type": "Select", "runAfter": { "Escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Escalados')?['body/value']", "select": "@toLower(coalesce(item()?['_cr40f_motorista_value'], ''))" } },
        "Ids_veiculos": { "type": "Select", "runAfter": { "Ids_motoristas": ["Succeeded"] }, "inputs": { "from": "@outputs('Escalados')?['body/value']", "select": "@toLower(coalesce(item()?['_cr40f_veiculo_value'], ''))" } },
        "Cnh": {
          "type": "OpenApiConnection", "runAfter": { "Ids_veiculos": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_funcionarioses",
              "$select": "cr40f_funcionariosid,new_apelido,cr40f_validadedacnh",
              "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_validadedacnh lt @{outputs('Hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Aso": {
          "type": "OpenApiConnection", "runAfter": { "Cnh": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_funcionarioses",
              "$select": "cr40f_funcionariosid,new_apelido,cr40f_datadoaso",
              "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_datadoaso lt @{outputs('Limite_aso')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Docs": {
          "type": "OpenApiConnection", "runAfter": { "Aso": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_documentos",
              "$select": "cr40f_documentoid,cr40f_name,cr40f_validade,_cr40f_veiculo_value",
              "$filter": "statecode eq 0 and cr40f_situacao eq 100000000 and _cr40f_veiculo_value ne null and cr40f_validade lt @{outputs('Hoje')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Multas": {
          "type": "OpenApiConnection", "runAfter": { "Docs": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_multases",
              "$select": "cr40f_multasid,cr40f_id_multa,cr40f_dataparaindicar",
              "$filter": "statecode eq 0 and cr40f_status eq 202410000 and _cr40f_motorista_value eq null and cr40f_dataparaindicar le @{outputs('Limite_multa')}",
              "$top": 150
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Cnh_escalados": { "type": "Query", "runAfter": { "Multas": ["Succeeded"] }, "inputs": { "from": "@outputs('Cnh')?['body/value']", "where": "@contains(body('Ids_motoristas'), toLower(item()?['cr40f_funcionariosid']))" } },
        "Aso_escalados": { "type": "Query", "runAfter": { "Cnh_escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Aso')?['body/value']", "where": "@contains(body('Ids_motoristas'), toLower(item()?['cr40f_funcionariosid']))" } },
        "Docs_escalados": { "type": "Query", "runAfter": { "Aso_escalados": ["Succeeded"] }, "inputs": { "from": "@outputs('Docs')?['body/value']", "where": "@contains(body('Ids_veiculos'), toLower(item()?['_cr40f_veiculo_value']))" } },
        "Total": {
          "type": "Compose", "runAfter": { "Docs_escalados": ["Succeeded"] },
          "inputs": "@add(add(length(body('Cnh_escalados')), length(body('Aso_escalados'))), add(length(body('Docs_escalados')), length(outputs('Multas')?['body/value'])))"
        },
        "Sem_itens": {
          "type": "If", "runAfter": { "Total": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@outputs('Total')", 0 ] } ] },
          "actions": { "Encerrar_sem_itens": { "type": "Terminate", "runAfter": {}, "inputs": { "runStatus": "Succeeded" } } },
          "else": { "actions": {} }
        },
        "Linhas_cnh": { "type": "Select", "runAfter": { "Sem_itens": ["Succeeded"] }, "inputs": { "from": "@body('Cnh_escalados')", "select": "@concat('CNH vencida: ', item()?['new_apelido'], ' (validade ', formatDateTime(item()?['cr40f_validadedacnh'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_aso": { "type": "Select", "runAfter": { "Linhas_cnh": ["Succeeded"] }, "inputs": { "from": "@body('Aso_escalados')", "select": "@concat('ASO vencido: ', item()?['new_apelido'], ' (ASO de ', formatDateTime(item()?['cr40f_datadoaso'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_docs": { "type": "Select", "runAfter": { "Linhas_aso": ["Succeeded"] }, "inputs": { "from": "@body('Docs_escalados')", "select": "@concat('Documento vencido do veículo ', coalesce(item()?['_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue'], ''), ': ', item()?['cr40f_name'], ' (validade ', formatDateTime(item()?['cr40f_validade'], 'dd/MM/yyyy'), ')')" } },
        "Linhas_multas": { "type": "Select", "runAfter": { "Linhas_docs": ["Succeeded"] }, "inputs": { "from": "@outputs('Multas')?['body/value']", "select": "@concat('Multa sem condutor: ', item()?['cr40f_id_multa'], ' (indicar até ', formatDateTime(item()?['cr40f_dataparaindicar'], 'dd/MM/yyyy'), ')')" } },
        "Resumo_html": {
          "type": "Compose", "runAfter": { "Linhas_multas": ["Succeeded"] },
          "inputs": "@concat('<p><b>Pendências da operação para hoje (', formatDateTime(outputs('Hoje'), 'dd/MM'), ')</b></p><ul><li>', join(union(body('Linhas_cnh'), body('Linhas_aso'), body('Linhas_docs'), body('Linhas_multas')), '</li><li>'), '</li></ul>')"
        },
        "Enviar_email": {
          "type": "OpenApiConnection", "runAfter": { "Resumo_html": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
            "parameters": {
              "emailMessage/To": "@parameters('__PARAM_EMAIL__')",
              "emailMessage/Subject": "@concat('[Operação] Pendências de hoje: ', outputs('Total'), if(equals(outputs('Total'), 1), ' item', ' itens'))",
              "emailMessage/Body": "@outputs('Resumo_html')",
              "emailMessage/Importance": "Normal"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    }
  },
  "outputs": {}
}
'@
$definitionText = $definitionText.Replace('__PARAM_EMAIL__', $paramEmail)
if ($definitionText -match '__[A-Z_]+__') { throw "Marcador não substituído na definição: $($Matches[0])" }
$definition = $definitionText | ConvertFrom-Json
$definitionJson = $definition | ConvertTo-Json -Depth 90 -Compress
AssertSemMojibake $definitionJson 'definição do script'
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{ shared_commondataserviceforapps = $dataverse; shared_office365 = $outlook } }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

function Conferir($lido, [string] $texto) {
  $t = $lido.triggers.Dias_uteis_07h
  $r = $t.recurrence
  $a = $lido.actions.Escopo_resumo.actions
  $pa = $a.PSObject.Properties.Name
  $ler = { param($acao) $acao.inputs.parameters }
  $esc = & $ler $a.Escalados
  $cnh = & $ler $a.Cnh
  $aso = & $ler $a.Aso
  $doc = & $ler $a.Docs
  $mul = & $ler $a.Multas
  $mail = $a.Enviar_email
  $checks = [ordered]@{
    'gatilho Recurrence semanal, intervalo 1' = $t.type -eq 'Recurrence' -and $r.frequency -eq 'Week' -and $r.interval -eq 1
    'fuso E. South America Standard Time' = $r.timeZone -ceq 'E. South America Standard Time'
    'hora 7, minuto 0' = (@($r.schedule.hours) -join ',') -eq '7' -and (@($r.schedule.minutes) -join ',') -eq '0'
    'cinco dias úteis' = (@($r.schedule.weekDays) -join ',') -ceq 'Monday,Tuesday,Wednesday,Thursday,Friday'
    'Escalados: três status e a janela de hoje, top 150' = $esc.entityName -ceq 'cr40f_reservadeveculoses' -and $esc.'$filter' -clike '*cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006*' -and $esc.'$filter' -clike '*cr40f_dataehorriodesada ge*' -and $esc.'$filter' -clike '*cr40f_dataehorriodesada lt*' -and $esc.'$top' -eq 150
    'Cnh: motoristas ativos com validade anterior a hoje, top 150' = $cnh.entityName -ceq 'cr40f_funcionarioses' -and $cnh.'$filter' -clike '*cr40f_status eq 0 and cr40f_funcao eq 202410000 and cr40f_validadedacnh lt*' -and $cnh.'$top' -eq 150
    'Aso: motoristas ativos com ASO anterior ao limite de 12 meses, top 150' = $aso.entityName -ceq 'cr40f_funcionarioses' -and $aso.'$filter' -clike '*cr40f_datadoaso lt @{outputs(''Limite_aso'')}*' -and $aso.'$top' -eq 150
    'Docs: situação Vigente, veículo preenchido, validade anterior a hoje, top 150' = $doc.entityName -ceq 'cr40f_documentos' -and $doc.'$filter' -clike '*cr40f_situacao eq 100000000 and _cr40f_veiculo_value ne null and cr40f_validade lt*' -and $doc.'$top' -eq 150
    'Multas: Notificar o Condutor, sem motorista, prazo até o limite de 3 dias, top 150' = $mul.entityName -ceq 'cr40f_multases' -and $mul.'$filter' -clike '*cr40f_status eq 202410000 and _cr40f_motorista_value eq null and cr40f_dataparaindicar le*' -and $mul.'$top' -eq 150
    'Sem_itens encerra com Succeeded quando o total é 0' = $a.Sem_itens.type -eq 'If' -and $a.Sem_itens.actions.Encerrar_sem_itens.type -eq 'Terminate' -and $a.Sem_itens.actions.Encerrar_sem_itens.inputs.runStatus -eq 'Succeeded'
    'Enviar_email: SendEmailV2 com destinatários do parâmetro de ambiente' = $mail.inputs.host.operationId -eq 'SendEmailV2' -and $mail.inputs.parameters.'emailMessage/To' -ceq "@parameters('$paramEmail')"
    'parâmetro de ambiente com o schemaName da variável' = $lido.parameters.$paramEmail.metadata.schemaName -ceq $envVarName
    'sem dado pessoal sensível na definição' = -not ($texto -match '(?i)telefone|celular|cpf|numerodocpf|numerodorg|passageiro')
  }
  $falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
  if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
  $checks.Keys | ForEach-Object { Write-Host "[resumo-diario] ok: $_" }
}

$flows = @(FlowRows)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($SomenteValidar) {
  if (-not $flows.Count) { throw 'Flow ainda não existe no DEV; não há o que validar. Rode sem -SomenteValidar para criá-lo desligado.' }
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
  Conferir $definition $definitionJson
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
  } else { Write-Host '[resumo-diario] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Todo dia útil às 07:00 (America/Sao_Paulo) envia um e-mail à operação com CNH vencida, ASO vencido, documento do veículo vencido (de quem está escalado hoje) e multa sem condutor. Sem itens, não envia.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29

if ($Ativar) {
  if (-not $temValor) { throw "NEEDS_CONTEXT: $envVarName sem valor atual no DEV. O Renan precisa preenchê-lo no maker portal antes de ligar o flow." }
  $estado = Dv GET "workflows($flowId)?`$select=statecode"
  if ($estado.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null }
}

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=statecode,clientdata"
if ($Ativar -and $row.statecode -ne 1) { throw 'Flow não ativou.' }
AssertSemMojibake $row.clientdata 'clientdata gravado'
Conferir (($row.clientdata | ConvertFrom-Json).properties.definition) $row.clientdata
if (-not @((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $flowId").value).Count) { throw 'Flow fora da AppBetinhos.' }
$situacao = if ($row.statecode -eq 1) { 'ATIVO' } else { 'DESLIGADO' }
Write-Output "DEV: '$flowName' $situacao ($flowId), na $solutionName; $envVarName na solução $(if ($temValor) { 'com valor atual' } else { 'SEM valor atual (o Renan preenche no maker portal)' })."
