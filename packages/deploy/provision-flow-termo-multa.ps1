param(
  [switch] $Apply,
  [string] $ReferenciaDataverse = 'new_sharedcommondataserviceforapps_5696d',
  [string] $ReferenciaOutlook = 'new_sharedoffice365_f87d5'
)

# Cria (ou atualiza) no DEV os dois flows do termo de multa com assinatura eletrônica e os inclui na solução do .env:
#   "Termo de multa | Cópia ao motorista" (LIGADO): quando new_termomulta fica Assinado com PDF e sem cópia enviada,
#     baixa new_pdf, envia por e-mail ao motorista (cr40f_emailmicrosoft, senão cr40f_emailbetinhos) com o hash no corpo
#     e grava new_copiaenviadaem/new_copiacanal. Se o e-mail falhar, o termo não muda.
#   "Termo de multa | Expirar pendentes" (DESLIGADO): diário 07:00 (America/Sao_Paulo), termos Pendente com
#     new_enviadoem há mais de 7 dias → Custom API new_ExpirarTermoMulta (new_TermoId). A Custom API vem da Task B2
#     (repo dos plugins); o flow fica em rascunho até ela existir no DEV. Ligue depois pelo Power Automate.
#   "Termo de multa | Lembrete diário" (ligado só se a Custom API new_LembrarTermoMulta existir): 07:00, termos Pendente
#     com new_enviadoem até o fim do dia D-3 (calendário de São Paulo) e new_ultimolembreteem vazio → new_LembrarTermoMulta (new_TermoId).
#   "Termo de multa | Aviso ao gestor" (LIGADO): quando new_status vira Assinado ou Contestado, e-mail a quem enviou o termo (new_enviadopor)
#     com placa, motorista, desfecho, data e link da multa no Sistema Betinhos. Brief v2: docs/superpowers/specs/2026-10-23-termo-multa-ux-v2-brief.md.
# Spec: docs/superpowers/specs/2026-10-22-termo-multa-assinatura-design.md. Sem -Apply roda em DRY RUN.
# Configuração do .env da raiz do monorepo (ou variáveis de ambiente); token via `az login` no DEV. Idempotente.
# Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Write-Step([string] $Message) { Write-Host "[flow-termo-multa] $Message" }

function Read-DotEnv([string] $Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  return $values
}
$dotEnv = Read-DotEnv (Join-Path $root '.env')
function Get-Setting([string] $Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value) -and $dotEnv.ContainsKey($Name)) { $value = $dotEnv[$Name] }
  return $value
}

