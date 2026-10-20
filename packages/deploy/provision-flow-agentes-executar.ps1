# Somente DEV. Cria (ou atualiza) o flow "Flow Agentes | Executar" na solução AppBetinhos, inclui a definição da variável
# de ambiente new_AnthropicApiKey (já existente, criada pelo flow de despesas) e ativa o flow.
#
# O flow roda quando uma cr40f_agenteexecucao é criada com status Pendente: marca Processando, confere o limite diário
# por agente, monta o contexto do departamento (Financeiro, Logística, Pessoas ou Frota) no formato de
# packages/agentes-ia/src/{financeiro,logistica,pessoas,frota}.ts (Frota usa a Custom API cr40f_FrotaPendencias), chama a API do Claude com saída estruturada, aplica as travas
# de packages/agentes-ia/src/validar.ts e só então cria as cr40f_agenteproposta e grava Concluída. Qualquer falha no
# escopo grava cr40f_status = Erro e o motivo em cr40f_erro, sem propostas parciais.
#
# Constantes (modelo, max_tokens, effort, prompts, tipos, ações, prefixo e schema) vêm de
# packages/agentes-ia/dist/constantes.json. Gere antes: pnpm --filter @betinhos/agentes-ia constantes
# O valor da chave (new_AnthropicApiKey) fica só no ambiente; este script nunca cria nem lê o valor.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-agentes-executar.ps1 -Restaurar <arquivo de backup>
# Para conferir a definição sem gravar (checkFlowErrors):
#   powershell -File packages/deploy/provision-flow-agentes-executar.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV.
#
# Limites das consultas: cada ListRecords dos ramos traz no máximo 150 linhas ($top 150, sem paginação). No Financeiro, os
# recibos vêm junto de cada OS por $expand de cr40f_cr40f_reservadeveculos_Reserva_cr40f_recibos (só recibos ativos), então
# temRecibo não depende de uma segunda lista com corte próprio: OS antigas da janela de 60 dias não perdem o recibo.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Agentes | Executar'
$envVarName = 'new_AnthropicApiKey'
$envVarDisplay = 'Anthropic API Key'
$paramKey = "$envVarDisplay ($envVarName)"
$dataverseFlow = 'Flow Comprovantes Despesas Assincrono | App Motoristas'   # fonte da connection reference do Dataverse
$constantesPath = Join-Path $PSScriptRoot '../agentes-ia/dist/constantes.json'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
$triggerFilter = 'cr40f_status eq 100000000'
$LIMITE_DIARIO = 20
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[agentes-executar] $Method $($Path.Split('?')[0])"
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
  $file = Join-Path $backupDir ("Flow-Agentes-Executar-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[agentes-executar] backup: $file"
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
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Escopo_execucao) { throw 'O arquivo não é um backup deste flow.' }
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

