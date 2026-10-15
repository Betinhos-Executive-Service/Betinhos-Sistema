# Somente DEV. Cria (ou atualiza) o flow HTTP "Flow Despesas | Leitura rápida" e a variável de ambiente
# new_FlowURLDespesaLeituraRapida (URL do gatilho) na solução AppBetinhos, e ativa o flow.
#
# O App Motoristas envia a foto do comprovante (JPEG reduzido a 1600 px, base64) com as listas de categorias e formas de
# pagamento; o flow chama a API do Claude (Haiku, saída estruturada) e responde em até ~8 s com { ok, leitura }.
# Nada é gravado no Dataverse. Erro de modelo, timeout ou resposta inválida vira { ok: false, erro: 'leitura_indisponivel' }.
# As travas são as mesmas de interpretarLeitura (packages/despesas-ia/src/leitura-rapida/resposta.ts).
#
# Constantes (modelo, max_tokens, effort, thinking, system prompt, texto do usuário, limite de base64) vêm de
# packages/despesas-ia/dist/constantes-leitura-rapida.json. Gere antes: pnpm --filter @betinhos/despesas-ia constantes
# A chave da API fica só na variável new_AnthropicApiKey (valor atual no DEV); este script nunca lê nem imprime o valor.
# A URL do gatilho (assinada, sig=) é gravada na variável sem ser impressa; o log mostra só o host.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-despesas-leitura-rapida.ps1 -Restaurar <arquivo de backup>
# Para montar e conferir a definição sem rede e sem gravar nada:
#   powershell -File packages/deploy/provision-flow-despesas-leitura-rapida.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV e ao Power Automate.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Despesas | Leitura rápida'
$keyVarName = 'new_AnthropicApiKey'
$paramKey = "Anthropic API Key ($keyVarName)"
$urlVarName = 'new_FlowURLDespesaLeituraRapida'
$urlVarDisplay = 'Flow URL Despesa Leitura Rápida'
$constantesPath = Join-Path $PSScriptRoot '../despesas-ia/dist/constantes-leitura-rapida.json'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}

