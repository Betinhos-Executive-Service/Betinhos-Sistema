# Correções do "Flow Enviar Lembrete de Pagamento" e do "Flow Gerar Link de Pagamento" (19/10/2026). Carregado por
# provision-flow-lembrete-pagamento.ps1 (DEV) e prod/patch-flow-lembrete-pagamento-prod.ps1 (PROD); só transforma o
# clientdata já lido, não fala com o Dataverse.
#
# Lembrete:
# - Cartão de crédito (pagamento por link): o pagante (cr40f_email do Banco de Dados) também recebe, desde que o link
#   já tenha sido gerado (cr40f_statusgeracaolink = Concluído e cr40f_linkdepagamento preenchido). Sem link ou sem
#   e-mail, vai só para o noreply, como antes. Pix continua só no noreply.
# - Depois de cada envio grava cr40f_datadoultimolembrete; antes o flow lia o campo para não repetir no dia, mas nunca
#   o preenchia.
# Os dois flows: o e-mail de erro ia para financeiro@betinhos.com..br (endereço inválido).
$script:LembreteFlowName = 'Flow Enviar Lembrete de Pagamento'
$script:LinkFlowName = 'Flow Gerar Link de Pagamento'
$script:FORMA_CARTAO = 202410000
$script:FORMA_PIX = 202410002
$script:LINK_CONCLUIDO = 202410002
$script:EmailPagante = "trim(coalesce(outputs('Get_a_row_by_ID_BD')?['body/cr40f_email'], ''))"
$script:LinkPronto = "and(equals(outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_statusgeracaolink'], $script:LINK_CONCLUIDO), not(empty(trim(coalesce(outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_linkdepagamento'], '')))))"
$script:ToCartao = "noreply@betinhos.onmicrosoft.com@{if(and($script:LinkPronto, not(empty($script:EmailPagante))), concat(';', $script:EmailPagante), '')}"

function Has($obj, [string] $name) { return ($null -ne $obj) -and ($null -ne $obj.PSObject.Properties[$name]) }

# Todas as ações (inclusive dentro de escopos, condições, laços e switch), com o contêiner onde estão.
function Get-Acoes($acoes) {
  foreach ($p in $acoes.PSObject.Properties) {
    [pscustomobject]@{ Nome = $p.Name; Acao = $p.Value; Pai = $acoes }
    $a = $p.Value
    if (Has $a 'actions') { Get-Acoes $a.actions }
    if ((Has $a 'else') -and (Has $a.else 'actions')) { Get-Acoes $a.else.actions }
    if (Has $a 'default') { if (Has $a.default 'actions') { Get-Acoes $a.default.actions } }
    if (Has $a 'cases') { foreach ($c in $a.cases.PSObject.Properties) { if (Has $c.Value 'actions') { Get-Acoes $c.Value.actions } } }
  }
}

function Is-Envio($acao) { return (Has $acao 'inputs') -and ($acao.inputs -isnot [string]) -and (Has $acao.inputs 'host') -and $acao.inputs.host.operationId -eq 'SendEmailV2' }

function Corrigir-EmailErro($cd) {
  foreach ($x in @(Get-Acoes $cd.properties.definition.actions)) {
    if (Is-Envio $x.Acao) {
      $p = $x.Acao.inputs.parameters
      $p.'emailMessage/To' = ([string]$p.'emailMessage/To').Replace('betinhos.com..br', 'betinhos.com.br')
    }
  }
}

function Get-Caso($switch, [int] $valor) {
  $c = @($switch.cases.PSObject.Properties | Where-Object { $_.Value.case -eq $valor })
  if ($c.Count -ne 1) { throw "Switch_Forma_de_Pagamento sem o caso $valor; formato inesperado." }
  return $c[0].Value
}

function Get-EnvioDoCaso($caso) {
  $e = @($caso.actions.PSObject.Properties | Where-Object { Is-Envio $_.Value })
  if ($e.Count -ne 1) { throw 'Caso do switch sem exatamente um envio de e-mail; formato inesperado.' }
  return $e[0]
}