$environmentUrl = (Get-Setting 'DV_ENVIRONMENT_URL')
if ([string]::IsNullOrWhiteSpace($environmentUrl)) { throw 'DV_ENVIRONMENT_URL ausente no .env.' }
$environmentUrl = $environmentUrl.TrimEnd('/')
$environmentHost = ([Uri] $environmentUrl).Host.ToLowerInvariant()
if ($environmentHost -eq 'orgf261ae8e.crm2.dynamics.com') { throw "$environmentHost é o PROD: este script nunca roda em PROD." }
$blockedHosts = @((Get-Setting 'DV_BLOCKED_HOSTS') -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if ($blockedHosts.Count -eq 0) { throw 'DV_BLOCKED_HOSTS ausente. Informe o host de PROD.' }
if ($blockedHosts -contains $environmentHost) { throw "$environmentHost está bloqueado (PROD exige pedido explícito)." }
$solutionName = Get-Setting 'DV_SOLUTION'
if ([string]::IsNullOrWhiteSpace($solutionName)) { throw 'DV_SOLUTION ausente no .env.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Step "$Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  $bytes = (Invoke-WebRequest @params).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

Write-Step "ambiente $environmentHost, solução $solutionName, $(if ($Apply) { 'APLICANDO' } else { 'DRY RUN (use -Apply para gravar)' })"
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw "Solução $solutionName ausente ou ambígua." }
$solutionId = $solution[0].solutionid

# Pré-requisitos: tabelas (entity sets lidos da metadata) e connection references.
$setTermo = (Dv GET "EntityDefinitions(LogicalName='new_termomulta')?`$select=EntitySetName").EntitySetName
$setFuncionarios = (Dv GET "EntityDefinitions(LogicalName='cr40f_funcionarios')?`$select=EntitySetName").EntitySetName
$setMultas = (Dv GET "EntityDefinitions(LogicalName='cr40f_multas')?`$select=EntitySetName").EntitySetName
if (-not $setTermo -or -not $setFuncionarios -or -not $setMultas) { throw 'Tabelas new_termomulta/cr40f_funcionarios ausentes no DEV (rode provision-termo-multa.ps1 -Apply).' }
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
foreach ($par in @(@($ReferenciaDataverse, 'shared_commondataserviceforapps'), @($ReferenciaOutlook, 'shared_office365'))) {
  if (@($refs | Where-Object { $_.connectionreferencelogicalname -eq $par[0] -and $_.connectorid -like "*/$($par[1])" }).Count -ne 1) {
    throw "Connection reference '$($par[0])' ($($par[1])) não encontrada."
  }
}
$customApi = 'new_ExpirarTermoMulta'
$temCustomApi = @((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").value).Count -eq 1
Write-Step "Custom API $customApi no DEV: $(if ($temCustomApi) { 'presente' } else { 'AUSENTE (Task B2); o flow de expiração mantém o estado atual (desligado se criado agora)' })"

$temLembrar = @((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq 'new_LembrarTermoMulta'").value).Count -eq 1
Write-Step "Custom API new_LembrarTermoMulta no DEV: $(if ($temLembrar) { 'presente' } else { 'AUSENTE; o flow de lembrete mantém o estado atual (desligado se criado agora)' })"

$dv = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
$outlook = '/providers/Microsoft.PowerApps/apis/shared_office365'

$copia = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": {
    "Termo_assinado": {
      "type": "OpenApiConnectionWebhook",
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger" },
        "parameters": {
          "subscriptionRequest/message": 4,
          "subscriptionRequest/entityname": "new_termomulta",
          "subscriptionRequest/scope": 4,
          "subscriptionRequest/filteringattributes": "new_status,new_pdf",
          "subscriptionRequest/filterexpression": "new_status eq 100000001 and new_copiaenviadaem eq null"
        },
        "authentication": "@parameters('$authentication')"
      },
      "runtimeConfiguration": { "concurrency": { "runs": 1 } }
    }
  },
  "actions": {
    "Termo": {
      "type": "OpenApiConnection", "runAfter": {},
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem" },
        "parameters": { "entityName": "__SET_TERMO__", "recordId": "@triggerOutputs()?['body/new_termomultaid']", "$select": "new_name,new_status,new_hashpdf,new_copiaenviadaem,_new_motorista_value" },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Pronto_para_copia": {
      "type": "If", "runAfter": { "Termo": ["Succeeded"] },
      "expression": { "and": [ { "equals": ["@outputs('Termo')?['body/new_status']", 100000001] }, { "equals": ["@empty(outputs('Termo')?['body/new_copiaenviadaem'])", true] } ] },
      "actions": {
        "Motorista": {
          "type": "OpenApiConnection", "runAfter": {},
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem" },
            "parameters": { "entityName": "__SET_FUNCIONARIOS__", "recordId": "@outputs('Termo')?['body/_new_motorista_value']", "$select": "cr40f_emailmicrosoft,cr40f_emailbetinhos" },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Destinatario": {
          "type": "Compose", "runAfter": { "Motorista": ["Succeeded"] },
          "inputs": "@trim(if(empty(trim(coalesce(outputs('Motorista')?['body/cr40f_emailmicrosoft'], ''))), coalesce(outputs('Motorista')?['body/cr40f_emailbetinhos'], ''), outputs('Motorista')?['body/cr40f_emailmicrosoft']))"
        },
        "Tem_email": {
          "type": "If", "runAfter": { "Destinatario": ["Succeeded"] },
          "expression": { "and": [ { "equals": ["@empty(outputs('Destinatario'))", false] } ] },
          "actions": {
            "Baixar_PDF": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetEntityFileImageFieldContent" },
                "parameters": { "entityName": "__SET_TERMO__", "recordId": "@triggerOutputs()?['body/new_termomultaid']", "fileImageFieldName": "new_pdf" },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Nome_anexo": {
              "type": "Compose", "runAfter": { "Baixar_PDF": ["Succeeded"] },
              "inputs": "@concat('Termo-', replace(replace(if(startsWith(coalesce(outputs('Termo')?['body/new_name'], ''), 'TM-'), substring(outputs('Termo')?['body/new_name'], 3), coalesce(outputs('Termo')?['body/new_name'], 'multa')), '/', '-'), ' ', ''), '.pdf')"
            },
            "Enviar_copia": {
              "type": "OpenApiConnection", "runAfter": { "Nome_anexo": ["Succeeded"] },
              "inputs": {
                "host": { "apiId": "__OUTLOOK__", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
                "parameters": {
                  "emailMessage/To": "@{outputs('Destinatario')}",
                  "emailMessage/Subject": "Cópia do seu termo de multa assinado",
                  "emailMessage/Body": "<p>Olá,</p><p>Segue em anexo a cópia do termo de responsabilidade de multa que você assinou eletronicamente no App Motoristas.</p><p>Código de verificação do documento (SHA-256): <b>@{coalesce(outputs('Termo')?['body/new_hashpdf'], 'não informado')}</b></p><p>Guarde este e-mail. Em caso de dúvida, procure o departamento pessoal da Betinhos.</p>",
                  "emailMessage/Attachments": [ { "Name": "@{outputs('Nome_anexo')}", "ContentBytes": "@body('Baixar_PDF')" } ],
                  "emailMessage/Importance": "Normal"
                },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Registrar_copia": {
              "type": "OpenApiConnection", "runAfter": { "Enviar_copia": ["Succeeded"] },
              "inputs": {
                "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                "parameters": { "entityName": "__SET_TERMO__", "recordId": "@triggerOutputs()?['body/new_termomultaid']", "item/new_copiaenviadaem": "@utcNow()", "item/new_copiacanal": "E-mail" },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "else": {
            "actions": {
              "Sem_email": { "type": "Terminate", "runAfter": {}, "inputs": { "runStatus": "Failed", "runError": { "code": "SemEmail", "message": "Motorista sem e-mail (cr40f_emailmicrosoft/cr40f_emailbetinhos); termo não alterado." } } }
            }
          }
        }
      },
      "else": { "actions": {} }
    }
  }
}
'@

$expirar = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": {
    "Todo_dia_7h": {
      "type": "Recurrence",
      "recurrence": { "frequency": "Day", "interval": 1, "timeZone": "E. South America Standard Time", "startTime": "2026-10-23T07:00:00", "schedule": { "hours": ["7"], "minutes": [0] } }
    }
  },
  "actions": {
    "Pendentes_vencidos": {
      "type": "OpenApiConnection", "runAfter": {},
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
        "parameters": { "entityName": "__SET_TERMO__", "$select": "new_termomultaid", "$filter": "new_status eq 100000000 and new_enviadoem lt @{convertToUtc(addDays(startOfDay(convertFromUtc(utcNow(), 'E. South America Standard Time')), -7), 'E. South America Standard Time')}" },
        "authentication": "@parameters('$authentication')"
      },
      "runtimeConfiguration": { "paginationPolicy": { "minimumItemCount": 5000 } }
    },
    "Expirar_cada": {
      "type": "Foreach", "foreach": "@outputs('Pendentes_vencidos')?['body/value']", "runAfter": { "Pendentes_vencidos": ["Succeeded"] },
      "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
      "actions": {
        "Expirar": {
          "type": "OpenApiConnection", "runAfter": {},
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "PerformUnboundAction" },
            "parameters": { "actionName": "new_ExpirarTermoMulta", "item/new_TermoId": "@{items('Expirar_cada')?['new_termomultaid']}" },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    }
  }
}
'@

$lembrar = $expirar.Replace('Pendentes_vencidos', 'Pendentes_sem_lembrete').Replace('Expirar_cada', 'Lembrar_cada').Replace('"Expirar"', '"Lembrar"').Replace('new_ExpirarTermoMulta', 'new_LembrarTermoMulta').Replace("new_enviadoem lt @{convertToUtc(addDays(startOfDay(convertFromUtc(utcNow(), 'E. South America Standard Time')), -7), 'E. South America Standard Time')}", "new_enviadoem lt @{convertToUtc(addDays(startOfDay(convertFromUtc(utcNow(), 'E. South America Standard Time')), -2), 'E. South America Standard Time')} and new_ultimolembreteem eq null")
if ($lembrar -notmatch 'new_ultimolembreteem eq null') { throw 'Filtro do lembrete não montado.' }

$aviso = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": { "$authentication": { "defaultValue": {}, "type": "SecureObject" }, "$connections": { "defaultValue": {}, "type": "Object" } },
  "triggers": {
    "Termo_resolvido": {
      "type": "OpenApiConnectionWebhook",
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger" },
        "parameters": {
          "subscriptionRequest/message": 3,
          "subscriptionRequest/entityname": "new_termomulta",
          "subscriptionRequest/scope": 4,
          "subscriptionRequest/filteringattributes": "new_status",
          "subscriptionRequest/filterexpression": "(new_status eq 100000001 or new_status eq 100000002)"
        },
        "authentication": "@parameters('$authentication')"
      }
    }
  },
  "actions": {
    "Termo": {
      "type": "OpenApiConnection", "runAfter": {},
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem" },
        "parameters": { "entityName": "__SET_TERMO__", "recordId": "@triggerOutputs()?['body/new_termomultaid']", "$select": "new_name,new_status,new_assinadoem,modifiedon,new_motivocontestacao,_new_multa_value,_new_motorista_value,_new_enviadopor_value" },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Multa": {
      "type": "OpenApiConnection", "runAfter": { "Termo": ["Succeeded"] },
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem" },
        "parameters": { "entityName": "__SET_MULTAS__", "recordId": "@outputs('Termo')?['body/_new_multa_value']", "$select": "_cr40f_placa_value" },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Criador": {
      "type": "OpenApiConnection", "runAfter": { "Multa": ["Succeeded"] },
      "inputs": {
        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem" },
        "parameters": { "entityName": "systemusers", "recordId": "@outputs('Termo')?['body/_new_enviadopor_value']", "$select": "internalemailaddress,fullname" },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Desfecho": {
      "type": "Compose", "runAfter": { "Criador": ["Succeeded"] },
      "inputs": "@if(equals(outputs('Termo')?['body/new_status'], 100000001), 'Assinado', 'Contestado')"
    },
    "Quando": {
      "type": "Compose", "runAfter": { "Desfecho": ["Succeeded"] },
      "inputs": "@formatDateTime(convertFromUtc(coalesce(outputs('Termo')?['body/new_assinadoem'], outputs('Termo')?['body/modifiedon']), 'E. South America Standard Time'), 'dd/MM/yyyy HH:mm')"
    },
    "Tem_email": {
      "type": "If", "runAfter": { "Quando": ["Succeeded"] },
      "expression": { "and": [ { "equals": ["@empty(trim(coalesce(outputs('Criador')?['body/internalemailaddress'], '')))", false] } ] },
      "actions": {
        "Avisar_gestor": {
          "type": "OpenApiConnection", "runAfter": {},
          "inputs": {
            "host": { "apiId": "__OUTLOOK__", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
            "parameters": {
              "emailMessage/To": "@{outputs('Criador')?['body/internalemailaddress']}",
              "emailMessage/Subject": "Termo de multa @{toLower(outputs('Desfecho'))}: @{coalesce(outputs('Multa')?['body/_cr40f_placa_value@OData.Community.Display.V1.FormattedValue'], 'sem placa')} · @{coalesce(outputs('Termo')?['body/_new_motorista_value@OData.Community.Display.V1.FormattedValue'], 'motorista')}",
              "emailMessage/Body": "<p>Olá,</p><p>O termo de multa que você enviou foi <b>@{toLower(outputs('Desfecho'))}</b> pelo motorista.</p><ul><li><b>Placa:</b> @{coalesce(outputs('Multa')?['body/_cr40f_placa_value@OData.Community.Display.V1.FormattedValue'], '—')}</li><li><b>Motorista:</b> @{coalesce(outputs('Termo')?['body/_new_motorista_value@OData.Community.Display.V1.FormattedValue'], '—')}</li><li><b>Desfecho:</b> @{outputs('Desfecho')}</li><li><b>Data:</b> @{outputs('Quando')}</li>@{if(equals(outputs('Desfecho'), 'Contestado'), concat('<li><b>Motivo:</b> ', coalesce(outputs('Termo')?['body/new_motivocontestacao'], '—'), '</li>'), '')}</ul><p><a href=\"__URL__/WebResources/cr40f_SistemaBetinhos.html#/frota-multas?registro=multa:@{outputs('Termo')?['body/_new_multa_value']}\">Abrir a multa no Sistema Betinhos</a></p>@{if(equals(outputs('Desfecho'), 'Contestado'), '<p>Converse pessoalmente com o motorista sobre a contestação.</p>', '')}",
              "emailMessage/Importance": "Normal"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      },
      "else": {
        "actions": {
          "Sem_email": { "type": "Terminate", "runAfter": {}, "inputs": { "runStatus": "Failed", "runError": { "code": "SemEmail", "message": "Termo sem new_enviadopor ou usuário sem internalemailaddress." } } }
        }
      }
    }
  }
}
'@

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaOutlook }; api = @{ name = 'shared_office365' } }
}
function ClientData([string] $json, [string[]] $conectores) {
  $raw = $json.Replace('__DV__', $dv).Replace('__OUTLOOK__', $outlook).Replace('__SET_TERMO__', $setTermo).Replace('__SET_FUNCIONARIOS__', $setFuncionarios).Replace('__SET_MULTAS__', $setMultas).Replace('__URL__', $environmentUrl)
  if ($raw -match '__[A-Z_]+__') { throw "Token não substituído: $($Matches[0])" }
  $refsDoFlow = @{}; foreach ($c in $conectores) { $refsDoFlow[$c] = $connectionReferences[$c] }
  return (@{ properties = @{ definition = ($raw | ConvertFrom-Json); connectionReferences = $refsDoFlow }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress)
}

function Include([string] $id) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = 29; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Flow $id não entrou na $solutionName." }
}

# $ligado = $true liga o flow; $false mantém o estado anterior (desligado só quando o flow é criado agora).
function Ensure-Flow([string] $nome, [string] $descricao, [string] $clientData, [bool] $ligado) {
  $flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$nome' and category eq 5").value)
  if ($flows.Count -gt 1) { throw "Flow '$nome' duplicado no DEV." }
  $anterior = if ($flows.Count) { [int]$flows[0].statecode } else { 0 }
  $alvo = if ($ligado) { 1 } else { $anterior }
  if (-not $Apply) { Write-Output "DRY RUN: '$nome' seria $(if ($flows.Count) { 'atualizado' } else { 'criado' }) $(if ($alvo -eq 1) { 'LIGADO' } else { 'DESLIGADO (rascunho)' })."; return }
  if ($flows.Count) {
    $flowId = $flows[0].workflowid
    $norm = { param($o) ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) }
    $g = $flows[0].clientdata | ConvertFrom-Json; $n = $clientData | ConvertFrom-Json
    $mudou = (& $norm $g.properties.definition) -ne (& $norm $n.properties.definition) -or (& $norm $g.properties.connectionReferences) -ne (& $norm $n.properties.connectionReferences)
    if ($mudou) {
      if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
      Dv PATCH "workflows($flowId)" @{ clientdata = $clientData; description = $descricao } | Out-Null
    }
    Write-Output "'$nome': definição $(if ($mudou) { 'atualizada' } else { 'já igual' })."
  } else {
    Dv POST workflows @{ name = $nome; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = $descricao } | Out-Null
    $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$nome' and category eq 5").value)[0].workflowid
    Write-Output "'$nome': criado ($flowId)."
  }
  Include $flowId
  $atual = (Dv GET "workflows($flowId)?`$select=statecode").statecode
  if ($atual -ne $alvo) { Dv PATCH "workflows($flowId)" @{ statecode = $alvo } | Out-Null; $atual = (Dv GET "workflows($flowId)?`$select=statecode").statecode }
  if ($atual -ne $alvo) { throw "'$nome' não ficou com statecode $alvo. Confira as conexões no Power Automate." }
  Write-Output "DEV: '$nome' $(if ($alvo -eq 1) { 'LIGADO' } else { 'DESLIGADO (rascunho)' }) na $solutionName."
}

Ensure-Flow 'Termo de multa | Cópia ao motorista' 'Quando o termo de multa fica Assinado, envia a cópia em PDF ao motorista por e-mail e registra new_copiaenviadaem/new_copiacanal. Falha no e-mail não altera o termo.' (ClientData $copia @('shared_commondataserviceforapps', 'shared_office365')) $true
# Decisão do controlador (22/10/2026): expiração só pela Custom API new_ExpirarTermoMulta (respeita a trava do plugin),
# nunca por update direto do status. Nasce DESLIGADO; com a Custom API no DEV o script o liga; sem ela, mantém o estado atual.
Ensure-Flow 'Termo de multa | Expirar pendentes' 'Todo dia às 07:00 expira, pela Custom API new_ExpirarTermoMulta, os termos Pendentes enviados antes do início do dia D-7 em São Paulo. Criado desligado; o script liga quando a Custom API existir (Task B2).' (ClientData $expirar @('shared_commondataserviceforapps')) $temCustomApi
if (-not $temCustomApi) { Write-Output "ATENÇÃO: '$customApi' ainda não existe no DEV. Depois da Task B2, rode este script de novo para ligar 'Termo de multa | Expirar pendentes'." }
Ensure-Flow 'Termo de multa | Lembrete diário' 'Todo dia às 07:00 lembra, pela Custom API new_LembrarTermoMulta, os termos Pendentes enviados há 3 dias ou mais e ainda sem lembrete. Criado desligado; o script liga quando a Custom API existir.' (ClientData $lembrar @('shared_commondataserviceforapps')) $temLembrar
if (-not $temLembrar) { Write-Output "ATENÇÃO: 'new_LembrarTermoMulta' ainda não existe no DEV. Depois de criá-la, rode este script de novo para ligar 'Termo de multa | Lembrete diário'." }
Ensure-Flow 'Termo de multa | Aviso ao gestor' 'Quando o termo de multa fica Assinado ou Contestado, envia e-mail a quem enviou o termo (new_enviadopor) com placa, motorista, desfecho, data e link da multa no Sistema Betinhos.' (ClientData $aviso @('shared_commondataserviceforapps', 'shared_office365')) $true
