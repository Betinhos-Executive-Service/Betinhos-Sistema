param(
  [string]$EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com',
  [string]$ConnectionReferenceLogicalName = 'new_sharedcommondataserviceforapps_25a23',
  [string]$OutlookConnectionReferenceLogicalName = 'new_sharedoffice365_f87d5',
  [string]$FlowName = 'Planner | Cobrança diária',
  [string]$WorkflowId = ''
)

$ErrorActionPreference = 'Stop'
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw 'Azure CLI não retornou token para o ambiente Dataverse.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json; charset=utf-8'; Prefer = 'return=representation' }

# O relatório por e-mail é o único lembrete diário de prazo. Avisos históricos permanecem na caixa.
$definition = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": {
    "Recurrence": {
      "type": "Recurrence",
      "recurrence": { "frequency": "Week", "interval": 1, "schedule": { "weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "hours": [8], "minutes": [0] }, "timeZone": "E. South America Standard Time" }
    }
  },
  "actions": {
    "List_open_tasks": {
      "type": "OpenApiConnection",
      "inputs": { "parameters": { "entityName": "cr40f_plannertarefas", "$select": "cr40f_plannertarefaid,cr40f_titulo,cr40f_prazo,cr40f_status,cr40f_prioridade,cr40f_status@OData.Community.Display.V1.FormattedValue,cr40f_prioridade@OData.Community.Display.V1.FormattedValue,_cr40f_cr40f_funcionarioresponsavel_value,_cr40f_equipeplanner_value", "$filter": "statecode eq 0 and cr40f_status ne 100000003 and cr40f_status ne 100000004 and cr40f_prazo ne null", "accept": "application/json;odata.metadata=minimal", "x-ms-page-size": 5000 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
    },
    "For_each_task": {
      "type": "Foreach",
      "foreach": "@outputs('List_open_tasks')?['body/value']",
      "runAfter": { "List_open_tasks": ["Succeeded"] },
      "actions": {
        "Condition_due": {
          "type": "If",
          "expression": { "and": [{ "lessOrEquals": ["@formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd')", "@variables('Today')"] }] },
          "actions": {
            "List_assignees": {
              "type": "OpenApiConnection",
              "inputs": { "parameters": { "entityName": "cr40f_plannertarearesponsavels", "$filter": "_cr40f_tarefa_value eq @{items('For_each_task')?['cr40f_plannertarefaid']}", "accept": "application/json;odata.metadata=minimal" }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
            },
            "For_each_assignee": {
              "type": "Foreach",
              "foreach": "@if(empty(items('For_each_task')?['_cr40f_cr40f_funcionarioresponsavel_value']),json('[]'),createArray(items('For_each_task')?['_cr40f_cr40f_funcionarioresponsavel_value']))",
              "runAfter": { "List_assignees": ["Succeeded"] },
              "actions": {
                "Create_notification_if_missing": {
                  "type": "If",
                  "expression": { "equals": ["@length(outputs('Find_existing_notification')?['body/value'])", 0] },
                  "runAfter": { "Find_existing_notification": ["Succeeded"] },
                  "actions": {
                    "Create_notification": {
                      "type": "OpenApiConnection",
                      "inputs": { "parameters": { "entityName": "cr40f_plannernotificacaos", "item/cr40f_titulo": "@if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'Tarefa vence hoje','Tarefa atrasada')", "item/cr40f_mensagem": "@items('For_each_task')?['cr40f_titulo']", "item/cr40f_tipo": "@if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'due_today','overdue')", "item/cr40f_ocorridoem": "@utcNow()", "item/cr40f_datareferencia": "@variables('Today')", "item/cr40f_chavededupe": "@concat(items('For_each_assignee')?['_cr40f_funcionario_value'],'|',items('For_each_task')?['cr40f_plannertarefaid'],'|',if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'due_today','overdue'),'|',variables('Today'))", "item/cr40f_tarefa@odata.bind": "@concat('/cr40f_plannertarefas(',items('For_each_task')?['cr40f_plannertarefaid'],')')", "item/cr40f_destinatario@odata.bind": "@concat('/cr40f_funcionarioses(',items('For_each_assignee')?['_cr40f_funcionario_value'],')')" }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "CreateRecord", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
                    },
                    "Create_deadline_event": {
                      "type": "OpenApiConnection",
                      "runAfter": { "Create_notification": [ "Succeeded" ] },
                      "inputs": { "parameters": { "entityName": "cr40f_plannertarefaeventos", "item/cr40f_tipo": 100000002, "item/cr40f_descricao": "@if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'Tarefa vence hoje','Tarefa atrasada')", "item/cr40f_campo": "notification:deadline", "item/cr40f_valornovo": "@concat('{\"notificationRecipientIds\":[\"',items('For_each_assignee')?['_cr40f_funcionario_value'],'\"],\"collectionType\":\"',if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'due_today','overdue'),'\"}')", "item/cr40f_ocorridoem": "@utcNow()", "item/cr40f_tarefa@odata.bind": "@concat('/cr40f_plannertarefas(',items('For_each_task')?['cr40f_plannertarefaid'],')')" }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "CreateRecord", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
                    }
                  }
                },
                "Find_existing_notification": {
                  "type": "OpenApiConnection",
                  "inputs": { "parameters": { "entityName": "cr40f_plannernotificacaos", "$filter": "cr40f_chavededupe eq '@{concat(items('For_each_assignee')?['_cr40f_funcionario_value'],'|',items('For_each_task')?['cr40f_plannertarefaid'],'|',if(equals(formatDateTime(items('For_each_task')?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),'due_today','overdue'),'|',variables('Today'))}'", "$top": 1, "accept": "application/json;odata.metadata=minimal" }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
                }
              }
            }
          }
        }
      }
    }
  }
}
'@

$definition = $definition.Replace('new_sharedcommondataserviceforapps_25a23', $ConnectionReferenceLogicalName)
$definitionObject = $definition | ConvertFrom-Json
$mainActions = $definitionObject.actions
$mainActions.PSObject.Properties.Remove('For_each_task')
$definitionObject.actions = [ordered]@{
  Initialize_today = [ordered]@{
    type = 'InitializeVariable'
    inputs = [ordered]@{ variables = @([ordered]@{ name = 'Today'; type = 'string'; value = "@formatDateTime(convertTimeZone(utcNow(),'UTC','E. South America Standard Time'),'yyyy-MM-dd')" }) }
  }
  Scope_Main = [ordered]@{
    type = 'Scope'
    runAfter = [ordered]@{ Initialize_today = @('Succeeded') }
    actions = $mainActions
  }
  Scope_ErrorNotification = [ordered]@{
    type = 'Scope'
    runAfter = [ordered]@{ Scope_Main = @('Failed', 'TimedOut', 'Skipped') }
    actions = [ordered]@{
      Send_Error_Email = [ordered]@{
        type = 'OpenApiConnection'
        inputs = [ordered]@{
          parameters = [ordered]@{
            'emailMessage/To' = 'noreply@betinhos.onmicrosoft.com'
            'emailMessage/From' = 'noreply@betinhos.com.br'
            'emailMessage/Subject' = 'ERRO NO FLUXO - Planner | Cobrança diária'
            'emailMessage/Body' = '<p>Ocorreu um erro no fluxo <strong>Planner | Cobrança diária</strong>.</p><p>Consulte o histórico de execução no Power Automate.</p>'
            'emailMessage/Importance' = 'High'
          }
          host = [ordered]@{
            apiId = '/providers/Microsoft.PowerApps/apis/shared_office365'
            operationId = 'SendEmailV2'
            connectionName = 'shared_office365'
          }
          authentication = '@parameters(''$authentication'')'
        }
      }
    }
  }
}
$digestActions = @'
{
  "List_active_employees": {
    "type": "OpenApiConnection",
    "runAfter": { "List_open_tasks": [ "Succeeded" ] },
    "inputs": { "parameters": { "entityName": "cr40f_funcionarios", "$select": "cr40f_funcionariosid,cr40f_nomecompleto,cr40f_emailbetinhos", "$filter": "statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410001", "x-ms-page-size": 5000 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
  },
  "List_task_team_relations": {
    "type": "OpenApiConnection",
    "runAfter": { "List_active_employees": [ "Succeeded" ] },
    "inputs": { "parameters": { "entityName": "cr40f_plannertarefaequipe", "$select": "_cr40f_tarefa_value,_cr40f_equipe_value", "$filter": "statecode eq 0", "x-ms-page-size": 5000 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
  },
  "List_team_members": {
    "type": "OpenApiConnection",
    "runAfter": { "List_task_team_relations": [ "Succeeded" ] },
    "inputs": { "parameters": { "entityName": "cr40f_plannerequipemembro", "$select": "_cr40f_equipe_value,_cr40f_funcionario_value", "$filter": "statecode eq 0", "x-ms-page-size": 5000 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" }
  },
  "For_each_employee": {
    "type": "Foreach",
    "foreach": "@outputs('List_active_employees')?['body/value']",
    "runAfter": { "List_team_members": [ "Succeeded" ] },
    "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
    "actions": {
      "Compose_employee_id": { "type": "Compose", "inputs": "@items('For_each_employee')?['cr40f_funcionariosid']" },
      "Filter_direct_tasks": { "type": "Query", "runAfter": { "Compose_employee_id": [ "Succeeded" ] }, "inputs": { "from": "@outputs('List_open_tasks')?['body/value']", "where": "@and(equals(item()?['_cr40f_cr40f_funcionarioresponsavel_value'],outputs('Compose_employee_id')),or(less(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),equals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today'))))" } },
      "Select_employee_teams": { "type": "Query", "runAfter": { "Compose_employee_id": [ "Succeeded" ] }, "inputs": { "from": "@outputs('List_team_members')?['body/value']", "where": "@equals(item()?['_cr40f_funcionario_value'],outputs('Compose_employee_id'))" } },
      "Filter_task_team_relations": { "type": "Query", "runAfter": { "Select_employee_teams": [ "Succeeded" ] }, "inputs": { "from": "@outputs('List_task_team_relations')?['body/value']", "where": "@contains(string(body('Select_employee_teams')),item()?['_cr40f_equipe_value'])" } },
      "Filter_team_tasks": { "type": "Query", "runAfter": { "Filter_task_team_relations": [ "Succeeded" ] }, "inputs": { "from": "@outputs('List_open_tasks')?['body/value']", "where": "@and(contains(string(body('Filter_task_team_relations')),item()?['cr40f_plannertarefaid']),or(less(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),equals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today'))))" } },
      "Compose_report_tasks": { "type": "Compose", "runAfter": { "Filter_direct_tasks": [ "Succeeded" ], "Filter_team_tasks": [ "Succeeded" ] }, "inputs": "@union(body('Filter_direct_tasks'),body('Filter_team_tasks'))" },
      "Condition_has_tasks": {
        "type": "If",
        "runAfter": { "Compose_report_tasks": [ "Succeeded" ] },
        "expression": { "and": [{ "greater": [ "@length(outputs('Compose_report_tasks'))", 0 ] }, { "not": { "equals": [ "@empty(items('For_each_employee')?['cr40f_emailbetinhos'])", true ] } }] },
        "actions": {
          "Compose_report_kind": { "type": "Compose", "inputs": "ResumoDiario" },
          "List_existing_digest": { "type": "OpenApiConnection", "runAfter": { "Compose_report_kind": [ "Succeeded" ] }, "inputs": { "parameters": { "entityName": "cr40f_plannerdisparos", "$filter": "cr40f_chaveidempotente eq '@{concat(outputs('Compose_employee_id'),'|',variables('Today'),'|',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'ResumoSemanal',''),'|Email')}'", "$top": 1 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "ListRecords", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" } },
          "Condition_not_sent": {
            "type": "If", "runAfter": { "List_existing_digest": [ "Succeeded" ] }, "expression": { "equals": [ "@length(outputs('List_existing_digest')?['body/value'])", 0 ] },
            "actions": {
              "Select_task_html": { "type": "Select", "inputs": { "from": "@outputs('Compose_report_tasks')", "select": "@concat('<tr><td style=\"padding:12px 0;border-bottom:1px solid #eef1f5\"><a href=\"',concat('https://',uriHost(outputs('List_open_tasks')?['body/@odata.context']),'/main.aspx?pagetype=entityrecord&etn=cr40f_plannertarefa&id=',item()?['cr40f_plannertarefaid']),'\" style=\"color:#14213d;font-weight:700;text-decoration:none\">',item()?['cr40f_titulo'],'</a><br><span style=\"color:#667085;font-size:13px\">Prazo: ',formatDateTime(item()?['cr40f_prazo'],'dd/MM/yyyy'),' · Status: ',coalesce(item()?['cr40f_status@OData.Community.Display.V1.FormattedValue'],item()?['cr40f_status']),' · Prioridade: ',coalesce(item()?['cr40f_prioridade@OData.Community.Display.V1.FormattedValue'],item()?['cr40f_prioridade']),'</span></td></tr>')" } },
              "Send_digest_email": { "type": "OpenApiConnection", "runAfter": { "Select_task_html": [ "Succeeded" ] }, "inputs": { "parameters": { "emailMessage/To": "@items('For_each_employee')?['cr40f_emailbetinhos']", "emailMessage/From": "noreply@betinhos.com.br", "emailMessage/Subject": "@if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),concat('[Planner] Sua semana — ',formatDateTime(variables('Today'),'dd/MM'),' a ',formatDateTime(addDays(variables('Today'),4),'dd/MM')),concat('[Planner] Suas tarefas de hoje — ',formatDateTime(variables('Today'),'dd/MM'))) ", "emailMessage/Body": "@concat('<!DOCTYPE html><html lang=\"pt-BR\"><body style=\"font-family:Segoe UI,Arial,sans-serif;background:#f5f7fa;color:#172033\"><table role=\"presentation\" width=\"600\" align=\"center\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fff;padding:32px\"><tr><td><p style=\"font-weight:700;letter-spacing:1.8px\">BETINHOS / PLANNER</p><h1>',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Sua semana','Suas tarefas de hoje'),'</h1><p>',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Relatório semanal com prioridades e indicadores.','Resumo das suas pendências operacionais.'),'</p><p>',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Indicadores: total da semana · atrasadas · em andamento · aguardando · prioridades alta/urgente.','Contadores: atrasadas · vencem hoje.'),'</p><p>',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Atrasadas · Prioridades da semana · Demais tarefas da semana','Atrasadas · Vencem hoje'),'</p><table role=\"presentation\" width=\"100%\">',join(body('Select_task_html'),''),'</table><p style=\"margin-top:28px\"><a href=\"',concat('https://',uriHost(outputs('List_open_tasks')?['body/@odata.context']),'/main.aspx'),'\" style=\"display:inline-block;padding:14px 22px;background:#14213d;color:#fff;text-decoration:none\">Abrir meu Planner</a></p></td></tr></table></body></html>')", "emailMessage/Importance": "Normal" }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "operationId": "SendEmailV2", "connectionName": "shared_office365" }, "authentication": "@parameters('$authentication')" } },
              "Create_digest_dispatch": { "type": "OpenApiConnection", "runAfter": { "Send_digest_email": [ "Succeeded" ] }, "inputs": { "parameters": { "entityName": "cr40f_plannerdisparos", "item/cr40f_name": "@concat(outputs('Compose_report_kind'),' | ',items('For_each_employee')?['cr40f_emailbetinhos'])", "item/cr40f_canal": 100000001, "item/cr40f_status": 100000001, "item/cr40f_statustexto": "Enviado", "item/cr40f_destinatariotexto": "@items('For_each_employee')?['cr40f_emailbetinhos']", "item/cr40f_chaveidempotente": "@concat(outputs('Compose_employee_id'),'|',variables('Today'),'|',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'ResumoSemanal',''),'|Email')", "item/cr40f_enviadoem": "@utcNow()", "item/cr40f_tentativa": 1 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "CreateRecord", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" } }
            }
          }
        }
      }
    }
  },
  "For_each_missing_email": {
    "type": "Foreach",
    "foreach": "@filter(outputs('List_active_employees')?['body/value'],empty(item()?['cr40f_emailbetinhos']))",
    "runAfter": { "For_each_employee": [ "Succeeded" ] },
    "actions": {
      "Condition_No_Operational_Email": {
        "type": "If",
        "expression": { "equals": [ "@empty(items('For_each_missing_email')?['cr40f_emailbetinhos'])", true ] },
        "actions": {
          "Create_no_address_dispatch": { "type": "OpenApiConnection", "inputs": { "parameters": { "entityName": "cr40f_plannerdisparos", "item/cr40f_name": "@concat('Resumo | sem endereço | ',items('For_each_missing_email')?['cr40f_nomecompleto'])", "item/cr40f_canal": 100000001, "item/cr40f_status": 100000003, "item/cr40f_statustexto": "Sem endereço de e-mail", "item/cr40f_destinatariotexto": "", "item/cr40f_chaveidempotente": "@concat(items('For_each_missing_email')?['cr40f_funcionariosid'],'|',variables('Today'),'|SemEndereco|Email')", "item/cr40f_tentativa": 0 }, "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "operationId": "CreateRecord", "connectionName": "shared_commondataserviceforapps" }, "authentication": "@parameters('$authentication')" } }
        }
      }
    }
  }
}
'@ | ConvertFrom-Json

$digestConditionActions = $digestActions.For_each_employee.actions.Condition_has_tasks.actions.Condition_not_sent.actions
$digestActions.PSObject.Properties.Remove('For_each_missing_email')
$digestActions.List_active_employees.inputs.parameters.entityName = 'cr40f_funcionarioses'
$digestActions.List_task_team_relations.inputs.parameters.entityName = 'cr40f_plannertarefaequipes'
$digestActions.List_team_members.inputs.parameters.entityName = 'cr40f_plannerequipemembros'
foreach ($listAction in @($digestActions.List_active_employees, $digestActions.List_task_team_relations, $digestActions.List_team_members)) {
  $listAction.inputs.parameters.PSObject.Properties.Remove('x-ms-page-size')
}
$digestActions.List_active_employees.inputs.parameters.'$select' = 'cr40f_funcionariosid,cr40f_nomecompleto,cr40f_emailbetinhos'
$mainActions.List_open_tasks.inputs.parameters.'$select' = 'cr40f_plannertarefaid,cr40f_titulo,cr40f_prazo,cr40f_status,cr40f_prioridade,_cr40f_cr40f_funcionarioresponsavel_value,_cr40f_equipeplanner_value'
$mainActions.List_open_tasks.inputs.parameters.PSObject.Properties.Remove('x-ms-page-size')
$assigneeList = $digestActions.List_task_team_relations | ConvertTo-Json -Depth 20 | ConvertFrom-Json
$assigneeList.runAfter = [ordered]@{ List_team_members = @('Succeeded') }
$assigneeList.inputs.parameters.entityName = 'cr40f_plannertarearesponsavels'
$assigneeList.inputs.parameters.'$select' = '_cr40f_tarefa_value,_cr40f_funcionario_value'
$digestActions | Add-Member -NotePropertyName List_assignee_relations -NotePropertyValue $assigneeList
$digestActions.For_each_employee.runAfter = [ordered]@{ List_assignee_relations = @('Succeeded') }
$employeeActions = $digestActions.For_each_employee.actions
$employeeActions | Add-Member -NotePropertyName Filter_employee_assignees -NotePropertyValue ([ordered]@{
  type = 'Query'
  runAfter = [ordered]@{ Compose_employee_id = @('Succeeded') }
  inputs = [ordered]@{ from = "@outputs('List_assignee_relations')?['body/value']"; where = "@equals(item()?['_cr40f_funcionario_value'],outputs('Compose_employee_id'))" }
})
$employeeActions | Add-Member -NotePropertyName Filter_assigned_tasks -NotePropertyValue ([ordered]@{
  type = 'Query'
  runAfter = [ordered]@{ Filter_employee_assignees = @('Succeeded') }
  inputs = [ordered]@{ from = "@outputs('List_open_tasks')?['body/value']"; where = "@and(contains(string(body('Filter_employee_assignees')),item()?['cr40f_plannertarefaid']),or(less(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),equals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today'))))" }
})
$employeeActions.Compose_report_tasks.runAfter = [ordered]@{ Filter_direct_tasks = @('Succeeded'); Filter_team_tasks = @('Succeeded'); Filter_assigned_tasks = @('Succeeded') }
$employeeActions.Compose_report_tasks.inputs = "@union(union(body('Filter_direct_tasks'),body('Filter_team_tasks')),body('Filter_assigned_tasks'))"
$htmlTemplate = $digestConditionActions.Select_task_html | ConvertTo-Json -Depth 20 | ConvertFrom-Json
$htmlTemplate.inputs.select = @'
@concat('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 0 8px;background-color:#ffffff;border:1px solid #dce5ed;border-left:4px solid __SECTION_COLOR__;border-radius:8px"><tr><td style="padding:14px 16px"><a href="',concat('https://',uriHost(outputs('List_open_tasks')?['body/@odata.context']),'/main.aspx?appname=cr40f_ModelDrivenBetinhos&pagetype=webresource&webresourceName=new_TelaPlanner.html&data=taskId%3D',item()?['cr40f_plannertarefaid']),'" style="color:#17324b;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;line-height:21px;text-decoration:none">',replace(replace(replace(coalesce(item()?['cr40f_titulo'],'Sem título'),'&','&amp;'),'<','&lt;'),'>','&gt;'),'</a><br><span style="color:#526579;font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:24px">Prazo ',formatDateTime(item()?['cr40f_prazo'],'dd/MM/yyyy'),' &nbsp;&middot;&nbsp; </span><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-family:Segoe UI,Arial,sans-serif;font-size:11px;font-weight:700;background-color:',if(equals(item()?['cr40f_prioridade'],100000003),'#fef0ef',if(equals(item()?['cr40f_prioridade'],100000002),'#fff2e5',if(equals(item()?['cr40f_prioridade'],100000000),'#edf2f6','#eaf3fc'))),';color:',if(equals(item()?['cr40f_prioridade'],100000003),'#b42318',if(equals(item()?['cr40f_prioridade'],100000002),'#a64108',if(equals(item()?['cr40f_prioridade'],100000000),'#475467','#155789'))),';">',if(equals(item()?['cr40f_prioridade'],100000003),'Urgente',if(equals(item()?['cr40f_prioridade'],100000002),'Alta',if(equals(item()?['cr40f_prioridade'],100000000),'Baixa','Média'))),'</span></td></tr></table>')
'@
$digestConditionActions.PSObject.Properties.Remove('Select_task_html')
foreach ($section in @(
  @{ Name = 'overdue'; Color = '#b42318'; Where = "@less(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today'))" },
  @{ Name = 'today'; Color = '#1465a7'; Where = "@equals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today'))" },
  @{ Name = 'week'; Color = '#6e47a4'; Where = "@and(greaterOrEquals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),variables('Today')),lessOrEquals(formatDateTime(item()?['cr40f_prazo'],'yyyy-MM-dd'),addDays(variables('Today'),4)))" }
)) {
  $filterName = "Filter_$($section.Name)_tasks"
  $htmlName = "Select_$($section.Name)_html"
  $digestConditionActions | Add-Member -NotePropertyName $filterName -NotePropertyValue ([ordered]@{
    type = 'Query'
    inputs = [ordered]@{ from = "@outputs('Compose_report_tasks')"; where = $section.Where }
  })
  $htmlAction = $htmlTemplate | ConvertTo-Json -Depth 20 | ConvertFrom-Json
  $htmlAction.inputs.from = "@body('$filterName')"
  $htmlAction.inputs.select = $htmlAction.inputs.select.Replace('__SECTION_COLOR__', $section.Color)
  $htmlAction | Add-Member -NotePropertyName runAfter -NotePropertyValue ([ordered]@{ $filterName = @('Succeeded') })
  $digestConditionActions | Add-Member -NotePropertyName $htmlName -NotePropertyValue $htmlAction
}
$sendDigest = $digestConditionActions.Send_digest_email
$sendDigest.runAfter = [ordered]@{ Select_overdue_html = @('Succeeded'); Select_today_html = @('Succeeded'); Select_week_html = @('Succeeded') }
$sendDigest.inputs.parameters.'emailMessage/Subject' = "@if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),concat('[Planner] Relatório da semana — ',formatDateTime(variables('Today'),'dd/MM')),concat('[Planner] Atrasadas e tarefas de hoje — ',formatDateTime(variables('Today'),'dd/MM')))"
$sendDigest.inputs.parameters.'emailMessage/Body' = @'
@concat(
'<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background-color:#f2f6f9;color:#17324b;font-family:Segoe UI,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#f2f6f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;background-color:#ffffff;border:1px solid #dce5ed;border-radius:12px"><tr><td style="padding:28px 30px;background-color:#142e45;border-radius:11px 11px 0 0"><p style="margin:0 0 16px;color:#82ddd1;font-size:11px;font-weight:700;letter-spacing:2px">BETINHOS / PLANNER</p><h1 style="margin:0;color:#ffffff;font-size:26px;line-height:32px;font-weight:700">',
if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Sua semana em foco','Seu dia em foco'),
'</h1><p style="margin:9px 0 0;color:#d5e4ed;font-size:14px;line-height:21px">',
if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Prioridades da semana e pendências anteriores.','Pendências anteriores e tarefas com prazo hoje.'),
'</p><p style="margin:16px 0 0;color:#a8c3d4;font-size:12px">',formatDateTime(variables('Today'),'dd/MM/yyyy'),
'</p></td></tr><tr><td style="padding:24px 30px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td width="50%" valign="top" style="padding:0 5px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef0ef;border:1px solid #f6d7d3;border-radius:8px"><tr><td style="padding:13px 15px"><p style="margin:0;color:#9e241b;font-size:12px;font-weight:700">ATRASADAS</p><p style="margin:5px 0 0;color:#9e241b;font-size:26px;line-height:28px;font-weight:700">',string(length(body('Filter_overdue_tasks'))),
'</p></td></tr></table></td><td width="50%" valign="top" style="padding:0 0 0 5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:',
if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#f2edfa','#eaf3fc'),
';border:1px solid ',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#dfd0f0','#c9e0f5'),
';border-radius:8px"><tr><td style="padding:13px 15px"><p style="margin:0;color:',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#613b93','#155789'),
';font-size:12px;font-weight:700">',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'ESTA SEMANA','VENCEM HOJE'),
'</p><p style="margin:5px 0 0;color:',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#613b93','#155789'),
';font-size:26px;line-height:28px;font-weight:700">',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),string(length(body('Filter_week_tasks'))),string(length(body('Filter_today_tasks')))),
'</p></td></tr></table></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:collapse"><tr><td style="padding:0 0 10px;border-bottom:2px solid #f2d5d1;color:#9e241b;font-size:16px;font-weight:700">Atrasadas <span style="font-size:13px">(',string(length(body('Filter_overdue_tasks'))),')</span></td></tr></table><div style="height:12px;line-height:12px">&nbsp;</div>',
if(empty(body('Filter_overdue_tasks')),'<p style="margin:0 0 20px;color:#526579;font-size:14px">Nenhuma tarefa atrasada.</p>',join(body('Select_overdue_html'),'')),
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse"><tr><td style="padding:0 0 10px;border-bottom:2px solid ',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#dfd0f0','#c9e0f5'),
';color:',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'#613b93','#155789'),
';font-size:16px;font-weight:700">',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),'Esta semana','Vencem hoje'),
' <span style="font-size:13px">(',if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),string(length(body('Filter_week_tasks'))),string(length(body('Filter_today_tasks')))),
')</span></td></tr></table><div style="height:12px;line-height:12px">&nbsp;</div>',
if(equals(outputs('Compose_report_kind'),'ResumoSemanal'),if(empty(body('Filter_week_tasks')),'<p style="margin:0;color:#526579;font-size:14px">Nenhuma tarefa com prazo nesta semana.</p>',join(body('Select_week_html'),'')),if(empty(body('Filter_today_tasks')),'<p style="margin:0;color:#526579;font-size:14px">Nenhuma tarefa vence hoje.</p>',join(body('Select_today_html'),''))),
'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:collapse"><tr><td bgcolor="#087e78" style="background-color:#087e78;border-radius:7px"><a href="',concat('https://',uriHost(outputs('List_open_tasks')?['body/@odata.context']),'/main.aspx?appname=cr40f_ModelDrivenBetinhos&pagetype=webresource&webresourceName=new_TelaPlanner.html'),
'" style="display:inline-block;padding:13px 20px;color:#ffffff!important;font-size:14px;font-weight:700;text-decoration:none">Abrir meu Planner &rarr;</a></td></tr></table></td></tr><tr><td style="padding:17px 30px;border-top:1px solid #e6edf2;color:#66798b;font-size:12px;line-height:18px">Resumo automático de tarefas. Consulte o Planner para ver o status atualizado.</td></tr></table></td></tr></table></body></html>')
'@
$sendDigest.inputs.parameters.'emailMessage/Body' = $sendDigest.inputs.parameters.'emailMessage/Body' -replace '\r?\n\s*', ''
$digestConditionActions.Create_digest_dispatch.inputs.parameters | Add-Member -NotePropertyName 'item/cr40f_Destinatario@odata.bind' -NotePropertyValue "@concat('/cr40f_funcionarioses(',outputs('Compose_employee_id'),')')"

$digestActions.PSObject.Properties | ForEach-Object { $mainActions | Add-Member -MemberType NoteProperty -Name $_.Name -Value $_.Value -Force }
$definition = $definitionObject | ConvertTo-Json -Depth 100 -Compress
$clientData = @{ properties = @{ connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ConnectionReferenceLogicalName }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $OutlookConnectionReferenceLogicalName }; api = @{ name = 'shared_office365' } }
}; definition = ($definition | ConvertFrom-Json) }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 100 -Compress
$payload = @{ category = 5; name = $FlowName; type = 1; primaryentity = 'none'; clientdata = $clientData } | ConvertTo-Json -Depth 100
$filter = [uri]::EscapeDataString("name eq '$($FlowName.Replace("'", "''"))'")
$existing = (Invoke-RestMethod -Uri "$EnvironmentUrl/api/data/v9.2/workflows?`$select=workflowid&`$filter=$filter" -Headers $headers).value | Select-Object -First 1
if ($existing) { $WorkflowId = $existing.workflowid }
$method = if ($WorkflowId) { 'Patch' } else { 'Post' }
$uri = if ($WorkflowId) { "$EnvironmentUrl/api/data/v9.2/workflows($WorkflowId)" } else { "$EnvironmentUrl/api/data/v9.2/workflows" }
$body = if ($WorkflowId) { @{ clientdata = $clientData } | ConvertTo-Json -Depth 100 } else { $payload }
if ($WorkflowId) {
  Invoke-RestMethod -Uri $uri -Headers $headers -Method Patch -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
} else {
  $created = Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body))
  $WorkflowId = $created.workflowid
}
Write-Output "Flow atualizado: $WorkflowId (o estado de ativação não foi alterado)"