function Add-GravarData($caso, [string] $nome, [string] $depoisDe, $hostDataverse) {
  $acao = [pscustomobject]@{
    runAfter = [pscustomobject]@{ $depoisDe = @('Succeeded') }
    type = 'OpenApiConnection'
    inputs = [pscustomobject]@{
      parameters = [pscustomobject]@{
        entityName = 'cr40f_paganteses'
        recordId = "@items('Apply_to_each')?['cr40f_pagantesid']"
        'item/cr40f_datadoultimolembrete' = '@utcNow()'
      }
      host = [pscustomobject]@{ apiId = $hostDataverse.apiId; operationId = 'UpdateRecord'; connectionName = $hostDataverse.connectionName }
    }
  }
  $caso.actions | Add-Member -NotePropertyName $nome -NotePropertyValue $acao -Force
}

function Corrigir-Lembrete($cd) {
  $todas = @(Get-Acoes $cd.properties.definition.actions)
  $sw = @($todas | Where-Object { $_.Nome -eq 'Switch_Forma_de_Pagamento' })
  $get = @($todas | Where-Object { $_.Nome -eq 'Get_a_row_by_ID_Pagantes' })
  $bd = @($todas | Where-Object { $_.Nome -eq 'Get_a_row_by_ID_BD' })
  if ($sw.Count -ne 1 -or $get.Count -ne 1 -or $bd.Count -ne 1) { throw 'Lembrete sem Switch_Forma_de_Pagamento, Get_a_row_by_ID_Pagantes ou Get_a_row_by_ID_BD; formato inesperado.' }
  $hostDv = $get[0].Acao.inputs.host
  if ($hostDv.connectionName -ne 'shared_commondataserviceforapps') { throw 'Get_a_row_by_ID_Pagantes não usa a conexão do Dataverse; formato inesperado.' }

  $cartao = Get-Caso $sw[0].Acao $script:FORMA_CARTAO
  $pix = Get-Caso $sw[0].Acao $script:FORMA_PIX
  $envioCartao = Get-EnvioDoCaso $cartao
  $envioPix = Get-EnvioDoCaso $pix
  $envioCartao.Value.inputs.parameters.'emailMessage/To' = $script:ToCartao
  Add-GravarData $cartao 'Gravar_data_do_lembrete_cartao' $envioCartao.Name $hostDv
  Add-GravarData $pix 'Gravar_data_do_lembrete_pix' $envioPix.Name $hostDv
  Corrigir-EmailErro $cd
}

# Conferências sobre o clientdata lido de volta (ou montado).
function Conferir-Lembrete($cd) {
  $todas = @(Get-Acoes $cd.properties.definition.actions)
  $sw = @($todas | Where-Object { $_.Nome -eq 'Switch_Forma_de_Pagamento' })[0].Acao
  $cartao = Get-Caso $sw $script:FORMA_CARTAO
  $pix = Get-Caso $sw $script:FORMA_PIX
  if ((Get-EnvioDoCaso $cartao).Value.inputs.parameters.'emailMessage/To' -ne $script:ToCartao) { throw 'Destinatário do lembrete de cartão não confere.' }
  if ((Get-EnvioDoCaso $pix).Value.inputs.parameters.'emailMessage/To' -ne 'noreply@betinhos.onmicrosoft.com') { throw 'Destinatário do lembrete de Pix mudou.' }
  foreach ($n in @(@($cartao, 'Gravar_data_do_lembrete_cartao'), @($pix, 'Gravar_data_do_lembrete_pix'))) {
    if (-not (Has $n[0].actions $n[1])) { throw "Falta a ação $($n[1])." }
    if ($n[0].actions.($n[1]).inputs.host.operationId -ne 'UpdateRecord') { throw "$($n[1]) não é UpdateRecord." }
  }
  Conferir-EmailErro $cd
}

function Conferir-EmailErro($cd) {
  foreach ($x in @(Get-Acoes $cd.properties.definition.actions)) {
    if ((Is-Envio $x.Acao) -and ([string]$x.Acao.inputs.parameters.'emailMessage/To') -match '\.\.br') { throw "Endereço com '..br' em $($x.Nome)." }
  }
}
