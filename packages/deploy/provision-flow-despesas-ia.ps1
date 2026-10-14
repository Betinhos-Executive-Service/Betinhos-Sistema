# Somente DEV. Cria (ou atualiza) o flow "Flow Despesas | Análise IA" e a variável de ambiente new_AnthropicApiKey
# (só a definição, sem valor) na solução AppBetinhos, e ativa o flow.
#
# O flow roda quando a despesa do App Motoristas fica com o comprovante completo (cr40f_statusanexo = Completo):
# marca a análise como Processando, monta o contexto (até 3 comprovantes do SharePoint, OS do motorista no dia,
# possíveis duplicatas por valor e data, referência de valores da categoria), chama a API do Claude com saída
# estruturada e grava a decisão. As travas técnicas são as mesmas de analisarMensagem (packages/despesas-ia/src/resposta.ts),
# com as mesmas mensagens. Qualquer falha no escopo de análise grava cr40f_iastatusanalise = Erro e o motivo em
# cr40f_iamotivos, sem tocar em cr40f_statusoperacional.
#
# Constantes (modelo, max_tokens, effort, system prompt, prefixo da mensagem e schema) vêm de
# packages/despesas-ia/dist/constantes.json. Gere antes: pnpm --filter @betinhos/despesas-ia constantes
# O valor da chave (new_AnthropicApiKey) é preenchido pelo Renan no maker portal do DEV; este script nunca cria nem lê o valor.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-despesas-ia.ps1 -Restaurar <arquivo de backup>
# Requer `az login` com acesso ao DEV.
param([string] $Restaurar = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Despesas | Análise IA'
$envVarName = 'new_AnthropicApiKey'
$envVarDisplay = 'Anthropic API Key'
$paramKey = "$envVarDisplay ($envVarName)"
$dataverseFlow = 'Flow Comprovantes Despesas Assincrono | App Motoristas'
$sharePointFlow = 'Flow - Consultar Arquivos Sharepoint'
$siteUrl = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$libraryId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$triggerFilter = 'cr40f_statusanexo eq 100000002 and cr40f_origem eq 100000000 and (cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000)'
$constantesPath = Join-Path $PSScriptRoot '../despesas-ia/dist/constantes.json'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[despesas-ia] $Method $($Path.Split('?')[0])"
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
  $file = Join-Path $backupDir ("Flow-Despesas-Analise-IA-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[despesas-ia] backup: $file"
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
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Escopo_analise) { throw 'O arquivo não é um backup deste flow.' }
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

# Constantes do pacote @betinhos/despesas-ia. Strings com @ seriam lidas como expressão pelo Logic Apps: recusa.
if (-not (Test-Path $constantesPath)) { throw 'constantes.json ausente: rode pnpm --filter @betinhos/despesas-ia constantes.' }
$constantesText = [IO.File]::ReadAllText((Resolve-Path $constantesPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
if ($constantesText.Contains('@')) { throw 'constantes.json contém @; escape antes de embutir no flow.' }
AssertSemMojibake $constantesText 'constantes.json'
$const = $constantesText | ConvertFrom-Json
foreach ($campo in 'modelo', 'maxTokens', 'effort', 'systemPrompt', 'prefixoUsuario', 'schema') { if ($null -eq $const.$campo) { throw "constantes.json sem $campo." } }

# Variável da chave: só a definição (String, sem valor padrão). O valor fica no ambiente, preenchido pelo Renan.
$envDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid,defaultvalue&`$filter=schemaname eq '$envVarName'").value)
if (-not $envDefs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $envVarName; displayname = $envVarDisplay; type = 100000000; description = 'Chave da API do Claude (workspace Despesas) usada pelo Flow Despesas | Análise IA. Valor preenchido só no ambiente.' } | Out-Null
  $envDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid,defaultvalue&`$filter=schemaname eq '$envVarName'").value)
}
if ($envDefs.Count -ne 1) { throw "Variável $envVarName ausente ou duplicada." }
if ($envDefs[0].defaultvalue) { throw "A variável $envVarName tem valor padrão; ele iria no export da solução. Remova o valor padrão." }
Include $envDefs[0].environmentvariabledefinitionid 380
# O Power Automate só ativa o flow quando a variável tem valor no ambiente. Sem valor, o flow fica gravado e desligado.
$envId = $envDefs[0].environmentvariabledefinitionid
$temValor = [bool]@((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $envId").value).Count

# Connection references: Dataverse do flow de comprovantes; SharePoint do flow de consulta do Planner.
$dvSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$dataverseFlow' and category eq 5").value)
if ($dvSource.Count -ne 1) { throw 'Flow de referência do Dataverse ausente no DEV.' }
$dataverse = ($dvSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_commondataserviceforapps
if (-not $dataverse.connection.connectionReferenceLogicalName) { throw 'Connection reference do Dataverse ausente.' }
$spSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$sharePointFlow' and category eq 5").value)
if ($spSource.Count -ne 1) { throw 'Flow de referência do SharePoint ausente no DEV.' }
$sharepoint = ($spSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_sharepointonline
if (-not $sharepoint.connection.connectionReferenceLogicalName) { throw 'Connection reference do SharePoint ausente.' }

# Travas: Terminate encerraria a execução inteira e o Tratar_erro não rodaria. Cada trava grava o motivo na variável
# Motivo_erro e falha de propósito (int() do texto), o que faz o Escopo_analise falhar e o Tratar_erro gravar o motivo.
$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "__PARAM_KEY__": { "defaultValue": "", "type": "String", "metadata": { "schemaName": "__ENV_VAR__" } }
  },
  "triggers": {
    "Quando_comprovante_completo": {
      "type": "OpenApiConnectionWebhook",
      "inputs": {
        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger" },
        "parameters": {
          "subscriptionRequest/message": 4,
          "subscriptionRequest/entityname": "cr40f_despesaoperacional",
          "subscriptionRequest/scope": 4,
          "subscriptionRequest/filteringattributes": "cr40f_statusanexo",
          "subscriptionRequest/filterexpression": "__TRIGGER_FILTER__"
        },
        "authentication": "@parameters('$authentication')"
      },
      "runtimeConfiguration": { "concurrency": { "runs": 1 } }
    }
  },
  "actions": {
    "Iniciar_motivo_erro": { "type": "InitializeVariable", "runAfter": {}, "inputs": { "variables": [ { "name": "Motivo_erro", "type": "string", "value": "" } ] } },
    "Iniciar_conteudo": { "type": "InitializeVariable", "runAfter": { "Iniciar_motivo_erro": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Conteudo_mensagem", "type": "array", "value": [] } ] } },
    "Marcar_processando": {
      "type": "OpenApiConnection", "runAfter": { "Iniciar_conteudo": ["Succeeded"] },
      "inputs": {
        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
        "parameters": { "entityName": "cr40f_despesaoperacionals", "recordId": "@triggerOutputs()?['body/cr40f_despesaoperacionalid']", "item/cr40f_iastatusanalise": 100000001 },
        "authentication": "@parameters('$authentication')"
      }
    },
    "Escopo_analise": {
      "type": "Scope", "runAfter": { "Marcar_processando": ["Succeeded"] },
      "actions": {
        "Dia_do_gasto": { "type": "Compose", "runAfter": {}, "inputs": "@convertTimeZone(triggerOutputs()?['body/cr40f_datagasto'], 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')" },
        "Tipos_por_extensao": { "type": "Compose", "runAfter": { "Dia_do_gasto": ["Succeeded"] }, "inputs": { "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "pdf": "application/pdf" } },
        "Decisoes_validas": { "type": "Compose", "runAfter": { "Tipos_por_extensao": ["Succeeded"] }, "inputs": "__DECISOES__" },
        "Comprovantes": {
          "type": "OpenApiConnection", "runAfter": { "Decisoes_validas": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_anexodespesaoperacionals",
              "$select": "cr40f_anexodespesaoperacionalid,cr40f_driveitemid,cr40f_mimetype,cr40f_nomearquivo,cr40f_urlsharepoint,cr40f_sharelink,cr40f_ordem",
              "$filter": "_cr40f_despesa_value eq @{triggerOutputs()?['body/cr40f_despesaoperacionalid']} and cr40f_tipo eq 100000000 and cr40f_status eq 100000001",
              "$orderby": "cr40f_ordem asc",
              "$top": 3
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Sem_comprovante": {
          "type": "If", "runAfter": { "Comprovantes": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(outputs('Comprovantes')?['body/value'])", true ] } ] },
          "actions": {
            "Motivo_sem_comprovante": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Despesa sem comprovante." } },
            "Falhar_sem_comprovante": { "type": "Compose", "runAfter": { "Motivo_sem_comprovante": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Arquivos": {
          "type": "Foreach", "runAfter": { "Sem_comprovante": ["Succeeded"] },
          "foreach": "@outputs('Comprovantes')?['body/value']",
          "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
          "actions": {
            "Fora_do_sharepoint": {
              "type": "If", "runAfter": {},
              "expression": { "and": [ { "equals": [ "@or(empty(trim(coalesce(items('Arquivos')?['cr40f_driveitemid'], ''))), contains(toLower(concat(coalesce(items('Arquivos')?['cr40f_urlsharepoint'], ''), ' ', coalesce(items('Arquivos')?['cr40f_sharelink'], ''))), 'betinhos-my'))", true ] } ] },
              "actions": {
                "Motivo_fora_sharepoint": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Comprovante fora do SharePoint." } },
                "Falhar_fora_sharepoint": { "type": "Compose", "runAfter": { "Motivo_fora_sharepoint": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
              },
              "else": { "actions": {} }
            },
            "Mime_arquivo": {
              "type": "Compose", "runAfter": { "Fora_do_sharepoint": ["Succeeded"] },
              "inputs": "@if(empty(trim(coalesce(items('Arquivos')?['cr40f_mimetype'], ''))), coalesce(outputs('Tipos_por_extensao')?[toLower(last(split(coalesce(items('Arquivos')?['cr40f_nomearquivo'], ''), '.')))], ''), if(equals(toLower(trim(items('Arquivos')?['cr40f_mimetype'])), 'image/jpg'), 'image/jpeg', toLower(trim(items('Arquivos')?['cr40f_mimetype']))))"
            },
            "Tipo_nao_suportado": {
              "type": "If", "runAfter": { "Mime_arquivo": ["Succeeded"] },
              "expression": { "and": [ { "equals": [ "@contains(createArray('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'), outputs('Mime_arquivo'))", false ] } ] },
              "actions": {
                "Motivo_tipo": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Tipo de comprovante não suportado." } },
                "Falhar_tipo": { "type": "Compose", "runAfter": { "Motivo_tipo": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
              },
              "else": { "actions": {} }
            },
            "Motivo_leitura": { "type": "SetVariable", "runAfter": { "Tipo_nao_suportado": ["Succeeded"] }, "inputs": { "name": "Motivo_erro", "value": "Não foi possível ler o comprovante no SharePoint." } },
            "Propriedades_arquivo": {
              "type": "OpenApiConnection", "runAfter": { "Motivo_leitura": ["Succeeded"] }, "limit": { "timeout": "PT30S" },
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "GetFileItem" },
                "parameters": { "dataset": "__SITE_URL__", "table": "__LIBRARY_ID__", "id": "@trim(items('Arquivos')?['cr40f_driveitemid'])" },
                "authentication": "@parameters('$authentication')",
                "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
              }
            },
            "Conteudo_arquivo": {
              "type": "OpenApiConnection", "runAfter": { "Propriedades_arquivo": ["Succeeded"] }, "limit": { "timeout": "PT40S" },
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "GetFileContent" },
                "parameters": { "dataset": "__SITE_URL__", "id": "@body('Propriedades_arquivo')?['{Identifier}']", "inferContentType": true },
                "authentication": "@parameters('$authentication')",
                "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
              }
            },
            "Limpar_motivo_leitura": { "type": "SetVariable", "runAfter": { "Conteudo_arquivo": ["Succeeded"] }, "inputs": { "name": "Motivo_erro", "value": "" } },
            "Base64_arquivo": { "type": "Compose", "runAfter": { "Limpar_motivo_leitura": ["Succeeded"] }, "inputs": "@base64(body('Conteudo_arquivo'))" },
            "Acima_de_5MB": {
              "type": "If", "runAfter": { "Base64_arquivo": ["Succeeded"] },
              "expression": { "and": [ { "greater": [ "@div(mul(length(outputs('Base64_arquivo')), 3), 4)", 5242880 ] } ] },
              "actions": {
                "Motivo_tamanho": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Arquivo acima de 5 MB." } },
                "Falhar_tamanho": { "type": "Compose", "runAfter": { "Motivo_tamanho": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
              },
              "else": { "actions": {} }
            },
            "Bloco": {
              "type": "AppendToArrayVariable", "runAfter": { "Acima_de_5MB": ["Succeeded"] },
              "inputs": { "name": "Conteudo_mensagem", "value": {
                "type": "@{if(equals(outputs('Mime_arquivo'), 'application/pdf'), 'document', 'image')}",
                "source": { "type": "base64", "media_type": "@{outputs('Mime_arquivo')}", "data": "@{outputs('Base64_arquivo')}" }
              } }
            }
          }
        },
        "Reservas": {
          "type": "OpenApiConnection", "runAfter": { "Arquivos": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_reservadeveculoses",
              "$select": "cr40f_reservadeveculosid,cr40f_dataehorriodesada,cr40f_status,_cr40f_cliente_value",
              "$filter": "_cr40f_motorista_value eq @{coalesce(triggerOutputs()?['body/_cr40f_motorista_value'], '00000000-0000-0000-0000-000000000000')} and cr40f_dataehorriodesada ge @{convertToUtc(concat(outputs('Dia_do_gasto'), 'T00:00:00'), 'E. South America Standard Time')} and cr40f_dataehorriodesada lt @{addDays(convertToUtc(concat(outputs('Dia_do_gasto'), 'T00:00:00'), 'E. South America Standard Time'), 1)}",
              "$orderby": "cr40f_dataehorriodesada asc",
              "$top": 50
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Reservas_contexto": {
          "type": "Select", "runAfter": { "Reservas": ["Succeeded"] },
          "inputs": { "from": "@outputs('Reservas')?['body/value']", "select": {
            "id": "@item()?['cr40f_reservadeveculosid']",
            "saida": "@item()?['cr40f_dataehorriodesada']",
            "cliente": "@coalesce(item()?['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'], '')",
            "status": "@coalesce(item()?['cr40f_status@OData.Community.Display.V1.FormattedValue'], '')"
          } }
        },
        "Ids_reservas": { "type": "Select", "runAfter": { "Reservas_contexto": ["Succeeded"] }, "inputs": { "from": "@outputs('Reservas')?['body/value']", "select": "@item()?['cr40f_reservadeveculosid']" } },
        "Duplicatas_valor_data": {
          "type": "OpenApiConnection", "runAfter": { "Ids_reservas": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_despesaoperacionals",
              "$select": "cr40f_despesaoperacionalid,cr40f_valor,cr40f_datagasto",
              "$filter": "cr40f_valor eq @{coalesce(triggerOutputs()?['body/cr40f_valor'], -1)} and cr40f_despesaoperacionalid ne @{triggerOutputs()?['body/cr40f_despesaoperacionalid']} and cr40f_datagasto ge @{addDays(triggerOutputs()?['body/cr40f_datagasto'], -7)} and cr40f_datagasto le @{addDays(triggerOutputs()?['body/cr40f_datagasto'], 7)}",
              "$top": 10
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Duplicatas_contexto": {
          "type": "Select", "runAfter": { "Duplicatas_valor_data": ["Succeeded"] },
          "inputs": { "from": "@outputs('Duplicatas_valor_data')?['body/value']", "select": {
            "id": "@item()?['cr40f_despesaoperacionalid']",
            "valor": "@item()?['cr40f_valor']",
            "dataGasto": "@convertTimeZone(item()?['cr40f_datagasto'], 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')",
            "motivo": "mesmo_valor_data"
          } }
        },
        "Referencia": {
          "type": "OpenApiConnection", "runAfter": { "Duplicatas_contexto": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "cr40f_despesaoperacionals",
              "$select": "cr40f_valor",
              "$filter": "_cr40f_categoria_value eq @{coalesce(triggerOutputs()?['body/_cr40f_categoria_value'], '00000000-0000-0000-0000-000000000000')} and cr40f_despesaoperacionalid ne @{triggerOutputs()?['body/cr40f_despesaoperacionalid']} and cr40f_valor ne null and cr40f_datagasto ge @{addDays(utcNow(), -90)}",
              "$top": 500
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Valores": { "type": "Select", "runAfter": { "Referencia": ["Succeeded"] }, "inputs": { "from": "@outputs('Referencia')?['body/value']", "select": "@item()?['cr40f_valor']" } },
        "Ordenados": { "type": "Compose", "runAfter": { "Valores": ["Succeeded"] }, "inputs": "@sort(body('Valores'))" },
        "Contexto": {
          "type": "Compose", "runAfter": { "Ordenados": ["Succeeded"] },
          "inputs": {
            "despesa": {
              "id": "@triggerOutputs()?['body/cr40f_despesaoperacionalid']",
              "valor": "@triggerOutputs()?['body/cr40f_valor']",
              "dataGasto": "@outputs('Dia_do_gasto')",
              "categoria": "@coalesce(triggerOutputs()?['body/_cr40f_categoria_value@OData.Community.Display.V1.FormattedValue'], '')",
              "formaPagamento": "@coalesce(triggerOutputs()?['body/_cr40f_formapagamento_value@OData.Community.Display.V1.FormattedValue'], '')",
              "estabelecimento": "@triggerOutputs()?['body/cr40f_estabelecimento']",
              "litros": "@triggerOutputs()?['body/cr40f_litros']",
              "km": "@triggerOutputs()?['body/cr40f_kminformado']",
              "observacao": "@triggerOutputs()?['body/cr40f_observacao']"
            },
            "reservas": "@body('Reservas_contexto')",
            "duplicatas": "@body('Duplicatas_contexto')",
            "referencia": {
              "categoria": "@coalesce(triggerOutputs()?['body/_cr40f_categoria_value@OData.Community.Display.V1.FormattedValue'], '')",
              "mediana": "@first(skip(outputs('Ordenados'), div(length(outputs('Ordenados')), 2)))",
              "maximo": "@last(outputs('Ordenados'))",
              "amostras": "@length(outputs('Ordenados'))"
            }
          }
        },
        "Texto_usuario": {
          "type": "AppendToArrayVariable", "runAfter": { "Contexto": ["Succeeded"] },
          "inputs": { "name": "Conteudo_mensagem", "value": { "type": "text", "text": "__TEXTO_USUARIO__" } }
        },
        "Chamar_Claude": {
          "type": "Http", "runAfter": { "Texto_usuario": ["Succeeded"] },
          "limit": { "timeout": "PT110S" },
          "runtimeConfiguration": { "secureData": { "properties": ["inputs", "outputs"] } },
          "inputs": {
            "method": "POST",
            "uri": "https://api.anthropic.com/v1/messages",
            "headers": {
              "x-api-key": "@parameters('__PARAM_KEY__')",
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "server-side-fallback-2026-07-01",
              "content-type": "application/json"
            },
            "body": {
              "model": "__MODELO__",
              "max_tokens": 0,
              "system": "__SYSTEM__",
              "fallbacks": "default",
              "output_config": { "effort": "__EFFORT__", "format": { "type": "json_schema", "schema": "__SCHEMA__" } },
              "messages": [ { "role": "user", "content": "@variables('Conteudo_mensagem')" } ]
            },
            "retryPolicy": { "type": "exponential", "count": 2, "interval": "PT10S" }
          }
        },
        "Motivo_chamada": {
          "type": "SetVariable", "runAfter": { "Chamar_Claude": ["Failed", "TimedOut"] },
          "inputs": { "name": "Motivo_erro", "value": "@{if(equals(actions('Chamar_Claude')?['status'], 'TimedOut'), 'Tempo esgotado na chamada à API do Claude.', concat('Falha na chamada à API do Claude (HTTP ', string(coalesce(actions('Chamar_Claude')?['outputs']?['statusCode'], 'sem resposta')), '): ', coalesce(actions('Chamar_Claude')?['outputs']?['body']?['error']?['message'], 'sem detalhe'), '.'))}" }
        },
        "Falhar_chamada": { "type": "Compose", "runAfter": { "Motivo_chamada": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" },
        "Blocos_texto": {
          "type": "Query", "runAfter": { "Chamar_Claude": ["Succeeded"] },
          "inputs": { "from": "@coalesce(body('Chamar_Claude')?['content'], createArray())", "where": "@equals(item()?['type'], 'text')" }
        },
        "Texto_resposta": { "type": "Compose", "runAfter": { "Blocos_texto": ["Succeeded"] }, "inputs": "@coalesce(first(body('Blocos_texto'))?['text'], '')" },
        "Resposta_incompleta": {
          "type": "If", "runAfter": { "Texto_resposta": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@body('Chamar_Claude')?['stop_reason']", "end_turn" ] } } ] },
          "actions": {
            "Motivo_incompleta": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Resposta incompleta (stop_reason: @{coalesce(body('Chamar_Claude')?['stop_reason'], 'null')})." } },
            "Falhar_incompleta": { "type": "Compose", "runAfter": { "Motivo_incompleta": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Motivo_json": { "type": "SetVariable", "runAfter": { "Resposta_incompleta": ["Succeeded"] }, "inputs": { "name": "Motivo_erro", "value": "Resposta não é JSON válido." } },
        "Resposta": { "type": "Compose", "runAfter": { "Motivo_json": ["Succeeded"] }, "inputs": "@json(outputs('Texto_resposta'))" },
        "Limpar_motivo_json": { "type": "SetVariable", "runAfter": { "Resposta": ["Succeeded"] }, "inputs": { "name": "Motivo_erro", "value": "" } },
        "Nao_objeto": {
          "type": "If", "runAfter": { "Limpar_motivo_json": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@startsWith(trim(outputs('Texto_resposta')), '{')", false ] } ] },
          "actions": {
            "Motivo_nao_objeto": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Resposta não é um objeto JSON." } },
            "Falhar_nao_objeto": { "type": "Compose", "runAfter": { "Motivo_nao_objeto": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Campos_ausentes": {
          "type": "Query", "runAfter": { "Nao_objeto": ["Succeeded"] },
          "inputs": { "from": "__REQUIRED__", "where": "@not(contains(outputs('Resposta'), item()))" }
        },
        "Com_campos_ausentes": {
          "type": "If", "runAfter": { "Campos_ausentes": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(body('Campos_ausentes'))", false ] } ] },
          "actions": {
            "Motivo_campos": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Campos ausentes: @{join(body('Campos_ausentes'), ', ')}." } },
            "Falhar_campos": { "type": "Compose", "runAfter": { "Motivo_campos": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Decisao_invalida": {
          "type": "If", "runAfter": { "Com_campos_ausentes": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@contains(outputs('Decisoes_validas'), outputs('Resposta')?['decisao'])", false ] } ] },
          "actions": {
            "Motivo_decisao": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Decisão inválida: @{outputs('Resposta')?['decisao']}." } },
            "Falhar_decisao": { "type": "Compose", "runAfter": { "Motivo_decisao": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Motivos_nao_lista": {
          "type": "If", "runAfter": { "Decisao_invalida": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@startsWith(string(outputs('Resposta')?['motivos']), '[')", false ] } ] },
          "actions": {
            "Motivo_lista": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Motivos não é uma lista." } },
            "Falhar_lista": { "type": "Compose", "runAfter": { "Motivo_lista": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Sem_motivos": {
          "type": "If", "runAfter": { "Motivos_nao_lista": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@and(equals(outputs('Resposta')?['decisao'], 'precisa_corrigir'), empty(outputs('Resposta')?['motivos']))", true ] } ] },
          "actions": {
            "Motivo_sem_motivos": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Decisão \"precisa_corrigir\" sem motivos." } },
            "Falhar_sem_motivos": { "type": "Compose", "runAfter": { "Motivo_sem_motivos": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Confianca_fora": {
          "type": "If", "runAfter": { "Sem_motivos": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@if(equals(outputs('Resposta')?['confianca'], null), true, or(less(float(outputs('Resposta')?['confianca']), 0), greater(float(outputs('Resposta')?['confianca']), 1)))", true ] } ] },
          "actions": {
            "Motivo_confianca": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Confiança fora de 0–1: @{outputs('Resposta')?['confianca']}." } },
            "Falhar_confianca": { "type": "Compose", "runAfter": { "Motivo_confianca": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "OS_fora_do_contexto": {
          "type": "If", "runAfter": { "Confianca_fora": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@if(equals(outputs('Resposta')?['reserva_id'], null), false, not(contains(body('Ids_reservas'), outputs('Resposta')?['reserva_id'])))", true ] } ] },
          "actions": {
            "Motivo_os": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "OS indicada fora do contexto: @{outputs('Resposta')?['reserva_id']}." } },
            "Falhar_os": { "type": "Compose", "runAfter": { "Motivo_os": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Gravar_resultado": {
          "type": "If", "runAfter": { "OS_fora_do_contexto": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@equals(outputs('Resposta')?['reserva_id'], null)", false ] } ] },
          "actions": { "Gravar_resultado_com_OS": "__GRAVAR_COM_OS__" },
          "else": { "actions": { "Gravar_resultado_sem_OS": "__GRAVAR_SEM_OS__" } }
        }
      }
    },
    "Tratar_erro": {
      "type": "Scope", "runAfter": { "Escopo_analise": ["Failed", "TimedOut"] },
      "actions": {
        "Falhas_escopo": {
          "type": "Query", "runAfter": {},
          "runtimeConfiguration": { "secureData": { "properties": ["inputs", "outputs"] } },
          "inputs": { "from": "@result('Escopo_analise')", "where": "@contains(createArray('Failed', 'TimedOut'), item()?['status'])" }
        },
        "Motivo_falha": {
          "type": "Compose", "runAfter": { "Falhas_escopo": ["Succeeded"] },
          "inputs": "@if(empty(variables('Motivo_erro')), concat('Falha técnica na análise (', coalesce(first(body('Falhas_escopo'))?['name'], 'Escopo_analise'), '): ', coalesce(first(body('Falhas_escopo'))?['error']?['message'], 'sem detalhe')), variables('Motivo_erro'))"
        },
        "Gravar_erro": {
          "type": "OpenApiConnection", "runAfter": { "Motivo_falha": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
            "parameters": {
              "entityName": "cr40f_despesaoperacionals",
              "recordId": "@triggerOutputs()?['body/cr40f_despesaoperacionalid']",
              "item/cr40f_iastatusanalise": 100000003,
              "item/cr40f_iamotivos": "@{outputs('Motivo_falha')}",
              "item/cr40f_iadataanalise": "@utcNow()"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    },
    "Encerrar_com_erro": {
      "type": "Terminate", "runAfter": { "Tratar_erro": ["Succeeded"] },
      "inputs": { "runStatus": "Failed", "runError": { "code": "AnaliseIA", "message": "@{outputs('Motivo_falha')}" } }
    }
  },
  "outputs": {}
}
'@

# Gravação do resultado: mesma ação nos dois ramos; com OS, também vincula cr40f_reserva.
$gravarText = @'
{
  "type": "OpenApiConnection", "runAfter": {},
  "inputs": {
    "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
    "parameters": {
      "entityName": "cr40f_despesaoperacionals",
      "recordId": "@triggerOutputs()?['body/cr40f_despesaoperacionalid']",
      "item/cr40f_statusoperacional": "@if(equals(outputs('Resposta')?['decisao'], 'validar'), 100000002, 100000001)",
      "item/cr40f_possivelduplicidade": "@equals(outputs('Resposta')?['possivel_duplicidade'], true)",
      "item/cr40f_iadecisao": "@if(equals(outputs('Resposta')?['decisao'], 'validar'), 100000000, 100000001)",
      "item/cr40f_iamotivos": "@{join(outputs('Resposta')?['motivos'], decodeUriComponent('%0A'))}",
      "item/cr40f_iavalorlido": "@outputs('Resposta')?['valor_lido']",
      "item/cr40f_iadatalida": "@outputs('Resposta')?['data_lida']",
      "item/cr40f_iacnpjlido": "@if(equals(outputs('Resposta')?['cnpj_lido'], null), null, substring(outputs('Resposta')?['cnpj_lido'], 0, min(length(outputs('Resposta')?['cnpj_lido']), 20)))",
      "item/cr40f_iaestabelecimentolido": "@if(equals(outputs('Resposta')?['estabelecimento_lido'], null), null, substring(outputs('Resposta')?['estabelecimento_lido'], 0, min(length(outputs('Resposta')?['estabelecimento_lido']), 200)))",
      "item/cr40f_iaconfianca": "@float(formatNumber(outputs('Resposta')?['confianca'], '0.00', 'en-US'))",
      "item/cr40f_iajson": "@{outputs('Texto_resposta')}",
      "item/cr40f_iadataanalise": "@utcNow()",
      "item/cr40f_iamodelo": "@{body('Chamar_Claude')?['model']}",
      "item/cr40f_iastatusanalise": 100000002
    },
    "authentication": "@parameters('$authentication')"
  }
}
'@

$definitionText = $definitionText.Replace('__PARAM_KEY__', $paramKey).Replace('__ENV_VAR__', $envVarName).Replace('__TRIGGER_FILTER__', $triggerFilter).Replace('__SITE_URL__', $siteUrl).Replace('__LIBRARY_ID__', $libraryId)
$definition = $definitionText | ConvertFrom-Json
$escopo = $definition.actions.Escopo_analise.actions
# Constantes entram como valores JSON (sem concatenação de texto), então aspas e quebras de linha ficam escapadas pelo serializador.
$escopo.Decisoes_validas.inputs = @($const.schema.properties.decisao.enum)
$escopo.Campos_ausentes.inputs.from = @($const.schema.required)
$escopo.Texto_usuario.inputs.value.text = $const.prefixoUsuario + "@{string(outputs('Contexto'))}"
$body = $escopo.Chamar_Claude.inputs.body
$body.model = $const.modelo
$body.max_tokens = [int]$const.maxTokens
$body.system = $const.systemPrompt
$body.output_config.effort = $const.effort
$body.output_config.format.schema = $const.schema
$semOs = $gravarText | ConvertFrom-Json
$comOs = $gravarText | ConvertFrom-Json
$comOs.inputs.parameters | Add-Member -NotePropertyName 'item/cr40f_Reserva@odata.bind' -NotePropertyValue "@concat('/cr40f_reservadeveculoses(', outputs('Resposta')?['reserva_id'], ')')"
$escopo.Gravar_resultado.actions.Gravar_resultado_com_OS = $comOs
$escopo.Gravar_resultado.else.actions.Gravar_resultado_sem_OS = $semOs

$definitionJson = $definition | ConvertTo-Json -Depth 90 -Compress
AssertSemMojibake $definitionJson 'definição do script'
if ($definitionJson -match '__[A-Z_]+__') { throw "Marcador não substituído na definição: $($Matches[0])" }
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{ shared_commondataserviceforapps = $dataverse; shared_sharepointonline = $sharepoint } }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

$flows = @(FlowRows)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  AssertSemMojibake $flows[0].clientdata 'clientdata atual'
  $atual = ($flows[0].clientdata | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  $novo = ($clientData | ConvertFrom-Json) | ConvertTo-Json -Depth 90 -Compress
  if ($atual -ne $novo) {
    Backup $flows[0]
    Apply $flows[0] $clientData
  } else { Write-Host '[despesas-ia] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Analisa o comprovante da despesa do App Motoristas com a API do Claude e grava a decisão (cr40f_ia*). Falha técnica grava Erro e não muda o status operacional.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1 -and $temValor) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null }

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=statecode,clientdata"
if ($temValor -and $row.statecode -ne 1) { throw 'Flow não ativou.' }
AssertSemMojibake $row.clientdata 'clientdata gravado'
$lido = ($row.clientdata | ConvertFrom-Json).properties.definition
$trigger = $lido.triggers.Quando_comprovante_completo
$http = $lido.actions.Escopo_analise.actions.Chamar_Claude
$erro = $lido.actions.Tratar_erro
$checks = [ordered]@{
  'gatilho com filtro' = $trigger.inputs.parameters.'subscriptionRequest/filterexpression' -eq $triggerFilter
  'gatilho só por cr40f_statusanexo' = $trigger.inputs.parameters.'subscriptionRequest/filteringattributes' -eq 'cr40f_statusanexo'
  'concurrency.runs = 1' = $trigger.runtimeConfiguration.concurrency.runs -eq 1
  'Chamar_Claude secureData inputs e outputs' = (@($http.runtimeConfiguration.secureData.properties) -join ',') -eq 'inputs,outputs'
  'Chamar_Claude retry exponencial 2x' = $http.inputs.retryPolicy.type -eq 'exponential' -and $http.inputs.retryPolicy.count -eq 2
  'Chamar_Claude timeout PT110S' = $http.limit.timeout -eq 'PT110S'
  'Chamar_Claude chave pela variável' = $http.inputs.headers.'x-api-key' -eq "@parameters('$paramKey')"
  'Chamar_Claude constantes' = $http.inputs.body.model -eq $const.modelo -and $http.inputs.body.max_tokens -eq $const.maxTokens -and $http.inputs.body.system -ceq $const.systemPrompt -and (($http.inputs.body.output_config.format.schema | ConvertTo-Json -Depth 30 -Compress) -ceq ($const.schema | ConvertTo-Json -Depth 30 -Compress))
  'Tratar_erro após Failed/TimedOut' = (@($erro.runAfter.Escopo_analise) -join ',') -eq 'Failed,TimedOut'
  'Tratar_erro não grava cr40f_statusoperacional' = -not (($erro | ConvertTo-Json -Depth 30 -Compress) -match 'cr40f_statusoperacional')
}
$falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
if (-not @((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $flowId").value).Count) { throw 'Flow fora da AppBetinhos.' }
$checks.Keys | ForEach-Object { Write-Host "[despesas-ia] ok: $_" }
if (-not $temValor) {
  Write-Output "DEV: '$flowName' gravado e DESLIGADO ($flowId), na $solutionName. Preencha o valor de $envVarName no DEV (Soluções > $solutionName > Variáveis de ambiente) e rode este script de novo para ativar."
  return
}
Write-Output "DEV: '$flowName' ativo ($flowId), na $solutionName; $envVarName na solução, sem valor padrão."