# Constantes do pacote @betinhos/agentes-ia. Strings com @ seriam lidas como expressão pelo Logic Apps: recusa.
if (-not (Test-Path $constantesPath)) { throw 'constantes.json ausente: rode pnpm --filter @betinhos/agentes-ia constantes.' }
$constantesText = [IO.File]::ReadAllText((Resolve-Path $constantesPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
if ($constantesText.Contains('@')) { throw 'constantes.json contém @; escape antes de embutir no flow.' }
AssertSemMojibake $constantesText 'constantes.json'
$const = $constantesText | ConvertFrom-Json
foreach ($campo in 'modelo', 'maxTokens', 'effort', 'prefixoUsuario', 'schema', 'agentes') { if ($null -eq $const.$campo) { throw "constantes.json sem $campo." } }
foreach ($ag in 'financeiro', 'logistica', 'pessoas', 'frota') {
  foreach ($campo in 'systemPrompt', 'tipos', 'acoes') { if ($null -eq $const.agentes.$ag.$campo) { throw "constantes.json sem agentes.$ag.$campo." } }
}
# O prefixo vira literal dentro de concat('...'): aspas simples quebrariam a expressão.
if ($const.prefixoUsuario.Contains("'")) { throw 'prefixoUsuario contém aspa simples; revise a substituição de __PREFIXO__.' }

# Variável da chave: já existe no DEV (flow de despesas). Só inclui a definição na solução e confere que há valor no ambiente.
$envDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'").value)
if ($envDefs.Count -ne 1) { throw "Variável $envVarName ausente ou duplicada no DEV (rode antes provision-flow-despesas-ia.ps1)." }
# Valor padrão faz parte da definição e iria no export da solução. Confere pelo filtro, sem trazer o valor.
$temPadrao = [bool]@((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName' and defaultvalue ne null").value).Count
if ($temPadrao -and -not $SomenteValidar) { throw "A variável $envVarName tem valor padrão; ele iria no export da solução. Mova a chave para o valor atual (fora da $solutionName) e apague o valor padrão." }
if ($temPadrao) { Write-Warning "$envVarName tem valor padrão (iria no export)." }
Include $envDefs[0].environmentvariabledefinitionid 380
# O Power Automate só ativa o flow quando a variável tem valor no ambiente. Sem valor, o flow fica gravado e desligado.
$envId = $envDefs[0].environmentvariabledefinitionid
$temValor = [bool]@((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $envId").value).Count

# Connection reference do Dataverse, a mesma do flow de comprovantes. Este flow não usa SharePoint.
$dvSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$dataverseFlow' and category eq 5").value)
if ($dvSource.Count -ne 1) { throw 'Flow de referência do Dataverse ausente no DEV.' }
$dataverse = ($dvSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_commondataserviceforapps
if (-not $dataverse.connection.connectionReferenceLogicalName) { throw 'Connection reference do Dataverse ausente.' }

# Travas: Terminate encerraria a execução inteira e o Tratar_erro não rodaria. Cada trava grava o motivo na variável
# Motivo_erro e falha de propósito (int() do texto), o que faz o Escopo_execucao falhar e o Tratar_erro gravar o motivo.
# O Foreach de propostas só roda depois de todas as travas: nunca há propostas parciais.
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
    "Quando_execucao_criada": {
      "type": "OpenApiConnectionWebhook",
      "inputs": {
        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger" },
        "parameters": { "subscriptionRequest/message": 1, "subscriptionRequest/entityname": "cr40f_agenteexecucao", "subscriptionRequest/scope": 4, "subscriptionRequest/filterexpression": "__TRIGGER_FILTER__" },
        "authentication": "@parameters('$authentication')"
      },
      "runtimeConfiguration": { "concurrency": { "runs": 1 } }
    }
  },
  "actions": {
    "Iniciar_motivo_erro": { "type": "InitializeVariable", "runAfter": {}, "inputs": { "variables": [ { "name": "Motivo_erro", "type": "string", "value": "" } ] } },
    "Iniciar_contexto": { "type": "InitializeVariable", "runAfter": { "Iniciar_motivo_erro": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Contexto", "type": "object", "value": {} } ] } },
    "Iniciar_system": { "type": "InitializeVariable", "runAfter": { "Iniciar_contexto": ["Succeeded"] }, "inputs": { "variables": [ { "name": "System_prompt", "type": "string", "value": "" } ] } },
    "Iniciar_tipos": { "type": "InitializeVariable", "runAfter": { "Iniciar_system": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Tipos_validos", "type": "array", "value": [] } ] } },
    "Iniciar_acoes": { "type": "InitializeVariable", "runAfter": { "Iniciar_tipos": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Acoes_validas", "type": "array", "value": [] } ] } },
    "Iniciar_obrigatorios": { "type": "InitializeVariable", "runAfter": { "Iniciar_acoes": ["Succeeded"] }, "inputs": { "variables": [ { "name": "Obrigatorios", "type": "array", "value": [] } ] } },
    "Escopo_execucao": {
      "type": "Scope", "runAfter": { "Iniciar_obrigatorios": ["Succeeded"] },
      "actions": {
        "Marcar_processando": {
          "type": "OpenApiConnection", "runAfter": {},
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
            "parameters": { "entityName": "cr40f_agenteexecucaos", "recordId": "@triggerOutputs()?['body/cr40f_agenteexecucaoid']", "item/cr40f_status": 100000001 },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Hoje": { "type": "Compose", "runAfter": { "Marcar_processando": ["Succeeded"] }, "inputs": "@convertTimeZone(utcNow(), 'UTC', 'E. South America Standard Time', 'yyyy-MM-dd')" },
        "Inicio_do_dia_utc": { "type": "Compose", "runAfter": { "Hoje": ["Succeeded"] }, "inputs": "@convertToUtc(concat(outputs('Hoje'), 'T00:00:00'), 'E. South America Standard Time')" },
        "Execucoes_de_hoje": {
          "type": "OpenApiConnection", "runAfter": { "Inicio_do_dia_utc": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": { "entityName": "cr40f_agenteexecucaos", "$select": "cr40f_agenteexecucaoid", "$filter": "cr40f_agente eq @{triggerOutputs()?['body/cr40f_agente']} and createdon ge @{outputs('Inicio_do_dia_utc')} and cr40f_agenteexecucaoid ne @{triggerOutputs()?['body/cr40f_agenteexecucaoid']}", "$top": 100 },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Limite_diario": {
          "type": "If", "runAfter": { "Execucoes_de_hoje": ["Succeeded"] },
          "expression": { "and": [ { "greaterOrEquals": [ "@length(outputs('Execucoes_de_hoje')?['body/value'])", __LIMITE_DIARIO__ ] } ] },
          "actions": {
            "Motivo_limite": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Limite diário de __LIMITE_DIARIO__ execuções deste agente atingido." } },
            "Falhar_limite": { "type": "Compose", "runAfter": { "Motivo_limite": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Por_agente": {
          "type": "Switch", "runAfter": { "Limite_diario": ["Succeeded"] },
          "expression": "@triggerOutputs()?['body/cr40f_agente']",
          "cases": {
            "Financeiro": { "case": 100000000, "actions": "__RAMO_FINANCEIRO__" },
            "Logistica": { "case": 100000001, "actions": "__RAMO_LOGISTICA__" },
            "Pessoas": { "case": 100000002, "actions": "__RAMO_PESSOAS__" },
            "Frota": { "case": 100000003, "actions": "__RAMO_FROTA__" }
          },
          "default": {
            "actions": {
              "Motivo_agente": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Agente desconhecido: @{triggerOutputs()?['body/cr40f_agente']}." } },
              "Falhar_agente": { "type": "Compose", "runAfter": { "Motivo_agente": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
            }
          }
        },
        "Gravar_contexto": {
          "type": "OpenApiConnection", "runAfter": { "Por_agente": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
            "parameters": { "entityName": "cr40f_agenteexecucaos", "recordId": "@triggerOutputs()?['body/cr40f_agenteexecucaoid']", "item/cr40f_contexto": "@{string(variables('Contexto'))}" },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Texto_usuario": {
          "type": "Compose", "runAfter": { "Gravar_contexto": ["Succeeded"] },
          "inputs": "@if(empty(coalesce(triggerOutputs()?['body/cr40f_pergunta'], '')), concat('__PREFIXO__', string(variables('Contexto'))), concat('__PREFIXO__', string(variables('Contexto')), decodeUriComponent('%0A%0A'), 'Pergunta do usuário: ', triggerOutputs()?['body/cr40f_pergunta']))"
        },
        "Chamar_Claude": {
          "type": "Http", "runAfter": { "Texto_usuario": ["Succeeded"] },
          "limit": { "timeout": "PT110S" },
          "runtimeConfiguration": { "secureData": { "properties": ["inputs", "outputs"] } },
          "inputs": {
            "method": "POST", "uri": "https://api.anthropic.com/v1/messages",
            "headers": { "x-api-key": "@parameters('__PARAM_KEY__')", "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01", "content-type": "application/json" },
            "body": { "model": "__MODELO__", "max_tokens": 0, "system": "@variables('System_prompt')", "fallbacks": "default", "output_config": { "effort": "__EFFORT__", "format": { "type": "json_schema", "schema": "__SCHEMA__" } }, "messages": [ { "role": "user", "content": "@outputs('Texto_usuario')" } ] },
            "retryPolicy": { "type": "exponential", "count": 2, "interval": "PT10S" }
          }
        },
        "Motivo_chamada": {
          "type": "SetVariable", "runAfter": { "Chamar_Claude": ["Failed", "TimedOut"] },
          "inputs": { "name": "Motivo_erro", "value": "@{if(equals(actions('Chamar_Claude')?['status'], 'TimedOut'), 'Tempo esgotado na chamada à API do Claude.', concat('Falha na chamada à API do Claude (HTTP ', string(coalesce(actions('Chamar_Claude')?['outputs']?['statusCode'], 'sem resposta')), '): ', coalesce(actions('Chamar_Claude')?['outputs']?['body']?['error']?['message'], 'sem detalhe'), '.'))}" }
        },
        "Falhar_chamada": { "type": "Compose", "runAfter": { "Motivo_chamada": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" },
        "Blocos_texto": { "type": "Query", "runAfter": { "Chamar_Claude": ["Succeeded"] }, "inputs": { "from": "@coalesce(body('Chamar_Claude')?['content'], json('[]'))", "where": "@equals(item()?['type'], 'text')" } },
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
          "type": "If", "runAfter": { "Nao_objeto": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@or(equals(outputs('Resposta')?['resumo'], null), equals(outputs('Resposta')?['propostas'], null))", true ] } ] },
          "actions": {
            "Motivo_campos": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Campos ausentes: resumo, propostas." } },
            "Falhar_campos": { "type": "Compose", "runAfter": { "Motivo_campos": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Muitas_propostas": {
          "type": "If", "runAfter": { "Campos_ausentes": ["Succeeded"] },
          "expression": { "and": [ { "greater": [ "@length(outputs('Resposta')?['propostas'])", 20 ] } ] },
          "actions": {
            "Motivo_muitas": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Mais de 20 propostas (@{length(outputs('Resposta')?['propostas'])})." } },
            "Falhar_muitas": { "type": "Compose", "runAfter": { "Motivo_muitas": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Tipos_invalidos": { "type": "Query", "runAfter": { "Muitas_propostas": ["Succeeded"] }, "inputs": { "from": "@outputs('Resposta')?['propostas']", "where": "@not(contains(variables('Tipos_validos'), item()?['tipo']))" } },
        "Com_tipo_invalido": {
          "type": "If", "runAfter": { "Tipos_invalidos": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(body('Tipos_invalidos'))", false ] } ] },
          "actions": {
            "Motivo_tipo": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Tipo de proposta fora do agente @{toLower(triggerOutputs()?['body/cr40f_agente@OData.Community.Display.V1.FormattedValue'])}: @{first(body('Tipos_invalidos'))?['tipo']}." } },
            "Falhar_tipo": { "type": "Compose", "runAfter": { "Motivo_tipo": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Acoes_invalidas": { "type": "Query", "runAfter": { "Com_tipo_invalido": ["Succeeded"] }, "inputs": { "from": "@outputs('Resposta')?['propostas']", "where": "@and(not(equals(item()?['acao'], null)), not(contains(variables('Acoes_validas'), item()?['acao']?['tipo'])))" } },
        "Com_acao_invalida": {
          "type": "If", "runAfter": { "Acoes_invalidas": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(body('Acoes_invalidas'))", false ] } ] },
          "actions": {
            "Motivo_acao": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Ação fora do agente @{toLower(triggerOutputs()?['body/cr40f_agente@OData.Community.Display.V1.FormattedValue'])}: @{first(body('Acoes_invalidas'))?['acao']?['tipo']}." } },
            "Falhar_acao": { "type": "Compose", "runAfter": { "Motivo_acao": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Alvos_invalidos": { "type": "Query", "runAfter": { "Com_acao_invalida": ["Succeeded"] }, "inputs": { "from": "@outputs('Resposta')?['propostas']", "where": "@not(equals(length(coalesce(item()?['registroAlvo']?['id'], '')), 36))" } },
        "Com_alvo_invalido": {
          "type": "If", "runAfter": { "Alvos_invalidos": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(body('Alvos_invalidos'))", false ] } ] },
          "actions": {
            "Motivo_alvo": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "registroAlvo.id não é GUID: @{first(body('Alvos_invalidos'))?['registroAlvo']?['id']}." } },
            "Falhar_alvo": { "type": "Compose", "runAfter": { "Motivo_alvo": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Alvos_propostos": { "type": "Select", "runAfter": { "Com_alvo_invalido": ["Succeeded"] }, "inputs": { "from": "@outputs('Resposta')?['propostas']", "select": "@toLower(coalesce(item()?['registroAlvo']?['id'], ''))" } },
        "Obrigatorios_faltando": { "type": "Query", "runAfter": { "Alvos_propostos": ["Succeeded"] }, "inputs": { "from": "@variables('Obrigatorios')", "where": "@not(contains(body('Alvos_propostos'), item()))" } },
        "Com_obrigatorio_faltando": {
          "type": "If", "runAfter": { "Obrigatorios_faltando": ["Succeeded"] },
          "expression": { "and": [ { "equals": [ "@empty(body('Obrigatorios_faltando'))", false ] } ] },
          "actions": {
            "Motivo_obrigatorio": { "type": "SetVariable", "runAfter": {}, "inputs": { "name": "Motivo_erro", "value": "Pendências obrigatórias sem proposta: @{join(body('Obrigatorios_faltando'), ', ')}." } },
            "Falhar_obrigatorio": { "type": "Compose", "runAfter": { "Motivo_obrigatorio": ["Succeeded"] }, "inputs": "@int(variables('Motivo_erro'))" }
          },
          "else": { "actions": {} }
        },
        "Mapa_tipos": { "type": "Compose", "runAfter": { "Com_obrigatorio_faltando": ["Succeeded"] }, "inputs": "__MAPA_TIPOS__" },
        "Mapa_prioridade": { "type": "Compose", "runAfter": { "Mapa_tipos": ["Succeeded"] }, "inputs": { "alta": 100000000, "media": 100000001, "baixa": 100000002 } },
        "Criar_propostas": {
          "type": "Foreach", "runAfter": { "Mapa_prioridade": ["Succeeded"] }, "foreach": "@outputs('Resposta')?['propostas']",
          "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
          "actions": {
            "Criar_proposta": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
                "parameters": {
                  "entityName": "cr40f_agentepropostas",
                  "item/cr40f_agentepropostanome": "@{take(item()?['titulo'], 200)}",
                  "item/cr40f_Execucao@odata.bind": "@concat('/cr40f_agenteexecucaos(', triggerOutputs()?['body/cr40f_agenteexecucaoid'], ')')",
                  "item/cr40f_tipo": "@outputs('Mapa_tipos')?[item()?['tipo']]",
                  "item/cr40f_titulo": "@{take(item()?['titulo'], 200)}",
                  "item/cr40f_justificativa": "@{take(item()?['justificativa'], 2000)}",
                  "item/cr40f_prioridade": "@outputs('Mapa_prioridade')?[item()?['prioridade']]",
                  "item/cr40f_entidadealvo": "@{item()?['registroAlvo']?['entidade']}",
                  "item/cr40f_idalvo": "@{toLower(item()?['registroAlvo']?['id'])}",
                  "item/cr40f_acao": "@{if(equals(item()?['acao'], null), '', string(item()?['acao']))}",
                  "item/cr40f_decisao": 100000000
                },
                "authentication": "@parameters('$authentication')"
              }
            }
          }
        },
        "Concluir": {
          "type": "OpenApiConnection", "runAfter": { "Criar_propostas": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
            "parameters": {
              "entityName": "cr40f_agenteexecucaos", "recordId": "@triggerOutputs()?['body/cr40f_agenteexecucaoid']",
              "item/cr40f_status": 100000002,
              "item/cr40f_resumo": "@{take(outputs('Resposta')?['resumo'], 500)}",
              "item/cr40f_resposta": "@{outputs('Texto_resposta')}",
              "item/cr40f_modelo": "@{body('Chamar_Claude')?['model']}",
              "item/cr40f_tokensentrada": "@int(coalesce(body('Chamar_Claude')?['usage']?['input_tokens'], 0))",
              "item/cr40f_tokenssaida": "@int(coalesce(body('Chamar_Claude')?['usage']?['output_tokens'], 0))"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    },
    "Tratar_erro": {
      "type": "Scope", "runAfter": { "Escopo_execucao": ["Failed", "TimedOut"] },
      "actions": {
        "Falhas_escopo": { "type": "Query", "runAfter": {}, "runtimeConfiguration": { "secureData": { "properties": ["inputs", "outputs"] } }, "inputs": { "from": "@result('Escopo_execucao')", "where": "@contains(createArray('Failed', 'TimedOut'), item()?['status'])" } },
        "Motivo_falha": { "type": "Compose", "runAfter": { "Falhas_escopo": ["Succeeded"] }, "inputs": "@if(empty(variables('Motivo_erro')), concat('Falha técnica na execução (', coalesce(first(body('Falhas_escopo'))?['name'], 'Escopo_execucao'), '): ', coalesce(first(body('Falhas_escopo'))?['error']?['message'], 'sem detalhe')), variables('Motivo_erro'))" },
        "Gravar_erro": {
          "type": "OpenApiConnection", "runAfter": { "Motivo_falha": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
            "parameters": { "entityName": "cr40f_agenteexecucaos", "recordId": "@triggerOutputs()?['body/cr40f_agenteexecucaoid']", "item/cr40f_status": 100000003, "item/cr40f_erro": "@{take(outputs('Motivo_falha'), 2000)}" },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    },
    "Encerrar_com_erro": { "type": "Terminate", "runAfter": { "Tratar_erro": ["Succeeded"] }, "inputs": { "runStatus": "Failed", "runError": { "code": "AgenteIA", "message": "@{outputs('Motivo_falha')}" } } }
  },
  "outputs": {}
}
'@

# Ramos do Switch: ações encadeadas (cada uma roda após a anterior). Todas as consultas usam $top 150.
$dvApi = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
function Passo([string] $nome, $acao) { [pscustomobject]@{ nome = $nome; acao = $acao } }
function Ramo([object[]] $passos) {
  $r = [ordered]@{}; $anterior = $null
  foreach ($p in $passos) {
    $p.acao['runAfter'] = if ($anterior) { [ordered]@{ $anterior = @('Succeeded') } } else { [ordered]@{} }
    $r[$p.nome] = $p.acao; $anterior = $p.nome
  }
  return $r
}
function DefinirVar([string] $variavel, $valor) { [ordered]@{ type = 'SetVariable'; runAfter = $null; inputs = [ordered]@{ name = $variavel; value = $valor } } }
function Compor([string] $expr) { [ordered]@{ type = 'Compose'; runAfter = $null; inputs = $expr } }
function Listar([string] $entidade, [string] $select, [string] $filtro, [string] $ordem, [string] $expand = '') {
  $parametros = [ordered]@{ entityName = $entidade; '$select' = $select; '$filter' = $filtro; '$orderby' = $ordem; '$top' = 150 }
  if ($expand) { $parametros['$expand'] = $expand }
  [ordered]@{
    type = 'OpenApiConnection'; runAfter = $null
    inputs = [ordered]@{
      host = [ordered]@{ apiId = $dvApi; connectionName = 'shared_commondataserviceforapps'; operationId = 'ListRecords' }
      parameters = $parametros
      authentication = "@parameters('`$authentication')"
    }
  }
}
function Selecionar([string] $from, $mapa) { [ordered]@{ type = 'Select'; runAfter = $null; inputs = [ordered]@{ from = $from; select = $mapa } } }
# Expressões dos campos, no formato das funções str/num/id/rotulo/dia de packages/agentes-ia/src/comum.ts e pessoas.ts.
function Id([string] $c) { "@toLower(coalesce(item()?['$c'], ''))" }
function Txt([string] $c) { "@coalesce(item()?['$c'], '')" }
function Num([string] $c) { "@item()?['$c']" }
function Rot([string] $c) { "@coalesce(item()?['$c@OData.Community.Display.V1.FormattedValue'], '')" }
# take() e não substring(): no Logic Apps substring('', 0, 0) falha (índice inicial precisa ser menor que o tamanho).
function Dia([string] $c) { "@take(coalesce(item()?['$c'], ''), 10)" }
function Agente([string] $ag, [string] $suf) {
  @(
    (Passo "Definir_system_$suf" (DefinirVar 'System_prompt' $const.agentes.$ag.systemPrompt)),
    (Passo "Definir_tipos_$suf" (DefinirVar 'Tipos_validos' @($const.agentes.$ag.tipos))),
    (Passo "Definir_acoes_$suf" (DefinirVar 'Acoes_validas' @($const.agentes.$ag.acoes)))
  )
}

# $select de cada consulta (conferidos com -ceq em Conferir).
$sel = [ordered]@{
  OS_concluidas = 'cr40f_reservadeveculosid,cr40f_idnovo,cr40f_id,cr40f_dataehorriodesada,cr40f_statusdefaturamento,cr40f_valor_a_receber,_cr40f_financeiro_value,_cr40f_cliente_value'
  OPs_pendentes = 'cr40f_financeiroid,cr40f_idfinanceiro,cr40f_status,cr40f_valor,createdon,new_clientedaop'
  Pagamentos_terceiro = 'cr40f_pagamentoaterceiroid,cr40f_name,cr40f_status,cr40f_totalrepasse,cr40f_margemtotal,createdon,_cr40f_terceirofavorecido_value'
  Servicos = 'cr40f_reservadeveculosid,cr40f_idnovo,cr40f_id,cr40f_status,cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_tipodeveiculo,cr40f_destino,_cr40f_motorista_value,_cr40f_veiculo_value,_cr40f_cliente_value'
  Motoristas = 'cr40f_funcionariosid,new_apelido,_cr40f_veiculoatual_value'
  Trocas = 'cr40f_trocasdecarroid,cr40f_id,cr40f_statusdatroca,cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,_cr40f_motorista1_value,_cr40f_motorista2_value'
  Funcionarios = 'cr40f_funcionariosid,new_apelido,cr40f_funcao,cr40f_validadedacnh,cr40f_datadoaso,cr40f_datadeaniversario,cr40f_datadeadmissao'
  Documentos = 'cr40f_documentoid,cr40f_name,cr40f_validade,_cr40f_funcionario_value,_cr40f_tipo_value'
  Multas = 'cr40f_multasid,cr40f_id_multa,cr40f_dataehorario,cr40f_dataparaindicar,_cr40f_motorista_value,_cr40f_placa_value'
  Comunicados = 'cr40f_comunicadohomeid,cr40f_titulo,cr40f_inicio,cr40f_fim'
}
$ramoPorAcao = @{ OS_concluidas = 'Financeiro'; OPs_pendentes = 'Financeiro'; Pagamentos_terceiro = 'Financeiro'; Servicos = 'Logistica'; Motoristas = 'Logistica'; Trocas = 'Logistica'; Funcionarios = 'Pessoas'; Documentos = 'Pessoas'; Multas = 'Pessoas'; Comunicados = 'Pessoas' }

# Recibos ativos de cada OS, pela relação 1:N reserva -> recibo (cr40f_reserva).
$navRecibos = 'cr40f_cr40f_reservadeveculos_Reserva_cr40f_recibos'
$expandRecibos = "$navRecibos(`$select=cr40f_recibosid;`$filter=statecode eq 0)"
$ramoFinanceiro = Ramo (@(Agente 'financeiro' 'fin') + @(
  (Passo 'Janela_60d' (Compor "@addDays(outputs('Inicio_do_dia_utc'), -60)")),
  (Passo 'OS_concluidas' (Listar 'cr40f_reservadeveculoses' $sel.OS_concluidas "statecode eq 0 and cr40f_status eq 202410008 and cr40f_dataehorriodesada ge @{outputs('Janela_60d')} and cr40f_statusdefaturamento ne 202410011 and cr40f_statusdefaturamento ne 202410003 and cr40f_statusdefaturamento ne 202410004 and cr40f_statusdefaturamento ne 202410000" 'cr40f_dataehorriodesada asc' $expandRecibos)),
  (Passo 'OPs_pendentes' (Listar 'cr40f_financeiros' $sel.OPs_pendentes 'statecode eq 0 and (cr40f_status eq 100000001 or cr40f_status eq 202410006)' 'createdon asc')),
  (Passo 'Pagamentos_terceiro' (Listar 'cr40f_pagamentoaterceiros' $sel.Pagamentos_terceiro 'statecode eq 0 and (cr40f_status eq 100000002 or cr40f_margemtotal lt 0)' 'createdon asc')),
  (Passo 'OS_contexto' (Selecionar "@outputs('OS_concluidas')?['body/value']" ([ordered]@{
    id = Id 'cr40f_reservadeveculosid'; codigo = "@coalesce(item()?['cr40f_idnovo'], item()?['cr40f_id'], '')"; saida = Txt 'cr40f_dataehorriodesada'
    faturamento = Num 'cr40f_statusdefaturamento'; valorAReceber = Num 'cr40f_valor_a_receber'; temOP = "@not(equals(item()?['_cr40f_financeiro_value'], null))"
    temRecibo = "@greater(length(coalesce(item()?['$navRecibos'], createArray())), 0)"; cliente = Rot '_cr40f_cliente_value'
  }))),
  (Passo 'OPs_contexto' (Selecionar "@outputs('OPs_pendentes')?['body/value']" ([ordered]@{
    id = Id 'cr40f_financeiroid'; codigo = Txt 'cr40f_idfinanceiro'; status = Num 'cr40f_status'; valor = Num 'cr40f_valor'; criadaEm = Txt 'createdon'; cliente = Txt 'new_clientedaop'
  }))),
  (Passo 'Pagamentos_contexto' (Selecionar "@outputs('Pagamentos_terceiro')?['body/value']" ([ordered]@{
    id = Id 'cr40f_pagamentoaterceiroid'; nome = Txt 'cr40f_name'; status = Num 'cr40f_status'; totalRepasse = Num 'cr40f_totalrepasse'; margem = Num 'cr40f_margemtotal'
    criadoEm = Txt 'createdon'; favorecido = Rot '_cr40f_terceirofavorecido_value'
  }))),
  (Passo 'Contexto_fin' (DefinirVar 'Contexto' ([ordered]@{ hoje = "@{outputs('Hoje')}"; osConcluidas = "@body('OS_contexto')"; ops = "@body('OPs_contexto')"; pagamentosTerceiro = "@body('Pagamentos_contexto')" })))
))

$ramoLogistica = Ramo (@(Agente 'logistica' 'log') + @(
  (Passo 'Fim_janela' (Compor "@addDays(outputs('Inicio_do_dia_utc'), 3)")),
  (Passo 'Servicos' (Listar 'cr40f_reservadeveculoses' $sel.Servicos "statecode eq 0 and (cr40f_status eq 202410001 or cr40f_status eq 202410005 or cr40f_status eq 202410006) and cr40f_dataehorriodesada ge @{outputs('Inicio_do_dia_utc')} and cr40f_dataehorriodesada lt @{outputs('Fim_janela')}" 'cr40f_dataehorriodesada asc')),
  (Passo 'Motoristas' (Listar 'cr40f_funcionarioses' $sel.Motoristas 'statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq 202410000' 'new_apelido asc')),
  (Passo 'Trocas' (Listar 'cr40f_trocasdecarros' $sel.Trocas "statecode eq 0 and (cr40f_statusdatroca eq 202410000 or cr40f_statusdatroca eq 100000001) and cr40f_fimdajaneladetroca ge @{outputs('Inicio_do_dia_utc')} and cr40f_iniciodajaneladetroca lt @{outputs('Fim_janela')}" 'cr40f_iniciodajaneladetroca asc')),
  (Passo 'Servicos_contexto' (Selecionar "@outputs('Servicos')?['body/value']" ([ordered]@{
    id = Id 'cr40f_reservadeveculosid'; codigo = "@coalesce(item()?['cr40f_idnovo'], item()?['cr40f_id'], '')"; status = Num 'cr40f_status'; saida = Txt 'cr40f_dataehorriodesada'
    retorno = Txt 'cr40f_horrioprevistoderetorno'; tipoVeiculo = Rot 'cr40f_tipodeveiculo'; destino = Txt 'cr40f_destino'
    motoristaId = Id '_cr40f_motorista_value'; veiculoId = Id '_cr40f_veiculo_value'; cliente = Rot '_cr40f_cliente_value'
  }))),
  (Passo 'Motoristas_contexto' (Selecionar "@outputs('Motoristas')?['body/value']" ([ordered]@{
    id = Id 'cr40f_funcionariosid'; apelido = Txt 'new_apelido'; veiculoAtualId = Id '_cr40f_veiculoatual_value'; veiculoAtual = Rot '_cr40f_veiculoatual_value'
  }))),
  (Passo 'Trocas_contexto' (Selecionar "@outputs('Trocas')?['body/value']" ([ordered]@{
    id = Id 'cr40f_trocasdecarroid'; codigo = Txt 'cr40f_id'; status = Num 'cr40f_statusdatroca'; inicio = Txt 'cr40f_iniciodajaneladetroca'; fim = Txt 'cr40f_fimdajaneladetroca'
    motorista1Id = Id '_cr40f_motorista1_value'; motorista2Id = Id '_cr40f_motorista2_value'
  }))),
  (Passo 'Contexto_log' (DefinirVar 'Contexto' ([ordered]@{ hoje = "@{outputs('Hoje')}"; servicos = "@body('Servicos_contexto')"; motoristas = "@body('Motoristas_contexto')"; trocas = "@body('Trocas_contexto')" })))
))

$ramoPessoas = Ramo (@(Agente 'pessoas' 'pes') + @(
  (Passo 'Fim_90d' (Compor "@addDays(outputs('Inicio_do_dia_utc'), 90)")),
  (Passo 'Fim_10d' (Compor "@addDays(outputs('Inicio_do_dia_utc'), 10)")),
  (Passo 'Funcionarios' (Listar 'cr40f_funcionarioses' $sel.Funcionarios 'statecode eq 0 and cr40f_status eq 0' 'new_apelido asc')),
  (Passo 'Documentos' (Listar 'cr40f_documentos' $sel.Documentos "statecode eq 0 and cr40f_situacao eq 100000000 and _cr40f_funcionario_value ne null and cr40f_validade lt @{outputs('Fim_90d')}" 'cr40f_validade asc')),
  (Passo 'Multas' (Listar 'cr40f_multases' $sel.Multas 'statecode eq 0 and cr40f_status eq 202410000 and _cr40f_motorista_value eq null' 'cr40f_dataparaindicar asc')),
  (Passo 'Comunicados' (Listar 'cr40f_comunicadohomes' $sel.Comunicados 'statecode eq 0 and cr40f_ativo eq true' 'cr40f_inicio desc')),
  (Passo 'Funcionarios_contexto' (Selecionar "@outputs('Funcionarios')?['body/value']" ([ordered]@{
    id = Id 'cr40f_funcionariosid'; apelido = Txt 'new_apelido'; funcao = Num 'cr40f_funcao'; validadeCnh = Dia 'cr40f_validadedacnh'; dataAso = Dia 'cr40f_datadoaso'
    aniversario = Dia 'cr40f_datadeaniversario'; admissao = Dia 'cr40f_datadeadmissao'
  }))),
  (Passo 'Documentos_contexto' (Selecionar "@outputs('Documentos')?['body/value']" ([ordered]@{
    id = Id 'cr40f_documentoid'; nome = Txt 'cr40f_name'; tipo = Rot '_cr40f_tipo_value'; validade = Dia 'cr40f_validade'; funcionarioId = Id '_cr40f_funcionario_value'
  }))),
  (Passo 'Multas_contexto' (Selecionar "@outputs('Multas')?['body/value']" ([ordered]@{
    id = Id 'cr40f_multasid'; codigo = Txt 'cr40f_id_multa'; dataHora = Txt 'cr40f_dataehorario'; prazoIndicacao = Dia 'cr40f_dataparaindicar'
    motoristaId = Id '_cr40f_motorista_value'; placa = Rot '_cr40f_placa_value'
  }))),
  (Passo 'Comunicados_contexto' (Selecionar "@outputs('Comunicados')?['body/value']" ([ordered]@{
    id = Id 'cr40f_comunicadohomeid'; titulo = Txt 'cr40f_titulo'; inicio = Txt 'cr40f_inicio'; fim = Txt 'cr40f_fim'
  }))),
  (Passo 'Contexto_pes' (DefinirVar 'Contexto' ([ordered]@{ hoje = "@{outputs('Hoje')}"; funcionarios = "@body('Funcionarios_contexto')"; documentos = "@body('Documentos_contexto')"; multas = "@body('Multas_contexto')"; comunicados = "@body('Comunicados_contexto')" })))
))

# Frota: as regras rodam na Custom API cr40f_FrotaPendencias (mesmo cálculo da aba Pendências do shell). Prioridade,
# reincidência e custo viram registroAlvo obrigatório (Obrigatorios), conferido depois da resposta da IA.
$ramoFrota = Ramo (@(Agente 'frota' 'fro') + @(
  (Passo 'Pendencias_frota' ([ordered]@{
    type = 'OpenApiConnection'; runAfter = $null
    inputs = [ordered]@{ host = [ordered]@{ apiId = $dvApi; connectionName = 'shared_commondataserviceforapps'; operationId = 'PerformUnboundAction' }; parameters = [ordered]@{ actionName = 'cr40f_FrotaPendencias' }; authentication = "@parameters('`$authentication')" }
  })),
  (Passo 'Dados_frota' (Compor "@json(outputs('Pendencias_frota')?['body/PendenciasJson'])")),
  (Passo 'Obrigatorios_frota' ([ordered]@{ type = 'Query'; runAfter = $null; inputs = [ordered]@{ from = "@outputs('Dados_frota')?['pendencias']"; where = "@contains(createArray('prioridade', 'reincidencia', 'custo'), item()?['tipo'])" } })),
  (Passo 'Ids_obrigatorios' (Selecionar "@body('Obrigatorios_frota')" "@toLower(if(equals(item()?['tipo'], 'prioridade'), coalesce(item()?['manutencaoId'], ''), coalesce(item()?['veiculoId'], '')))")),
  (Passo 'Definir_obrigatorios' (DefinirVar 'Obrigatorios' "@union(body('Ids_obrigatorios'), createArray())")),
  (Passo 'Contexto_fro' (DefinirVar 'Contexto' ([ordered]@{ hoje = "@{outputs('Hoje')}"; pendencias = "@outputs('Dados_frota')?['pendencias']" })))
))

# Mapa tipo -> valor do choice cr40f_tipo (100000000 + índice na ordem financeiro, logística, pessoas, frota; igual à Task 6).
$mapaTipos = [ordered]@{}; $i = 0
foreach ($t in @($const.agentes.financeiro.tipos) + @($const.agentes.logistica.tipos) + @($const.agentes.pessoas.tipos) + @($const.agentes.frota.tipos)) { $mapaTipos[$t] = 100000000 + $i++ }
# O prefixo termina em quebra de linha: dentro do concat('...') ela vira decodeUriComponent('%0A').
$prefixoExpr = $const.prefixoUsuario.Replace("`n", "' , decodeUriComponent('%0A'), '")
$definitionText = $definitionText.Replace('__PARAM_KEY__', $paramKey).Replace('__ENV_VAR__', $envVarName).Replace('__TRIGGER_FILTER__', $triggerFilter).Replace('__LIMITE_DIARIO__', "$LIMITE_DIARIO").Replace('__PREFIXO__', $prefixoExpr)
$definition = $definitionText | ConvertFrom-Json
$escopo = $definition.actions.Escopo_execucao.actions
$escopo.Por_agente.cases.Financeiro.actions = $ramoFinanceiro
$escopo.Por_agente.cases.Logistica.actions = $ramoLogistica
$escopo.Por_agente.cases.Pessoas.actions = $ramoPessoas
$escopo.Por_agente.cases.Frota.actions = $ramoFrota
# Constantes entram como valores JSON (sem concatenação de texto), então aspas e quebras de linha ficam escapadas pelo serializador.
$escopo.Mapa_tipos.inputs = [pscustomobject]$mapaTipos
$body = $escopo.Chamar_Claude.inputs.body
$body.model = $const.modelo
$body.max_tokens = [int]$const.maxTokens
$body.output_config.effort = $const.effort
$body.output_config.format.schema = $const.schema
# Ida e volta pelo JSON: a definição fica toda em PSCustomObject (Conferir e checkFlowErrors leem o mesmo formato).
$definition = ($definition | ConvertTo-Json -Depth 90 -Compress) | ConvertFrom-Json

$definitionJson = $definition | ConvertTo-Json -Depth 90 -Compress
AssertSemMojibake $definitionJson 'definição do script'
if ($definitionJson -match '__[A-Z_]+__') { throw "Marcador não substituído na definição: $($Matches[0])" }
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{ shared_commondataserviceforapps = $dataverse } }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# Conferências da definição: rodam sobre o que foi lido de volta do DEV (e, em -SomenteValidar, sobre a definição montada).
function Conferir($lido) {
  $trigger = $lido.triggers.Quando_execucao_criada
  $tp = $trigger.inputs.parameters
  $a = $lido.actions.Escopo_execucao.actions
  $http = $a.Chamar_Claude
  $erro = $lido.actions.Tratar_erro
  $cases = $a.Por_agente.cases
  $listas = @()
  foreach ($nome in $sel.Keys) { $listas += [pscustomobject]@{ nome = $nome; acao = $cases.($ramoPorAcao[$nome]).actions.$nome } }
  $selectsOk = @($listas | Where-Object { -not ($_.acao -and $_.acao.inputs.host.operationId -eq 'ListRecords' -and $_.acao.inputs.parameters.'$top' -eq 150 -and ($_.acao.inputs.parameters.'$select' -ceq $sel[$_.nome])) }).Count -eq 0
  $camposSensiveis = @($listas | ForEach-Object { $_.acao.inputs.parameters.'$select'.Split(',') } | Where-Object { $_ -match 'cpf|rg$|telefone|phone|email|e-mail|endere|conta' })
  $todosSelects = @(($lido | ConvertTo-Json -Depth 90 -Compress) | Select-String -Pattern '"\$select":"([^"]*)"' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value.Split(',') } | Where-Object { $_ -match 'cpf|telefone|email|endere' })
  $promptsOk = ($cases.Financeiro.actions.Definir_system_fin.inputs.value -ceq $const.agentes.financeiro.systemPrompt) -and ($cases.Logistica.actions.Definir_system_log.inputs.value -ceq $const.agentes.logistica.systemPrompt) -and ($cases.Pessoas.actions.Definir_system_pes.inputs.value -ceq $const.agentes.pessoas.systemPrompt) -and ($cases.Frota.actions.Definir_system_fro.inputs.value -ceq $const.agentes.frota.systemPrompt)
  $listasAgenteOk = $true
  foreach ($par in @(@('Financeiro', 'fin', 'financeiro'), @('Logistica', 'log', 'logistica'), @('Pessoas', 'pes', 'pessoas'), @('Frota', 'fro', 'frota'))) {
    $acts = $cases.($par[0]).actions
    if (((@($acts."Definir_tipos_$($par[1])".inputs.value) -join ',') -cne (@($const.agentes.($par[2]).tipos) -join ',')) -or ((@($acts."Definir_acoes_$($par[1])".inputs.value) -join ',') -cne (@($const.agentes.($par[2]).acoes) -join ','))) { $listasAgenteOk = $false }
  }
  $checks = [ordered]@{
    'gatilho message 1 (Create), entityname cr40f_agenteexecucao, scope 4' = $tp.'subscriptionRequest/message' -eq 1 -and $tp.'subscriptionRequest/entityname' -eq 'cr40f_agenteexecucao' -and $tp.'subscriptionRequest/scope' -eq 4
    'gatilho com filtro cr40f_status eq 100000000' = $tp.'subscriptionRequest/filterexpression' -ceq $triggerFilter
    'concurrency.runs = 1' = $trigger.runtimeConfiguration.concurrency.runs -eq 1
    'Chamar_Claude secureData inputs e outputs' = (@($http.runtimeConfiguration.secureData.properties) -join ',') -eq 'inputs,outputs'
    'Chamar_Claude retry exponencial 2x' = $http.inputs.retryPolicy.type -eq 'exponential' -and $http.inputs.retryPolicy.count -eq 2
    'Chamar_Claude timeout PT110S' = $http.limit.timeout -eq 'PT110S'
    'Chamar_Claude chave pela variável' = $http.inputs.headers.'x-api-key' -eq "@parameters('$paramKey')"
    'Chamar_Claude fallbacks e header beta' = $http.inputs.body.fallbacks -ceq 'default' -and $http.inputs.headers.'anthropic-beta' -ceq 'server-side-fallback-2026-07-01'
    'Chamar_Claude constantes (model, max_tokens, effort, schema)' = $http.inputs.body.model -ceq $const.modelo -and $http.inputs.body.max_tokens -eq $const.maxTokens -and $http.inputs.body.output_config.effort -ceq $const.effort -and (($http.inputs.body.output_config.format.schema | ConvertTo-Json -Depth 30 -Compress) -ceq ($const.schema | ConvertTo-Json -Depth 30 -Compress))
    'Chamar_Claude system pela variável' = $http.inputs.body.system -ceq "@variables('System_prompt')"
    'Texto_usuario com prefixo e decodeUriComponent' = $a.Texto_usuario.inputs.Contains("concat('$prefixoExpr', string(variables('Contexto')))")
    'Definir_system_* com o texto exato dos prompts' = $promptsOk
    'Definir_tipos_*/Definir_acoes_* iguais às constantes' = $listasAgenteOk
    'Mapa_tipos com 21 chaves' = @($a.Mapa_tipos.inputs.PSObject.Properties).Count -eq 21
    'Limite diário de 20' = $a.Limite_diario.expression.and[0].greaterOrEquals[1] -eq $LIMITE_DIARIO -and $a.Limite_diario.actions.Motivo_limite.inputs.value -ceq "Limite diário de $LIMITE_DIARIO execuções deste agente atingido."
    'Tratar_erro após Failed/TimedOut' = (@($erro.runAfter.Escopo_execucao) -join ',') -eq 'Failed,TimedOut'
    'Tratar_erro grava Erro (100000003)' = $erro.actions.Gravar_erro.inputs.parameters.'item/cr40f_status' -eq 100000003
    'Criar_propostas depois de Mapa_prioridade (após todas as travas)' = (@($a.Criar_propostas.runAfter.Mapa_prioridade) -join ',') -eq 'Succeeded' -and (@($a.Mapa_tipos.runAfter.Com_obrigatorio_faltando) -join ',') -eq 'Succeeded' -and (@($a.Alvos_propostos.runAfter.Com_alvo_invalido) -join ',') -eq 'Succeeded'
    'Criar_proposta vincula cr40f_Execucao' = $a.Criar_propostas.actions.Criar_proposta.inputs.parameters.'item/cr40f_Execucao@odata.bind' -ceq "@concat('/cr40f_agenteexecucaos(', triggerOutputs()?['body/cr40f_agenteexecucaoid'], ')')"
    'ListRecords dos ramos com $top 150 e $select exatos' = $selectsOk
    'OS_concluidas expande os recibos ativos e não há lista Recibos separada' = $cases.Financeiro.actions.OS_concluidas.inputs.parameters.'$expand' -ceq $expandRecibos -and -not ($cases.Financeiro.actions.PSObject.Properties.Name -contains 'Recibos') -and -not ($cases.Financeiro.actions.PSObject.Properties.Name -contains 'Ids_com_recibo')
    'temRecibo pelo $expand de OS_concluidas' = $cases.Financeiro.actions.OS_contexto.inputs.select.temRecibo -ceq "@greater(length(coalesce(item()?['$navRecibos'], createArray())), 0)"
    'nenhum $select com CPF, RG, conta, telefone, e-mail ou endereço' = ($camposSensiveis.Count -eq 0) -and ($todosSelects.Count -eq 0)
    'Marcar_processando dentro do escopo' = $null -ne $a.Marcar_processando -and -not ($lido.actions.PSObject.Properties.Name -contains 'Marcar_processando')
  }
  $falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
  if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
  $checks.Keys | ForEach-Object { Write-Host "[agentes-executar] ok: $_" }
}

$flows = @(FlowRows)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($SomenteValidar) {
  # Validação do Power Automate (checkFlowErrors) sobre a definição montada, sem gravar nada.
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
  if ($atual -ne $novo -and -not $temValor) { throw "A definição mudou, mas o Power Automate só aceita gravar este flow quando $envVarName tiver valor no DEV. Preencha o valor e rode de novo (use -SomenteValidar para conferir a definição antes)." }
  if ($atual -ne $novo) {
    Backup $flows[0]
    Apply $flows[0] $clientData
  } else { Write-Host '[agentes-executar] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Executa o assistente de departamento (Financeiro, Logística, Pessoas, Frota) com a API do Claude quando uma cr40f_agenteexecucao é criada como Pendente; grava as propostas ou Erro com o motivo.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1 -and $temValor) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null }

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=statecode,clientdata"
if ($temValor -and $row.statecode -ne 1) { throw 'Flow não ativou.' }
AssertSemMojibake $row.clientdata 'clientdata gravado'
Conferir (($row.clientdata | ConvertFrom-Json).properties.definition)
if (-not @((Dv GET "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq 29 and objectid eq $flowId").value).Count) { throw 'Flow fora da AppBetinhos.' }
if (-not $temValor) {
  Write-Output "DEV: '$flowName' gravado e DESLIGADO ($flowId), na $solutionName. Preencha o valor de $envVarName no DEV (Soluções > $solutionName > Variáveis de ambiente) e rode este script de novo para ativar."
  return
}
Write-Output "DEV: '$flowName' ativo ($flowId), na $solutionName; $envVarName na solução, sem valor padrão."
