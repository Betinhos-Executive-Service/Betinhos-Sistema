param(
  [string]$EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com',
  [string]$DataverseConnectionReferenceLogicalName = 'new_sharedcommondataserviceforapps_25a23',
  [string]$OutlookConnectionReferenceLogicalName = 'new_sharedoffice365_f87d5',
  [string]$FlowName = 'Planner | Notificação automática por e-mail',
  [string]$WorkflowId = ''
)

$ErrorActionPreference = 'Stop'
$FlowName = 'Planner | Notifica' + [char]0x00E7 + [char]0x00E3 + 'o autom' + [char]0x00E1 + 'tica por e-mail'

$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw 'Azure CLI não retornou token para o ambiente Dataverse.' }
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'Content-Type' = 'application/json; charset=utf-8'
  Prefer = 'return=representation'
}

function ConvertTo-Utf8JsonBytes([object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 100 -Compress
  return ,([Text.Encoding]::UTF8.GetBytes($json))
}

$definition = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" }
  },
  "triggers": {
    "When_a_row_is_added": {
      "type": "OpenApiConnectionWebhook",
      "inputs": {
        "parameters": {
          "subscriptionRequest/message": 1,
          "subscriptionRequest/entityname": "cr40f_plannertarefaevento",
          "subscriptionRequest/scope": 4,
          "subscriptionRequest/filterexpression": "cr40f_campo eq 'notification:overdue_manual'"
        },
        "host": {
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
          "operationId": "SubscribeWebhookTrigger",
          "connectionName": "shared_commondataserviceforapps"
        },
        "authentication": "@parameters('$authentication')"
      }
    }
  },
  "actions": {
    "Compose_Context": {
      "type": "Compose",
      "inputs": "@json(coalesce(triggerOutputs()?['body/cr40f_valornovo'], '{}'))"
    },
    "Compose_Type": {
      "type": "Compose",
      "inputs": "@if(equals(outputs('Compose_Context')?['collectionType'], 'manual_overdue'), 'overdue', coalesce(outputs('Compose_Context')?['collectionType'], replace(triggerOutputs()?['body/cr40f_campo'], 'notification:', ''), 'update'))",
      "runAfter": { "Compose_Context": [ "Succeeded" ] }
    },
    "Compose_Type_Label": {
      "type": "Compose",
      "inputs": "@if(equals(outputs('Compose_Type'), 'assignment'), concat('Nova tarefa atribu', decodeUriComponent('%C3%AD'), 'da'), if(equals(outputs('Compose_Type'), 'mention'), concat('Voc', decodeUriComponent('%C3%AA'), ' foi mencionado'), if(equals(outputs('Compose_Type'), 'overdue'), concat('Cobran', decodeUriComponent('%C3%A7'), 'a de tarefa atrasada'), if(equals(outputs('Compose_Type'), 'deadline'), 'Prazo da tarefa alterado', if(equals(outputs('Compose_Type'), 'status'), 'Status da tarefa alterado', concat('Atualiza', decodeUriComponent('%C3%A7'), decodeUriComponent('%C3%A3'), 'o'))))))",
      "runAfter": { "Compose_Type": [ "Succeeded" ] }
    },
    "Compose_Message": {
      "type": "Compose",
      "inputs": "@replace(replace(replace(coalesce(triggerOutputs()?['body/cr40f_descricao'], concat('Sem descri', decodeUriComponent('%C3%A7'), decodeUriComponent('%C3%A3'), 'o.')), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')",
      "runAfter": { "Compose_Type_Label": [ "Succeeded" ] }
    },
    "Compose_Recipients": {
      "type": "Compose",
      "inputs": "@union(coalesce(outputs('Compose_Context')?['notificationRecipientIds'], json('[]')), coalesce(outputs('Compose_Context')?['mentionedEmployeeIds'], json('[]')), coalesce(outputs('Compose_Context')?['waitingTargetIds'], json('[]')), coalesce(outputs('Compose_Context')?['previousAssigneeIds'], json('[]')), coalesce(outputs('Compose_Context')?['assigneeIds'], json('[]')), if(empty(outputs('Compose_Context')?['creatorEmployeeId']), json('[]'), createArray(outputs('Compose_Context')?['creatorEmployeeId'])))",
      "runAfter": { "Compose_Message": [ "Succeeded" ] }
    },
    "For_each_recipient": {
      "type": "Foreach",
      "foreach": "@if(equals(outputs('Compose_Context')?['sourceType'],'quote'),json('[]'),outputs('Compose_Recipients'))",
      "runAfter": { "Compose_Recipients": [ "Succeeded" ] },
      "actions": {
        "Condition_NotAuthor": {
          "type": "If",
          "expression": {
            "and": [
              { "not": { "equals": [ "@toLower(item())", "@toLower(outputs('Compose_Context')?['actorEmployeeId'])" ] } }
            ]
          },
          "actions": {
            "Get_recipient": {
              "type": "OpenApiConnection",
              "inputs": {
                "parameters": {
                  "entityName": "cr40f_funcionarioses",
                  "recordId": "@item()",
                  "$select": "cr40f_emailbetinhos",
                  "accept": "application/json;odata.metadata=minimal"
                },
                "host": {
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                  "operationId": "GetItem",
                  "connectionName": "shared_commondataserviceforapps"
                },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Condition_has_email": {
              "type": "If",
              "runAfter": { "Get_recipient": [ "Succeeded" ] },
              "expression": {
                "and": [ { "not": { "equals": [ "@empty(outputs('Get_recipient')?['body/cr40f_emailbetinhos'])", true ] } } ]
              },
              "actions": {
                "List_existing_email_dispatch": {
                  "type": "OpenApiConnection",
                  "inputs": {
                    "parameters": {
                      "entityName": "cr40f_plannerdisparos",
                      "$filter": "cr40f_chaveidempotente eq '@{concat(triggerOutputs()?['body/cr40f_plannertarefaeventoid'], '|', item(), '|', outputs('Compose_Type'), '|Email')}'",
                      "$top": 1,
                      "accept": "application/json;odata.metadata=minimal"
                    },
                    "host": {
                      "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                      "operationId": "ListRecords",
                      "connectionName": "shared_commondataserviceforapps"
                    },
                    "authentication": "@parameters('$authentication')"
                  }
                },
                "Condition_New": {
                  "type": "If",
                  "runAfter": { "List_existing_email_dispatch": [ "Succeeded" ] },
                  "expression": {
                    "and": [ { "equals": [ "@length(outputs('List_existing_email_dispatch')?['body/value'])", 0 ] } ]
                  },
                  "actions": {
                    "Compose_Cta_Url": {
                      "type": "Compose",
                      "inputs": "@if(empty(outputs('Compose_Context')?['plannerBaseUrl']), '', concat(coalesce(outputs('Compose_Context')?['plannerAppUrl'], concat(outputs('Compose_Context')?['plannerBaseUrl'], '/main.aspx')), if(contains(coalesce(outputs('Compose_Context')?['plannerAppUrl'], ''), '?'), '&', '?'), 'pagetype=webresource&webresourceName=new_TelaPlanner.html&data=taskId%3D', triggerOutputs()?['body/_cr40f_tarefa_value']))"
                    },
                    "Send_Email": {
                      "type": "OpenApiConnection",
                      "runAfter": { "Compose_Cta_Url": [ "Succeeded" ] },
                      "inputs": {
                        "parameters": {
                          "emailMessage/To": "@outputs('Get_recipient')?['body/cr40f_emailbetinhos']",
                          "emailMessage/From": "noreply@betinhos.com.br",
                          "emailMessage/Subject": "@concat('[Planner] ', outputs('Compose_Type_Label'))",
                          "emailMessage/Body": "@concat('<!DOCTYPE html><html lang=&quot;pt-BR&quot;><head><meta charset=&quot;utf-8&quot;></head><body style=&quot;margin:0;padding:0;background-color:#f5f7fa;color:#172033;font-family:Segoe UI,Arial,sans-serif;-webkit-text-size-adjust:100%&quot;><span style=&quot;display:none!important;font-size:1px;color:#f5f7fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden&quot;>Nova atualiza', decodeUriComponent('%C3%A7'), decodeUriComponent('%C3%A3'), 'o em uma tarefa do Planner.</span><table role=&quot;presentation&quot; width=&quot;100%&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;background-color:#f5f7fa&quot;><tr><td align=&quot;center&quot; style=&quot;padding:32px 16px&quot;><table role=&quot;presentation&quot; width=&quot;100%&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;max-width:600px;background-color:#ffffff;border:1px solid #e7ebf0;border-radius:16px&quot;><tr><td style=&quot;padding:28px 32px 24px;border-bottom:1px solid #eef1f5&quot;><p style=&quot;margin:0;color:#14213d;font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.8px&quot;>BETINHOS <span style=&quot;color:#c89b3c&quot;>/</span> PLANNER</p></td></tr><tr><td style=&quot;padding:36px 32px 32px&quot;><p style=&quot;margin:0 0 12px;color:#667085;font-size:13px;line-height:20px;font-weight:600;text-transform:uppercase;letter-spacing:.6px&quot;>Atualiza', decodeUriComponent('%C3%A7'), decodeUriComponent('%C3%A3'), 'o de tarefa</p><h1 style=&quot;margin:0 0 16px;color:#14213d;font-size:28px;line-height:36px;font-weight:700;letter-spacing:-.4px&quot;>', outputs('Compose_Type_Label'), '</h1><p style=&quot;margin:0;color:#475467;font-size:16px;line-height:26px&quot;>', outputs('Compose_Message'), '</p><table role=&quot;presentation&quot; width=&quot;100%&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;margin-top:28px;background-color:#f8fafc;border-left:3px solid #c89b3c&quot;><tr><td style=&quot;padding:16px 18px&quot;><p style=&quot;margin:0;color:#667085;font-size:13px;line-height:21px&quot;>Abra a tarefa no Planner para ver os detalhes e continuar a opera', decodeUriComponent('%C3%A7'), decodeUriComponent('%C3%A3'), 'o.</p></td></tr></table>', if(empty(outputs('Compose_Context')?['plannerBaseUrl']), '<p style=&quot;margin:28px 0 0;color:#667085;font-size:13px;line-height:20px&quot;>Abra a tarefa diretamente no Planner para continuar.</p>', concat('<table role=&quot;presentation&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;margin-top:28px&quot;><tr><td bgcolor=&quot;#14213d&quot; style=&quot;border-radius:9px&quot;><a href=&quot;', outputs('Compose_Context')?['plannerBaseUrl'], '/WebResources/new_TelaPlanner.html?data=taskId%3D', triggerOutputs()?['body/_cr40f_tarefa_value'], '&quot; style=&quot;display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;line-height:20px;font-weight:700;text-decoration:none&quot;>Abrir tarefa no Planner &rarr;</a></td></tr></table>')), '</td></tr><tr><td style=&quot;padding:20px 32px 28px;border-top:1px solid #eef1f5&quot;><p style=&quot;margin:0;color:#98a2b3;font-size:12px;line-height:18px&quot;>Voc', decodeUriComponent('%C3%AA'), ' recebeu este e-mail porque participa desta tarefa no Planner.</p></td></tr></table></td></tr></table></body></html>')",
                          "emailMessage/Importance": "Normal"
                        },
                        "host": {
                          "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                          "operationId": "SendEmailV2",
                          "connectionName": "shared_office365"
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    },
                    "Create_dispatch_sent": {
                      "type": "OpenApiConnection",
                      "runAfter": { "Send_Email": [ "Succeeded" ] },
                      "inputs": {
                        "parameters": {
                          "entityName": "cr40f_plannerdisparos",
                          "item/cr40f_name": "@concat('Email | ', outputs('Get_recipient')?['body/cr40f_emailbetinhos'])",
                          "item/cr40f_Destinatario@odata.bind": "@concat('/cr40f_funcionarioses(', item(), ')')",
                          "item/cr40f_destinatariotexto": "@outputs('Get_recipient')?['body/cr40f_emailbetinhos']",
                          "item/cr40f_canal": 100000001,
                          "item/cr40f_categoria": 100000000,
                          "item/cr40f_chaveidempotente": "@concat(triggerOutputs()?['body/cr40f_plannertarefaeventoid'], '|', item(), '|', outputs('Compose_Type'), '|Email')",
                          "item/cr40f_status": 100000001,
                          "item/cr40f_statustexto": "Enviado",
                          "item/cr40f_tentativa": 1,
                          "item/cr40f_enviadoem": "@utcNow()",
                          "item/cr40f_identificadorexterno": "@coalesce(outputs('Send_Email')?['body/id'], '')"
                        },
                        "host": {
                          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                          "operationId": "CreateRecord",
                          "connectionName": "shared_commondataserviceforapps"
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    },
                    "Create_dispatch_failed": {
                      "type": "OpenApiConnection",
                      "runAfter": { "Send_Email": [ "Failed", "TimedOut" ] },
                      "inputs": {
                        "parameters": {
                          "entityName": "cr40f_plannerdisparos",
                          "item/cr40f_name": "@concat('Email falhou | ', outputs('Get_recipient')?['body/cr40f_emailbetinhos'])",
                          "item/cr40f_Destinatario@odata.bind": "@concat('/cr40f_funcionarioses(', item(), ')')",
                          "item/cr40f_destinatariotexto": "@outputs('Get_recipient')?['body/cr40f_emailbetinhos']",
                          "item/cr40f_canal": 100000001,
                          "item/cr40f_categoria": 100000000,
                          "item/cr40f_chaveidempotente": "@concat(triggerOutputs()?['body/cr40f_plannertarefaeventoid'], '|', item(), '|', outputs('Compose_Type'), '|Email')",
                          "item/cr40f_status": 100000002,
                          "item/cr40f_statustexto": "Falha",
                          "item/cr40f_tentativa": 1,
                          "item/cr40f_erro": "@string(outputs('Send_Email'))"
                        },
                        "host": {
                          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                          "operationId": "CreateRecord",
                          "connectionName": "shared_commondataserviceforapps"
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    }
                  }
                }
              },
              "else": {
                "actions": {
                  "Create_dispatch_without_email": {
                    "type": "OpenApiConnection",
                    "inputs": {
                      "parameters": {
                        "entityName": "cr40f_plannerdisparos",
                        "item/cr40f_name": "@concat('Email sem endereço | ', item())",
                        "item/cr40f_Destinatario@odata.bind": "@concat('/cr40f_funcionarioses(', item(), ')')",
                        "item/cr40f_destinatariotexto": "@item()",
                        "item/cr40f_canal": 100000001,
                        "item/cr40f_categoria": 100000000,
                        "item/cr40f_chaveidempotente": "@concat(triggerOutputs()?['body/cr40f_plannertarefaeventoid'], '|', item(), '|', outputs('Compose_Type'), '|Email')",
                        "item/cr40f_status": 100000003,
                        "item/cr40f_statustexto": "Sem endereço de e-mail",
                        "item/cr40f_tentativa": 0
                      },
                      "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                        "operationId": "CreateRecord",
                        "connectionName": "shared_commondataserviceforapps"
                      },
                      "authentication": "@parameters('$authentication')"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "outputs": {}
}
'@

$definition = $definition.Replace('cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;', 'cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;border:0;border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;')
$definition = $definition.Replace('width=&quot;100%&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;max-width:600px;', 'width=&quot;600&quot; cellpadding=&quot;0&quot; cellspacing=&quot;0&quot; border=&quot;0&quot; style=&quot;width:100%;max-width:600px;')
$definition = $definition.Replace('mso-table-rspace:0pt;max-width:600px;background-color:', 'mso-table-rspace:0pt;width:600px;max-width:600px;background-color:')
$definition = $definition.Replace('color:#ffffff;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;', 'color:#ffffff!important;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;')
$definition = $definition.Replace('>Abrir tarefa no Planner &rarr;</a>', '><font color=&quot;#ffffff&quot; style=&quot;color:#ffffff!important;&quot;>Abrir tarefa no Planner &rarr;</font></a>')
$definition = $definition.Replace('outputs(''Compose_Context'')?[''plannerBaseUrl''], ''/WebResources/new_TelaPlanner.html?data=taskId%3D'', triggerOutputs()?[''body/_cr40f_tarefa_value'']', 'replace(outputs(''Compose_Cta_Url''), ''&'', ''&amp;'')')
$definition = $definition.Replace('&quot;', '\"')
$definitionObject = $definition | ConvertFrom-Json
$mainActions = $definitionObject.actions
$definitionObject.actions = [ordered]@{
  Scope_Main = [ordered]@{
    type = 'Scope'
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
            'emailMessage/Subject' = 'ERRO NO FLUXO - Planner | Notificação automática por e-mail'
            'emailMessage/Body' = '<p>Ocorreu um erro no fluxo <strong>Planner | Notificação automática por e-mail</strong>.</p><p>Consulte o histórico de execução no Power Automate.</p>'
            'emailMessage/Importance' = 'High'
          }
          host = [ordered]@{
            apiId = '/providers/Microsoft.PowerApps/apis/shared_office365'
            operationId = 'SendEmailV2'
            connectionName = 'shared_office365'
          }
          authentication = "@parameters('$authentication')"
        }
      }
    }
  }
}
$definition = $definitionObject | ConvertTo-Json -Depth 100 -Compress
$definition = $definition.Replace('background-color:#f8fafc;border-left:3px solid #c89b3c', 'background-color:#e6f2f0;border-left:5px solid #0d645d')
$definition = $definition.Replace('color:#14213d;font-size:28px', 'color:#075b55;font-size:28px')

$clientData = @{
  properties = @{
    connectionReferences = @{
      shared_commondataserviceforapps = @{
        runtimeSource = 'embedded'
        connection = @{ connectionReferenceLogicalName = $DataverseConnectionReferenceLogicalName }
        api = @{ name = 'shared_commondataserviceforapps' }
      }
      shared_office365 = @{
        runtimeSource = 'embedded'
        connection = @{ connectionReferenceLogicalName = $OutlookConnectionReferenceLogicalName }
        api = @{ name = 'shared_office365' }
      }
    }
    definition = ($definition | ConvertFrom-Json)
  }
  schemaVersion = '1.0.0.0'
} | ConvertTo-Json -Depth 100 -Compress

$payload = @{ category = 5; name = $FlowName; type = 1; primaryentity = 'none'; clientdata = $clientData } | ConvertTo-Json -Depth 100
$activeWorkflowQueryUri = "$EnvironmentUrl/api/data/v9.2/workflows?`$select=workflowid,name,statecode,statuscode&`$filter=statecode eq 1"
$inactiveWorkflowQueryUri = "$EnvironmentUrl/api/data/v9.2/workflows?`$select=workflowid,name,statecode,statuscode&`$filter=statecode eq 0"
$activeFlows = @((Invoke-RestMethod -Uri $activeWorkflowQueryUri -Headers $headers).value)
$inactiveFlows = @((Invoke-RestMethod -Uri $inactiveWorkflowQueryUri -Headers $headers).value)
$flowNameMatches = { $_.name -eq $FlowName -or $_.name -like 'Planner | Notifica*autom*tica por e-mail' }
$existingFlows = @($activeFlows | Where-Object $flowNameMatches)
$existingFlows += @($inactiveFlows | Where-Object $flowNameMatches)
if (-not $WorkflowId) {
  $target = $existingFlows | Where-Object { [int]$_.statecode -eq 1 } | Select-Object -First 1
  if (-not $target) { $target = $existingFlows | Select-Object -First 1 }
  if ($target) { $WorkflowId = $target.workflowid }
}

if ($WorkflowId) {
  $targetUri = "$EnvironmentUrl/api/data/v9.2/workflows($WorkflowId)"
  Invoke-RestMethod -Uri $targetUri -Headers $headers -Method Patch -Body (@{ statecode = 0; statuscode = 1 } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Uri $targetUri -Headers $headers -Method Patch -Body (@{ clientdata = $clientData } | ConvertTo-Json -Depth 100) | Out-Null
} else {
  $created = Invoke-RestMethod -Uri "$EnvironmentUrl/api/data/v9.2/workflows" -Headers $headers -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  $WorkflowId = $created.workflowid
  $targetUri = "$EnvironmentUrl/api/data/v9.2/workflows($WorkflowId)"
}

Invoke-RestMethod -Uri $targetUri -Headers $headers -Method Patch -Body (ConvertTo-Utf8JsonBytes @{ name = $FlowName }) | Out-Null

Invoke-RestMethod -Uri $targetUri -Headers $headers -Method Patch -Body (@{ statecode = 1; statuscode = 2 } | ConvertTo-Json) | Out-Null

foreach ($flow in $activeFlows | Where-Object { ($_.name -eq $FlowName -or $_.name -like 'Planner | Notifica*autom*tica por e-mail') -and $_.workflowid -ne $WorkflowId }) {
  Invoke-RestMethod -Uri "$EnvironmentUrl/api/data/v9.2/workflows($($flow.workflowid))" -Headers $headers -Method Patch -Body (@{ statecode = 0; statuscode = 1 } | ConvertTo-Json) | Out-Null
}

Write-Output "Flow ativo: $WorkflowId"
Write-Output "Envio automático: destinatários do evento, sem o autor da ação"
