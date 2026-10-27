# Correção do "Flow Atualizar Status de Pagamento" (27/10/2026). Carregado por provision-flow-atualizar-status-pagamento.ps1
# (DEV) e prod/patch-flow-atualizar-status-pagamento-prod.ps1 (PROD); só transforma o clientdata já lido e o valida na
# API do Power Automate, não grava nada.
#
# Problema: o flow localizava o pagante só pelo order_number da Cielo. Até 26/10 o plugin do Gerar Pagantes gravava o mesmo
# order_number em todos os pagantes de uma OP (rateio); com 2+ registros o flow falha de propósito e a baixa não acontece.
# Correção: a notificação da Cielo traz product_id (id do link de pagamento = cr40f_cielolinkid, único por pagante). O flow
# procura primeiro por ele; só cai no order_number quando o product_id não vem ou não acha nenhum pagante. Mais de um
# resultado no mesmo critério continua sendo erro (nenhum registro é atualizado).
$script:StatusFlowName = 'Flow Atualizar Status de Pagamento'
$script:SemProductId = '00000000-0000-0000-0000-000000000000'

function O([hashtable] $h) { return [pscustomobject]$h }
function Has($obj, [string] $name) { return ($null -ne $obj) -and ($null -ne $obj.PSObject.Properties[$name]) }

$script:ProductIdBruto = "@trim(coalesce(triggerFormDataValue('product_id'), ''))"
# Aceita o id com ou sem hífens e em qualquer caixa; vazio vira um GUID zerado que nunca casa com um pagante.
$script:ProductIdNormalizado = "@if(empty(outputs('Compose_ProductId_bruto')), '$script:SemProductId', if(equals(length(outputs('Compose_ProductId_bruto')), 32), toLower(concat(substring(outputs('Compose_ProductId_bruto'), 0, 8), '-', substring(outputs('Compose_ProductId_bruto'), 8, 4), '-', substring(outputs('Compose_ProductId_bruto'), 12, 4), '-', substring(outputs('Compose_ProductId_bruto'), 16, 4), '-', substring(outputs('Compose_ProductId_bruto'), 20, 12))), toLower(outputs('Compose_ProductId_bruto'))))"
$script:PorLink = "body('List_rows_by_CieloLinkId')?['value']"
$script:PorOrder = "body('List_rows_by_CieloOrderNumber')?['value']"
$script:EscolherPagante = "@if(equals(length($script:PorLink), 1), first($script:PorLink)?['cr40f_pagantesid'], if(and(equals(length($script:PorLink), 0), equals(length($script:PorOrder), 1)), first($script:PorOrder)?['cr40f_pagantesid'], int(concat('ERRO: ', string(length($script:PorLink)), ' pagantes pelo product_id ', outputs('Compose_ProductId'), ' e ', string(length($script:PorOrder)), ' pelo order_number ', outputs('Compose_GUID'), '. Esperado exatamente 1 em um dos dois.'))))"

