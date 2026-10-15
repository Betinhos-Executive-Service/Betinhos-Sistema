# Cria (ou atualiza) no DEV o flow HTTP "Flow - Consultar Arquivo OneDrive" e a variável de ambiente
# new_URLFlowConsultarArquivoOneDrive, na solução AppBetinhos. Usado pela prévia dos comprovantes de
# Despesas operacionais: recebe o id do item do OneDrive (cr40f_driveitemid) ou, nos comprovantes antigos
# que só têm o link de compartilhamento (cr40f_sharelink), o link; devolve o conteúdo em base64, no mesmo
# formato do "Flow - Consultar Arquivos Sharepoint" do Planner. Só lê arquivos dentro de /Despesas/.
# Comprovantes novos (gravados no SharePoint do site BetinhosGestoInterna) chegam com origem = 'sharepoint' e
# id = ItemId da biblioteca "Documentos Compartilhados": o ramo ViaSharePoint lê as propriedades do item
# (GetFileItem), confere a pasta Despesas e devolve o conteúdo (GetFileContent). Sem origem, o ramo OneDrive
# de sempre (id b!… ou link) segue igual, no else.
# Idempotente. Antes de alterar um flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-consultar-onedrive.ps1 -Restaurar <arquivo de backup>
# Requer `az login` com acesso ao DEV e ao Power Automate.
param([string] $Restaurar = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Flow - Consultar Arquivo OneDrive'
$envVarName = 'new_URLFlowConsultarArquivoOneDrive'
$referenceFlow = 'Flow Comprovantes Despesas Assincrono | App Motoristas'
$sharePointFlow = 'Flow - Consultar Arquivos Sharepoint'
$siteUrl = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$libraryId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[consultar-onedrive] $Method $($Path.Split('?')[0])"
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
  $file = Join-Path $backupDir ("Flow-Consultar-Arquivo-OneDrive-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[consultar-onedrive] backup: $file"
}
function Apply($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -eq 1) { Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
  }
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  if (-not ($text | ConvertFrom-Json).properties.definition.triggers.manual.inputs.schema.properties.nomeArquivo) { throw 'O arquivo não é um backup deste flow.' }
  $rows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  Backup $rows[0]
  Apply $rows[0] $text
  Write-Output "DEV: '$flowName' restaurado de $Restaurar e ativo."
  return
}

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# Conexão do OneDrive: a mesma do flow que grava os comprovantes (pasta do noreply).
$source = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$referenceFlow' and category eq 5").value)
if ($source.Count -ne 1) { throw 'Flow de referência dos comprovantes ausente no DEV.' }
$onedrive = ($source[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_onedriveforbusiness
if (-not $onedrive.connection.connectionReferenceLogicalName) { throw 'Connection reference do OneDrive ausente.' }
# Conexão do SharePoint (a do flow do Planner): resolve o link de compartilhamento pela API /shares.
$spSource = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$sharePointFlow' and category eq 5").value)
if ($spSource.Count -ne 1) { throw 'Flow de referência do SharePoint ausente no DEV.' }
$sharepoint = ($spSource[0].clientdata | ConvertFrom-Json).properties.connectionReferences.shared_sharepointonline
if (-not $sharepoint.connection.connectionReferenceLogicalName) { throw 'Connection reference do SharePoint ausente.' }

$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" }
  },
  "triggers": {
    "manual": {
      "type": "Request", "kind": "Http",
      "inputs": { "triggerAuthenticationType": "All", "schema": { "type": "object", "properties": { "id": { "type": "string" }, "link": { "type": "string" }, "nomeArquivo": { "type": "string" }, "origem": { "type": "string" } } } }
    }
  },
  "actions": {
    "ViaSharePoint": {
      "type": "If", "runAfter": {},
      "expression": { "and": [ { "equals": [ "@toLower(trim(coalesce(triggerBody()?['origem'], '')))", "sharepoint" ] } ] },
      "actions": {
        "PropriedadesSP": {
          "type": "OpenApiConnection", "runAfter": {}, "limit": { "timeout": "PT30S" },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "GetFileItem" },
            "parameters": { "dataset": "__SITE_URL__", "table": "__LIBRARY_ID__", "id": "@trim(coalesce(triggerBody()?['id'], ''))" },
            "authentication": "@parameters('$authentication')",
            "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
          }
        },
        "DentroDeDespesasSP": {
          "type": "If", "runAfter": { "PropriedadesSP": ["Succeeded"] },
          "expression": { "and": [
            { "contains": [ "@toLower(concat('/', string(body('PropriedadesSP')?['{Path}'])))", "/despesas/" ] },
            { "not": { "equals": [ "@body('PropriedadesSP')?['{IsFolder}']", true ] } }
          ] },
          "actions": {
            "ConteudoSP": {
              "type": "OpenApiConnection", "runAfter": {}, "limit": { "timeout": "PT40S" },
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "GetFileContent" },
                "parameters": { "dataset": "__SITE_URL__", "id": "@body('PropriedadesSP')?['{Identifier}']", "inferContentType": true },
                "authentication": "@parameters('$authentication')",
                "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
              }
            },
            "RespostaSP": {
              "type": "Response", "kind": "Http", "runAfter": { "ConteudoSP": ["Succeeded"] },
              "inputs": { "statusCode": 200, "body": {
                "sucesso": true,
                "nomeArquivo": "@{body('PropriedadesSP')?['{FilenameWithExtension}']}",
                "mimeType": "@{coalesce(outputs('ConteudoSP')?['headers']?['Content-Type'], 'application/octet-stream')}",
                "conteudoBase64": "@{base64(body('ConteudoSP'))}"
              } }
            }
          },
          "else": { "actions": {
            "ForaDaPastaSP": { "type": "Response", "kind": "Http", "inputs": { "statusCode": 403, "body": { "sucesso": false, "erro": "Este arquivo não é um comprovante de despesa." } } }
          } }
        },
        "FalhaSP": {
          "type": "Response", "kind": "Http",
          "runAfter": { "DentroDeDespesasSP": ["Failed", "TimedOut", "Skipped"] },
          "inputs": {
            "statusCode": "@if(equals(actions('PropriedadesSP')?['outputs']?['statusCode'], 404), 404, 502)",
            "body": { "sucesso": false, "erro": "@{if(equals(actions('PropriedadesSP')?['outputs']?['statusCode'], 404), 'Comprovante não encontrado no SharePoint. Ele pode ter sido movido ou excluído.', 'Não foi possível ler o comprovante no SharePoint. Tente de novo em instantes.')}" }
          }
        },
        "FimSP": {
          "type": "Terminate", "runAfter": { "FalhaSP": ["Succeeded", "Failed", "Skipped", "TimedOut"] },
          "inputs": { "runStatus": "Succeeded" }
        }
      },
      "else": { "actions": {
          "Resolver": {
            "type": "If", "runAfter": {},
            "expression": { "and": [
              { "equals": [ "@trim(coalesce(triggerBody()?['id'], ''))", "" ] },
              { "not": { "equals": [ "@trim(coalesce(triggerBody()?['link'], ''))", "" ] } }
            ] },
            "actions": {
              "Compartilhamento": {
                "type": "OpenApiConnection", "runAfter": {}, "limit": { "timeout": "PT30S" },
                "inputs": {
                  "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", "connectionName": "shared_sharepointonline", "operationId": "HttpRequest" },
                  "parameters": {
                    "dataset": "https://betinhos-my.sharepoint.com/personal/noreply_betinhos_onmicrosoft_com",
                    "parameters/method": "GET",
                    "parameters/uri": "_api/v2.0/shares/@{concat('u!', replace(replace(replace(base64(trim(triggerBody()?['link'])), '=', ''), '/', '_'), '+', '-'))}/driveItem?$select=id,name,parentReference",
                    "parameters/headers": { "Accept": "application/json" }
                  },
                  "authentication": "@parameters('$authentication')",
                  "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
                }
              }
            },
            "else": { "actions": {} }
          },
          "IdArquivo": {
            "type": "Compose", "runAfter": { "Resolver": ["Succeeded"] },
            "inputs": "@if(equals(trim(coalesce(triggerBody()?['id'], '')), ''), concat(body('Compartilhamento')?['parentReference']?['driveId'], '.', body('Compartilhamento')?['id']), trim(triggerBody()?['id']))"
          },
          "Metadados": {
            "type": "OpenApiConnection", "runAfter": { "IdArquivo": ["Succeeded"] }, "limit": { "timeout": "PT30S" },
            "inputs": {
              "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness", "connectionName": "shared_onedriveforbusiness", "operationId": "GetFileMetadata" },
              "parameters": { "id": "@outputs('IdArquivo')" },
              "authentication": "@parameters('$authentication')",
                  "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
            }
          },
          "DentroDeDespesas": {
            "type": "If", "runAfter": { "Metadados": ["Succeeded"] },
            "expression": { "and": [ { "startsWith": [ "@toLower(string(body('Metadados')?['Path']))", "/despesas/" ] } ] },
            "actions": {
              "Conteudo": {
                "type": "OpenApiConnection", "runAfter": {}, "limit": { "timeout": "PT40S" },
                "inputs": {
                  "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness", "connectionName": "shared_onedriveforbusiness", "operationId": "GetFileContent" },
                  "parameters": { "id": "@outputs('IdArquivo')", "inferContentType": true },
                  "authentication": "@parameters('$authentication')",
                  "retryPolicy": { "type": "fixed", "count": 1, "interval": "PT5S" }
                }
              },
              "Resposta": {
                "type": "Response", "kind": "Http", "runAfter": { "Conteudo": ["Succeeded"] },
                "inputs": { "statusCode": 200, "body": {
                  "sucesso": true,
                  "nomeArquivo": "@{body('Metadados')?['Name']}",
                  "mimeType": "@{coalesce(outputs('Conteudo')?['headers']?['Content-Type'], body('Metadados')?['MediaType'], 'application/octet-stream')}",
                  "conteudoBase64": "@{base64(body('Conteudo'))}"
                } }
              }
            },
            "else": { "actions": {
              "ForaDaPasta": { "type": "Response", "kind": "Http", "inputs": { "statusCode": 403, "body": { "sucesso": false, "erro": "Este arquivo não é um comprovante de despesa." } } }
            } }
          },
          "Falha": {
            "type": "Response", "kind": "Http",
            "runAfter": { "DentroDeDespesas": ["Failed", "TimedOut", "Skipped"] },
            "inputs": {
              "statusCode": "@if(equals(actions('Metadados')?['outputs']?['statusCode'], 404), 404, 502)",
              "body": { "sucesso": false, "erro": "@{if(equals(actions('Metadados')?['outputs']?['statusCode'], 404), 'Comprovante não encontrado no OneDrive. Ele pode ter sido movido ou excluído.', 'Não foi possível ler o comprovante no OneDrive. Tente de novo em instantes.')}" }
            }
          }
      } }
    }
  },
  "outputs": {}
}
'@
$definition = $definitionText.Replace('__SITE_URL__', $siteUrl).Replace('__LIBRARY_ID__', $libraryId) | ConvertFrom-Json