# Constantes do pacote @betinhos/despesas-ia. Strings com @ seriam lidas como expressão pelo Logic Apps: recusa.
if (-not (Test-Path $constantesPath)) { throw 'constantes-leitura-rapida.json ausente: rode pnpm --filter @betinhos/despesas-ia constantes.' }
$constantesText = [IO.File]::ReadAllText((Resolve-Path $constantesPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
if ($constantesText.Contains('@')) { throw 'constantes-leitura-rapida.json contém @; escape antes de embutir no flow.' }
AssertSemMojibake $constantesText 'constantes-leitura-rapida.json'
$const = $constantesText | ConvertFrom-Json
foreach ($campo in 'modelo', 'maxTokens', 'effort', 'thinking', 'systemPrompt', 'textoUsuario', 'limiteBase64') { if ($null -eq $const.$campo) { throw "constantes-leitura-rapida.json sem $campo." } }
$triggerCondition = "@and(not(empty(triggerBody()?['imagemBase64'])), lessOrEquals(length(triggerBody()?['imagemBase64']), $([int]$const.limiteBase64)))"

# Travas no Tentar: cada uma falha de propósito (int() de texto), o que faz o escopo falhar e o Falhou responder ok:false.
$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "__PARAM_KEY__": { "defaultValue": "", "type": "String", "metadata": { "schemaName": "__KEY_VAR__" } }
  },
  "triggers": {
    "manual": {
      "type": "Request", "kind": "Http",
      "conditions": [ { "expression": "__TRIGGER_CONDITION__" } ],
      "inputs": {
        "triggerAuthenticationType": "All",
        "method": "POST",
        "schema": {
          "type": "object",
          "properties": {
            "imagemBase64": { "type": "string" },
            "mime": { "type": "string" },
            "categorias": { "type": "array", "items": { "type": "string" } },
            "formasPagamento": { "type": "array", "items": { "type": "string" } }
          },
          "required": [ "imagemBase64", "mime", "categorias", "formasPagamento" ]
        }
      }
    }
  },
  "actions": {
    "Tentar": {
      "type": "Scope", "runAfter": {},
      "actions": {
        "Montar_schema": {
          "type": "Compose", "runAfter": {},
          "inputs": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "legivel": { "type": "boolean" },
              "valor": { "anyOf": [ { "type": "number" }, { "type": "null" } ] },
              "data": { "anyOf": [ { "type": "string", "format": "date" }, { "type": "null" } ] },
              "hora": { "anyOf": [ { "type": "string" }, { "type": "null" } ] },
              "estabelecimento": { "anyOf": [ { "type": "string" }, { "type": "null" } ] },
              "cnpj": { "anyOf": [ { "type": "string" }, { "type": "null" } ] },
              "litros": { "anyOf": [ { "type": "number" }, { "type": "null" } ] },
              "categoria_sugerida": { "anyOf": [ { "type": "string", "enum": "@triggerBody()?['categorias']" }, { "type": "null" } ] },
              "forma_pagamento_sugerida": { "anyOf": [ { "type": "string", "enum": "@triggerBody()?['formasPagamento']" }, { "type": "null" } ] },
              "motivo_ilegivel": { "anyOf": [ { "type": "string" }, { "type": "null" } ] }
            },
            "required": [ "legivel", "valor", "data", "hora", "estabelecimento", "cnpj", "litros", "categoria_sugerida", "forma_pagamento_sugerida", "motivo_ilegivel" ]
          }
        },
        "Chamar_Claude": {
          "type": "Http", "runAfter": { "Montar_schema": ["Succeeded"] },
          "limit": { "timeout": "PT8S" },
          "runtimeConfiguration": { "secureData": { "properties": ["inputs", "outputs"] } },
          "inputs": {
            "method": "POST",
            "uri": "https://api.anthropic.com/v1/messages",
            "headers": {
              "x-api-key": "@parameters('__PARAM_KEY__')",
              "anthropic-version": "2023-06-01",
              "content-type": "application/json"
            },
            "body": {
              "model": "__MODELO__",
              "max_tokens": 0,
              "system": "__SYSTEM__",
              "thinking": {},
              "output_config": { "effort": "__EFFORT__", "format": { "type": "json_schema", "schema": "@outputs('Montar_schema')" } },
              "messages": [ {
                "role": "user",
                "content": [
                  { "type": "image", "source": { "type": "base64", "media_type": "@{triggerBody()?['mime']}", "data": "@{triggerBody()?['imagemBase64']}" } },
                  { "type": "text", "text": "__TEXTO_USUARIO__" }
                ]
              } ]
            },
            "retryPolicy": { "type": "none" }
          }
        },
        "Fim_incompleto": {
          "type": "If", "runAfter": { "Chamar_Claude": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@body('Chamar_Claude')?['stop_reason']", "end_turn" ] } } ] },
          "actions": { "Falhar_incompleto": { "type": "Compose", "runAfter": {}, "inputs": "@int('Resposta incompleta')" } },
          "else": { "actions": {} }
        },
        "Blocos_de_texto": {
          "type": "Query", "runAfter": { "Fim_incompleto": ["Succeeded"] },
          "inputs": { "from": "@body('Chamar_Claude')?['content']", "where": "@equals(item()?['type'], 'text')" }
        },
        "Leitura": {
          "type": "Compose", "runAfter": { "Blocos_de_texto": ["Succeeded"] },
          "inputs": "@json(first(body('Blocos_de_texto'))?['text'])"
        },
        "Leitura_invalida": {
          "type": "If", "runAfter": { "Leitura": ["Succeeded"] },
          "expression": { "or": [
            { "not": { "equals": [ "@or(equals(outputs('Leitura')?['legivel'], true), equals(outputs('Leitura')?['legivel'], false))", true ] } },
            { "not": { "equals": [ "@or(equals(outputs('Leitura')?['valor'], null), greater(coalesce(outputs('Leitura')?['valor'], 1), 0))", true ] } },
            { "not": { "equals": [ "@or(equals(outputs('Leitura')?['data'], null), and(equals(length(string(coalesce(outputs('Leitura')?['data'], ''))), 10), equals(substring(concat(string(coalesce(outputs('Leitura')?['data'], '')), '0000000000'), 4, 1), '-'), equals(substring(concat(string(coalesce(outputs('Leitura')?['data'], '')), '0000000000'), 7, 1), '-')))", true ] } }
          ] },
          "actions": { "Falhar_invalida": { "type": "Compose", "runAfter": {}, "inputs": "@int('Leitura invalida')" } },
          "else": { "actions": {} }
        },
        "Leitura_final": {
          "type": "Compose", "runAfter": { "Leitura_invalida": ["Succeeded"] },
          "inputs": "@if(and(equals(outputs('Leitura')?['legivel'], true), or(equals(outputs('Leitura')?['valor'], null), equals(outputs('Leitura')?['data'], null))), setProperty(setProperty(outputs('Leitura'), 'legivel', false), 'motivo_ilegivel', 'Valor ou data não identificados.'), outputs('Leitura'))"
        },
        "Responder_ok": {
          "type": "Response", "kind": "Http", "runAfter": { "Leitura_final": ["Succeeded"] },
          "inputs": {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            "body": { "ok": true, "leitura": "@outputs('Leitura_final')" }
          }
        }
      }
    },
    "Falhou": {
      "type": "Scope", "runAfter": { "Tentar": ["Failed", "TimedOut", "Skipped"] },
      "actions": {
        "Responder_erro": {
          "type": "Response", "kind": "Http", "runAfter": {},
          "inputs": {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            "body": { "ok": false, "erro": "leitura_indisponivel" }
          }
        }
      }
    }
  },
  "outputs": {}
}
'@
$definitionText = $definitionText.Replace('__PARAM_KEY__', $paramKey).Replace('__KEY_VAR__', $keyVarName).Replace('__TRIGGER_CONDITION__', $triggerCondition)
$definition = $definitionText | ConvertFrom-Json
# Constantes entram como valores JSON (sem concatenação de texto), então aspas e quebras de linha ficam escapadas pelo serializador.
$body = $definition.actions.Tentar.actions.Chamar_Claude.inputs.body
$body.model = $const.modelo
$body.max_tokens = [int]$const.maxTokens
$body.system = $const.systemPrompt
$body.output_config.effort = $const.effort
$body.thinking = $const.thinking
$body.messages[0].content[1].text = $const.textoUsuario
$definitionJson = $definition | ConvertTo-Json -Depth 90 -Compress
AssertSemMojibake $definitionJson 'definição do script'
if ($definitionJson -match '__[A-Z_]+__') { throw "Marcador não substituído na definição: $($Matches[0])" }
if ($definitionJson -match 'sig=') { throw 'A definição contém URL assinada.' }
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{} }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