function Corrigir-AtualizarStatus($cd) {
  $a = $cd.properties.definition.actions.Scope.actions
  foreach ($n in 'Compose_GUID', 'List_rows_by_CieloOrderNumber', 'Compose_GUID_Format') {
    if (-not (Has $a $n)) { throw "Ação '$n' ausente no flow; formato inesperado." }
  }
  $hostDv = $a.List_rows_by_CieloOrderNumber.inputs.host
  if ($hostDv.connectionName -ne 'shared_commondataserviceforapps') { throw 'List_rows_by_CieloOrderNumber não usa a conexão do Dataverse; formato inesperado.' }

  $a | Add-Member -NotePropertyName 'Compose_ProductId_bruto' -Force -NotePropertyValue (O @{
    type = 'Compose'; inputs = $script:ProductIdBruto; runAfter = O @{ Compose_GUID = @('Succeeded') }
    description = 'product_id da Cielo: id do link de pagamento (cr40f_cielolinkid), único por pagante.'
  })
  $a | Add-Member -NotePropertyName 'Compose_ProductId' -Force -NotePropertyValue (O @{
    type = 'Compose'; inputs = $script:ProductIdNormalizado; runAfter = O @{ Compose_ProductId_bruto = @('Succeeded') }
  })
  $a | Add-Member -NotePropertyName 'List_rows_by_CieloLinkId' -Force -NotePropertyValue (O @{
    type = 'OpenApiConnection'
    runAfter = O @{ Compose_ProductId = @('Succeeded') }
    inputs = O @{
      parameters = O @{
        entityName = 'cr40f_paganteses'
        '$select' = 'cr40f_pagantesid,cr40f_cielolinkid'
        '$filter' = "cr40f_cielolinkid eq '@{outputs('Compose_ProductId')}'"
        '$top' = 2
      }
      host = O @{ apiId = $hostDv.apiId; operationId = 'ListRecords'; connectionName = $hostDv.connectionName }
    }
  })
  $a.List_rows_by_CieloOrderNumber.runAfter = O @{ List_rows_by_CieloLinkId = @('Succeeded') }
  $a.Compose_GUID_Format.inputs = $script:EscolherPagante
  $a.Compose_GUID_Format.description = 'Localiza o pagante pelo product_id da Cielo e, se não achar, pelo order_number. Falha de propósito (int de texto) quando nenhum dos dois localiza exatamente 1 pagante; o Scope_1 então envia o e-mail de erro em vez de atualizar o registro errado.'

  $mail = $cd.properties.definition.actions.Scope_1.actions.'Send_an_email_(V2)_1'.inputs.parameters
  $mail.'emailMessage/Body' = $mail.'emailMessage/Body'.Replace(
    'Causas comuns: order_number não encontrado em Pagantes ou mais de um pagante com o mesmo order_number (nesse caso nenhum registro foi atualizado; confira no painel da Cielo e ajuste manualmente).',
    'Causas comuns: product_id e order_number não encontrados em Pagantes, ou mais de um pagante com o mesmo valor (nesse caso nenhum registro foi atualizado; confira no painel da Cielo e ajuste manualmente).')
}

# Valida a definição montada com o checkFlowErrors do Power Automate, sem gravar. $envId = ambiente (DEV ou PROD) do flow.
function CheckFlowErrors($row, $cd, [string] $envId) {
  $flowToken = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $flowToken) { throw 'Token do Power Automate indisponível.' }
  $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$envId/flows/$($row.workflowid)"
  $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $flowToken" }).properties
  $props.definition = $cd.properties.definition
  $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
  try { $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $flowToken" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing }
  catch {
    $detalhe = if ($_.Exception.Response) { (New-Object IO.StreamReader $_.Exception.Response.GetResponseStream()).ReadToEnd() } else { $_.Exception.Message }
    throw "checkFlowErrors falhou: $detalhe"
  }
  $erros = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  Write-Output "checkFlowErrors: $erros"
  if ($erros.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
}

function Conferir-AtualizarStatus($cd) {
  $a = $cd.properties.definition.actions.Scope.actions
  foreach ($n in 'Compose_ProductId_bruto', 'Compose_ProductId', 'List_rows_by_CieloLinkId') {
    if (-not (Has $a $n)) { throw "Ação '$n' ausente após a correção." }
  }
  if ($a.Compose_GUID_Format.inputs -notmatch 'List_rows_by_CieloLinkId') { throw 'Compose_GUID_Format não usa o product_id.' }
  if ($a.List_rows_by_CieloOrderNumber.runAfter.PSObject.Properties.Name -notcontains 'List_rows_by_CieloLinkId') { throw 'A busca por order_number não vem depois da busca por product_id.' }
  if ($cd.properties.definition.actions.Scope_1.actions.'Send_an_email_(V2)_1'.inputs.parameters.'emailMessage/Body' -notmatch 'product_id e order_number') { throw 'O texto do e-mail de erro não foi atualizado; o corpo atual difere do esperado.' }
}
