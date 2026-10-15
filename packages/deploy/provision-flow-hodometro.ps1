# Cria (ou atualiza) no DEV o flow "Infleet - Sincronizar hodômetro", na solução AppBetinhos.
# Lê o odômetro de cada veículo na Infleet e grava cr40f_hodometro / cr40f_hodometroem em cr40f_veiculos
# (casando por new_infleetvehicleid), para a manutenção preventiva do módulo Frota. Roda ao ativar e a cada 6 h.
# Reaproveita as referências de conexão do flow "Infleet - Sincronizar telemetria diária e eventos".
# Idempotente. Requer `az login` com acesso ao DEV.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Infleet - Sincronizar hodômetro'
$referenceFlow = 'Infleet - Sincronizar telemetria diária e eventos'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[flow-hodometro] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  try { return Invoke-RestMethod @params }
  catch {
    $detail = if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $($Path.Split('?')[0]) falhou: $detail"
  }
}

$source = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$referenceFlow' and category eq 5").value)
if ($source.Count -ne 1) { throw "Flow de referência '$referenceFlow' não encontrado." }
$refs = ($source[0].clientdata | ConvertFrom-Json).properties.connectionReferences

$infleetHost = @{ apiId = '/providers/Microsoft.PowerApps/apis/shared_new-5finfleet-20graphql-5f30e351431b40001e'; connectionName = 'new_InfleetGraphQLDEV'; operationId = 'ExecuteGraphQL'; connectionReferenceName = 'new_InfleetGraphQLDEV' }
$dvHost = @{ apiId = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'; connectionName = 'shared_commondataserviceforapps'; connectionReferenceName = 'shared_commondataserviceforapps' }
$veiculoInfleet = "first(body('Filtrar_Veiculo_Infleet'))"

$definition = [ordered]@{
  '$schema' = 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
  contentVersion = '1.0.0.0'
  parameters = @{ '$authentication' = @{ defaultValue = @{}; type = 'SecureObject' }; '$connections' = @{ defaultValue = @{}; type = 'Object' } }
  triggers = @{ Recorrencia = @{ type = 'Recurrence'; recurrence = @{ frequency = 'Hour'; interval = 6; timeZone = 'E. South America Standard Time' }; runtimeConfiguration = @{ concurrency = @{ runs = 1 } } } }
  actions = [ordered]@{
    Listar_Veiculos_Infleet = @{
      runAfter = @{}; type = 'OpenApiConnection'
      inputs = @{ host = $infleetHost; parameters = @{ 'body/operationName' = 'ListVehicles'; 'body/query' = 'query ListVehicles { listVehicles(limit: 1000) { id plate odometer location { fixTime } } }'; 'body/variables' = @{} } }
    }
    Listar_Veiculos_Dataverse = @{
      runAfter = @{ Listar_Veiculos_Infleet = @('Succeeded') }; type = 'OpenApiConnection'
      inputs = @{ host = $dvHost + @{ operationId = 'ListRecords' }; parameters = @{ entityName = 'cr40f_veiculoses'; '$select' = 'cr40f_veiculosid,new_infleetvehicleid'; '$filter' = 'new_infleetvehicleid ne null' } }
      runtimeConfiguration = @{ paginationPolicy = @{ minimumItemCount = 5000 } }
    }
    Atualizar_Hodometros = @{
      runAfter = @{ Listar_Veiculos_Dataverse = @('Succeeded') }; type = 'Foreach'
      foreach = "@body('Listar_Veiculos_Dataverse')?['value']"
      runtimeConfiguration = @{ concurrency = @{ repetitions = 5 } }
      actions = [ordered]@{
        Filtrar_Veiculo_Infleet = @{
          type = 'Query'
          inputs = @{ from = "@body('Listar_Veiculos_Infleet')?['data']?['listVehicles']"; where = "@equals(item()?['id'],items('Atualizar_Hodometros')?['new_infleetvehicleid'])" }
        }
        Tem_Odometro = @{
          runAfter = @{ Filtrar_Veiculo_Infleet = @('Succeeded') }; type = 'If'
          expression = @{ and = @(@{ equals = @("@length(body('Filtrar_Veiculo_Infleet'))", 1) }, @{ greater = @("@float(coalesce(${veiculoInfleet}?['odometer'],0))", 0) }) }
          actions = @{
            Gravar_Hodometro = @{
              type = 'OpenApiConnection'
              inputs = @{ host = $dvHost + @{ operationId = 'UpdateRecord' }; parameters = @{
                entityName = 'cr40f_veiculoses'; recordId = "@items('Atualizar_Hodometros')?['cr40f_veiculosid']"
                'item/cr40f_hodometro' = "@int(first(split(string(${veiculoInfleet}?['odometer']),'.')))"
                'item/cr40f_hodometroem' = "@coalesce(${veiculoInfleet}?['location']?['fixTime'],utcNow())"
              } }
            }
          }
          else = @{ actions = @{} }
        }
      }
    }
  }
  outputs = @{}
}
$clientData = (@{ properties = @{ connectionReferences = $refs; definition = $definition }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress)

$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw "Mais de um flow '$flowName'." }
if ($flows.Count -eq 1) {
  $flowId = $flows[0].workflowid
  if ($flows[0].clientdata -ne $clientData) {
    if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0; statuscode = 1 } | Out-Null }
    Dv PATCH "workflows($flowId)" @{ clientdata = $clientData } | Out-Null
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Grava o odômetro Infleet em cr40f_veiculos (cr40f_hodometro/cr40f_hodometroem) para a manutenção preventiva da Frota.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1; statuscode = 2 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou.' }
Write-Host "[flow-hodometro] OK: '$flowName' ativo ($flowId). A primeira execução começa ao ativar."