function Conferir($lido) {
  $trigger = $lido.triggers.manual
  $t = $lido.actions.Tentar.actions
  $http = $t.Chamar_Claude
  $checks = [ordered]@{
    'gatilho HTTP POST' = $trigger.type -eq 'Request' -and $trigger.inputs.method -eq 'POST'
    'gatilho com campos obrigatórios' = (@($trigger.inputs.schema.required) -join ',') -eq 'imagemBase64,mime,categorias,formasPagamento'
    'condição de gatilho (imagem presente e limite)' = @($trigger.conditions).Count -eq 1 -and $trigger.conditions[0].expression -ceq $triggerCondition
    'Chamar_Claude chave pela variável' = $http.inputs.headers.'x-api-key' -eq "@parameters('$paramKey')"
    'Chamar_Claude modelo claude-haiku-5-5' = $http.inputs.body.model -ceq 'claude-haiku-5-5' -and $http.inputs.body.model -ceq $const.modelo
    'Chamar_Claude constantes' = $http.inputs.body.max_tokens -eq $const.maxTokens -and $http.inputs.body.system -ceq $const.systemPrompt -and $http.inputs.body.output_config.effort -ceq $const.effort -and $http.inputs.body.messages[0].content[1].text -ceq $const.textoUsuario
    'Chamar_Claude sem raciocínio (thinking disabled)' = $http.inputs.body.thinking.type -ceq 'disabled' -and $http.inputs.body.thinking.type -ceq $const.thinking.type
    'Leitura pega o primeiro bloco de texto (nunca first(content))' = $t.Blocos_de_texto.type -eq 'Query' -and $t.Blocos_de_texto.inputs.from -ceq "@body('Chamar_Claude')?['content']" -and $t.Blocos_de_texto.inputs.where -ceq "@equals(item()?['type'], 'text')" -and $t.Leitura.inputs -ceq "@json(first(body('Blocos_de_texto'))?['text'])"
    'Chamar_Claude schema dinâmico' = $http.inputs.body.output_config.format.type -eq 'json_schema' -and $http.inputs.body.output_config.format.schema -ceq "@outputs('Montar_schema')"
    'Chamar_Claude secureData inputs e outputs' = (@($http.runtimeConfiguration.secureData.properties) -join ',') -eq 'inputs,outputs'
    'Chamar_Claude sem retry' = $http.inputs.retryPolicy.type -eq 'none'
    'Chamar_Claude timeout PT8S' = $http.limit.timeout -eq 'PT8S'
    'legível exige valor e data' = $t.Leitura_final.inputs -like "*setProperty(setProperty(outputs('Leitura'), 'legivel', false)*"
    'Responder_ok 200 com CORS' = $t.Responder_ok.inputs.statusCode -eq 200 -and $t.Responder_ok.inputs.headers.'Access-Control-Allow-Origin' -eq '*' -and $t.Responder_ok.inputs.body.ok -eq $true
    'Falhou após Failed/TimedOut/Skipped' = (@($lido.actions.Falhou.runAfter.Tentar) -join ',') -eq 'Failed,TimedOut,Skipped'
    'Responder_erro sem detalhe da API' = ($lido.actions.Falhou.actions.Responder_erro.inputs.body | ConvertTo-Json -Compress) -ceq '{"ok":false,"erro":"leitura_indisponivel"}'
  }
  $falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
  if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
  $checks.Keys | ForEach-Object { Write-Host "[leitura-rapida] ok: $_" }
}