AssertSemMojibake ($definition | ConvertTo-Json -Depth 90 -Compress) 'definição do script'
$clientData = @{ properties = @{ definition = $definition; connectionReferences = @{ shared_onedriveforbusiness = $onedrive; shared_sharepointonline = $sharepoint } }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  AssertSemMojibake $flows[0].clientdata 'clientdata atual'
  if ($flows[0].clientdata -ne $clientData) {
    Backup $flows[0]
    Apply $flows[0] $clientData
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Lê um comprovante de despesa no OneDrive (pasta /Despesas) e devolve base64 para a prévia do Sistema Betinhos.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou.' }

$flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
$callback = $null
for ($i = 1; $i -le 3 -and -not $callback; $i++) {
  try {
    $callback = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flow.resourceid)/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json' -Body '{}' -TimeoutSec 30).response.value
  } catch { if ($i -eq 3) { throw }; Start-Sleep -Seconds 3 }
}
if (-not $callback) { throw 'URL do gatilho indisponível.' }

$definitions = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'").value)
if (-not $definitions.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $envVarName; displayname = 'URL Flow Consultar Arquivo OneDrive'; type = 100000000 } | Out-Null
  $definitions = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'").value)
}
$definitionId = $definitions[0].environmentvariabledefinitionid
Include $definitionId 380
$values = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $definitionId").value)
if ($values.Count -gt 1) { throw 'Variável com valores ambíguos.' }
if ($values.Count) { $valueId = $values[0].environmentvariablevalueid; Dv PATCH "environmentvariablevalues($valueId)" @{ value = $callback } | Out-Null }
else {
  Dv POST environmentvariablevalues @{ value = $callback; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($definitionId)" } | Out-Null
  $valueId = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $definitionId").value)[0].environmentvariablevalueid
}
Include $valueId 381
Write-Output "DEV: '$flowName' ativo ($($flow.resourceid)), $envVarName configurada, tudo na $solutionName."
