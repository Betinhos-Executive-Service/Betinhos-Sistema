# Somente DEV. Cria (ou atualiza) o flow HTTP "Flow Despesas | Conferência no envio" e a variável de ambiente
# new_FlowURLDespesaConferenciaEnvio (URL do gatilho) na solução AppBetinhos, e ativa o flow.
#
# O App Motoristas manda, ao tocar Enviar, o gasto, os "sinais" que ele mesmo calculou (acima da política, repetição,
# refeição sem serviço, data x cupom), os gastos recentes e os serviços do dia. O flow chama o Claude (Haiku, saída
# estruturada) e responde em até ~10 s com { ok, resultado, pergunta, motivos }. Nada é gravado no Dataverse.
# Erro de modelo, timeout ou resposta inválida vira { ok: false, erro: 'conferencia_indisponivel' } e o app envia sem
# a pergunta. As travas são as mesmas de interpretarConferencia (packages/despesas-ia/src/conferencia-envio/resposta.ts).
# Spec: App Motoristas docs/superpowers/specs/2026-11-05-conferencia-envio-despesa-design.md
#
# Constantes vêm de packages/despesas-ia/dist/constantes-conferencia-envio.json. Gere antes:
#   pnpm --filter @betinhos/despesas-ia constantes
# A chave da API é a mesma da leitura rápida (new_AnthropicKeyDespesasLeitura); este script nunca lê nem imprime o valor.
# A URL do gatilho (assinada, sig=) é gravada na variável sem ser impressa; o log mostra só o host.
#
# Antes de alterar o flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-despesas-conferencia-envio.ps1 -Restaurar <arquivo de backup>
# Para montar e conferir a definição sem rede e sem gravar nada:
#   powershell -File packages/deploy/provision-flow-despesas-conferencia-envio.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV e ao Power Automate.
param([string] $Restaurar = '', [switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow Despesas | Conferência no envio'
$keyVarName = 'new_AnthropicKeyDespesasLeitura'
$paramKey = "Anthropic Key - Despesas Leitura Rápida ($keyVarName)"
$urlVarName = 'new_FlowURLDespesaConferenciaEnvio'
$urlVarDisplay = 'Flow URL Despesa Conferência no Envio'
$constantesPath = Join-Path $PSScriptRoot '../despesas-ia/dist/constantes-conferencia-envio.json'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}

# Constantes do pacote @betinhos/despesas-ia. Strings com @ seriam lidas como expressão pelo Logic Apps: recusa.
if (-not (Test-Path $constantesPath)) { throw 'constantes-conferencia-envio.json ausente: rode pnpm --filter @betinhos/despesas-ia constantes.' }
$constantesText = [IO.File]::ReadAllText((Resolve-Path $constantesPath), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
if ($constantesText.Contains('@')) { throw 'constantes-conferencia-envio.json contém @; escape antes de embutir no flow.' }
AssertSemMojibake $constantesText 'constantes-conferencia-envio.json'
$const = $constantesText | ConvertFrom-Json
foreach ($campo in 'modelo', 'maxTokens', 'effort', 'thinking', 'systemPrompt', 'textoUsuario', 'limiteCorpo', 'schema') { if ($null -eq $const.$campo) { throw "constantes-conferencia-envio.json sem $campo." } }
$triggerCondition = "@and(greater(length(coalesce(triggerBody()?['sinais'], json('[]'))), 0), lessOrEquals(length(string(triggerBody())), $([int]$const.limiteCorpo)))"

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
          "properties": { "sinais": { "type": "array" }, "gasto": { "type": "object" } },
          "required": [ "sinais", "gasto" ]
        }
      }
    }
  },
  "actions": {
    "Tentar": {
      "type": "Scope", "runAfter": {},
      "actions": {
        "Chamar_Claude": {
          "type": "Http", "runAfter": {},
          "limit": { "timeout": "PT10S" },
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
              "output_config": { "effort": "__EFFORT__", "format": { "type": "json_schema", "schema": {} } },
              "messages": [ { "role": "user", "content": [ { "type": "text", "text": "__TEXTO_USUARIO__" } ] } ]
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
        "Conferencia": {
          "type": "Compose", "runAfter": { "Blocos_de_texto": ["Succeeded"] },
          "inputs": "@json(first(body('Blocos_de_texto'))?['text'])"
        },
        "Conferencia_invalida": {
          "type": "If", "runAfter": { "Conferencia": ["Succeeded"] },
          "expression": { "or": [
            { "not": { "equals": [ "@or(equals(outputs('Conferencia')?['resultado'], 'sem_duvida'), equals(outputs('Conferencia')?['resultado'], 'duvida'))", true ] } },
            { "not": { "equals": [ "@or(equals(outputs('Conferencia')?['resultado'], 'sem_duvida'), greaterOrEquals(length(trim(string(coalesce(outputs('Conferencia')?['pergunta'], '')))), 10))", true ] } }
          ] },
          "actions": { "Falhar_invalida": { "type": "Compose", "runAfter": {}, "inputs": "@int('Conferencia invalida')" } },
          "else": { "actions": {} }
        },
        "Responder_ok": {
          "type": "Response", "kind": "Http", "runAfter": { "Conferencia_invalida": ["Succeeded"] },
          "inputs": {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            "body": {
              "ok": true,
              "resultado": "@outputs('Conferencia')?['resultado']",
              "pergunta": "@if(equals(outputs('Conferencia')?['resultado'], 'duvida'), trim(string(outputs('Conferencia')?['pergunta'])), null)",
              "motivos": "@if(equals(outputs('Conferencia')?['resultado'], 'duvida'), coalesce(outputs('Conferencia')?['motivos'], json('[]')), json('[]'))"
            }
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
            "body": { "ok": false, "erro": "conferencia_indisponivel" }
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
$body.output_config.format.schema = $const.schema
$body.messages[0].content[0].text = "$($const.textoUsuario)`n@{string(triggerBody())}"
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
    'gatilho com campos obrigatórios' = (@($trigger.inputs.schema.required) -join ',') -eq 'sinais,gasto'
    'condição de gatilho (sinais presentes e limite)' = @($trigger.conditions).Count -eq 1 -and $trigger.conditions[0].expression -ceq $triggerCondition
    'Chamar_Claude chave pela variável' = $http.inputs.headers.'x-api-key' -eq "@parameters('$paramKey')"
    'Chamar_Claude modelo claude-haiku-5-5' = $http.inputs.body.model -ceq 'claude-haiku-5-5' -and $http.inputs.body.model -ceq $const.modelo
    'Chamar_Claude constantes' = $http.inputs.body.max_tokens -eq $const.maxTokens -and $http.inputs.body.system -ceq $const.systemPrompt -and $http.inputs.body.output_config.effort -ceq $const.effort -and $http.inputs.body.messages[0].content[0].text -ceq "$($const.textoUsuario)`n@{string(triggerBody())}"
    'Chamar_Claude sem raciocínio (thinking disabled)' = $http.inputs.body.thinking.type -ceq 'disabled' -and $http.inputs.body.thinking.type -ceq $const.thinking.type
    'Chamar_Claude schema da conferência' = $http.inputs.body.output_config.format.type -eq 'json_schema' -and ($http.inputs.body.output_config.format.schema | ConvertTo-Json -Depth 20 -Compress) -ceq ($const.schema | ConvertTo-Json -Depth 20 -Compress)
    'Conferência pega o primeiro bloco de texto' = $t.Blocos_de_texto.type -eq 'Query' -and $t.Conferencia.inputs -ceq "@json(first(body('Blocos_de_texto'))?['text'])"
    'Chamar_Claude secureData inputs e outputs' = (@($http.runtimeConfiguration.secureData.properties) -join ',') -eq 'inputs,outputs'
    'Chamar_Claude sem retry' = $http.inputs.retryPolicy.type -eq 'none'
    'Chamar_Claude timeout PT10S' = $http.limit.timeout -eq 'PT10S'
    'dúvida exige pergunta' = ($t.Conferencia_invalida.expression | ConvertTo-Json -Depth 10 -Compress) -like '*greaterOrEquals(length(trim(*'
    'Responder_ok 200 com CORS' = $t.Responder_ok.inputs.statusCode -eq 200 -and $t.Responder_ok.inputs.headers.'Access-Control-Allow-Origin' -eq '*' -and $t.Responder_ok.inputs.body.ok -eq $true
    'Falhou após Failed/TimedOut/Skipped' = (@($lido.actions.Falhou.runAfter.Tentar) -join ',') -eq 'Failed,TimedOut,Skipped'
    'Responder_erro sem detalhe da API' = ($lido.actions.Falhou.actions.Responder_erro.inputs.body | ConvertTo-Json -Compress) -ceq '{"ok":false,"erro":"conferencia_indisponivel"}'
  }
  $falhas = @($checks.Keys | Where-Object { -not $checks[$_] })
  if ($falhas.Count) { throw "Conferência falhou: $($falhas -join '; ')" }
  $checks.Keys | ForEach-Object { Write-Host "[conferencia-envio] ok: $_" }
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
  Write-Host "[conferencia-envio] $Method $($Path.Split('?')[0])"
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
  $file = Join-Path $backupDir ("Flow-Despesas-Conferencia-Envio-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[conferencia-envio] backup: $file"
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
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Tentar.actions.Conferencia_invalida) { throw 'O arquivo não é um backup deste flow.' }
  $rows = @(FlowRows)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  Backup $rows[0]
  Apply $rows[0] $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar."
  return
}

# Chave da API: cria a definição se faltar e confere que há valor (padrão ou atual) sem trazer o valor.
$keyDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$keyVarName'").value)
if (-not $keyDefs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $keyVarName; displayname = 'Anthropic Key - Despesas Leitura Rápida'; type = 100000000; description = 'Chave da API do Claude (workspace Despesas Leitura) usada pelo Flow Despesas | Leitura rápida. Chave no valor padrão.' } | Out-Null
  $keyDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$keyVarName'").value)
}
if ($keyDefs.Count -ne 1) { throw "Variável $keyVarName ausente ou duplicada no DEV." }
$keyId = $keyDefs[0].environmentvariabledefinitionid
Include $keyId 380
$keyPadrao = [bool]@((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$keyVarName' and defaultvalue ne null").value).Count
if (-not $keyPadrao -and -not @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $keyId").value).Count) { throw "Variável $keyVarName sem valor no DEV; cole a chave no valor padrão (Soluções > $solutionName > Variáveis de ambiente) e rode de novo." }

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
  } else { Write-Host '[conferencia-envio] definição já atualizada; nada a gravar.' }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Conferência da despesa no envio do App Motoristas com a API do Claude (Haiku). Responde ao app se há dúvida e a pergunta; não grava nada no Dataverse.' } | Out-Null
  $flowId = @(FlowRows)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode"
# No CI (Deploy), flow existente desligado no DEV continua desligado: quem desliga é decisão de operação.
$manterDesligado = ($env:GITHUB_ACTIONS -eq 'true') -and $flows.Count -and $flows[0].statecode -ne 1
if ($flow.statecode -ne 1 -and -not $manterDesligado) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode" }
if ($flow.statecode -ne 1 -and -not $manterDesligado) { throw 'Flow não ativou.' }

# Conferência por leitura de volta (UTF-8): o que está gravado no DEV é o que este script exige.
$row = Dv GET "workflows($flowId)?`$select=clientdata"
AssertSemMojibake $row.clientdata 'clientdata gravado'
Conferir (($row.clientdata | ConvertFrom-Json).properties.definition)

# No CI a URL do gatilho de um flow existente não muda: não lê nem regrava a variável.
if ($env:GITHUB_ACTIONS -eq 'true') { Write-Output 'URL do gatilho mantida: flow existente.'; Write-Output "DEV: '$flowName' $(if ($manterDesligado) { 'mantido desligado' } else { 'ativo' }) ($flowId), na $solutionName."; return }
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
Write-Host "[conferencia-envio] gatilho: https://$(([Uri]$callback).Host)/... (sig=***)"

$urlDefs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$urlVarName'").value)
if (-not $urlDefs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $urlVarName; displayname = $urlVarDisplay; type = 100000000; description = 'URL do gatilho HTTP do Flow Despesas | Conferência no envio, usada pelo App Motoristas. Valor só no ambiente.' } | Out-Null
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