if ($SomenteValidar) {
  Conferir $definition
  Write-Output "Definição de '$flowName' montada e conferida (sem rede, nada gravado)."
  return
}

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[leitura-rapida] $Method $($Path.Split('?')[0])"
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
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-Despesas-Leitura-Rapida-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[leitura-rapida] backup: $file"
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
function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Tentar.actions.Chamar_Claude) { throw 'O arquivo não é um backup deste flow.' }
  $rows = @(FlowRows)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  Backup $rows[0]
  Apply $rows[0] $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar."
  return
}

# Chave da API: confere a definição e a existência de valor sem trazer o valor.
$keyDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$keyVarName'").value)
if ($keyDefs.Count -ne 1) { throw "Variável $keyVarName ausente no DEV." }
$keyId = $keyDefs[0].environmentvariabledefinitionid
if (-not @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $keyId").value).Count) { throw "Variável $keyVarName sem valor atual no DEV; o flow não ativaria." }

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
  } else { Write-Host '[leitura-rapida] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Leitura rápida do comprovante de despesa do App Motoristas com a API do Claude (Haiku). Responde a leitura ao app; não grava nada no Dataverse.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou.' }

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=clientdata"
AssertSemMojibake $row.clientdata 'clientdata gravado'
Conferir (($row.clientdata | ConvertFrom-Json).properties.definition)

# URL do gatilho: lida do Power Automate e gravada na variável sem ser impressa.
$flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
$callback = $null
for ($i = 1; $i -le 3 -and -not $callback; $i++) {
  try {
    $callback = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flow.resourceid)/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json' -Body '{}' -TimeoutSec 30).response.value
  } catch { if ($i -eq 3) { throw }; Start-Sleep -Seconds 3 }
}
if (-not $callback) { throw 'URL do gatilho indisponível.' }
Write-Host "[leitura-rapida] gatilho: https://$(([Uri]$callback).Host)/... (sig=***)"

$urlDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$urlVarName'").value)
if (-not $urlDefs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $urlVarName; displayname = $urlVarDisplay; type = 100000000; description = 'URL do gatilho HTTP do Flow Despesas | Leitura rápida, usada pelo App Motoristas. Valor só no ambiente.' } | Out-Null
  $urlDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$urlVarName'").value)
}
if ($urlDefs.Count -ne 1) { throw "Variável $urlVarName ausente ou duplicada." }
$urlDefId = $urlDefs[0].environmentvariabledefinitionid
Include $urlDefId 380
# O valor atual (URL assinada do DEV) fica fora da solução para não ir no export para outros ambientes.
$values = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $urlDefId").value)
if ($values.Count -gt 1) { throw 'Variável com valores ambíguos.' }
if ($values.Count) { Dv PATCH "environmentvariablevalues($($values[0].environmentvariablevalueid))" @{ value = $callback } | Out-Null }
else { Dv POST environmentvariablevalues @{ value = $callback; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($urlDefId)" } | Out-Null }
$conferido = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $urlDefId and value ne null").value).Count
if ($conferido -ne 1) { throw "Variável $urlVarName sem valor após gravar." }
$callback = $null
Write-Output "DEV: '$flowName' ativo ($flowId), na $solutionName; $urlVarName com valor (não impresso)."
