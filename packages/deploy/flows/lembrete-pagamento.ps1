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
# - Quem entra no ciclo do lembrete mas não recebe (cartão sem link ou sem e-mail, e Pix) não gera mais cópia do e-mail
#   do cliente para o noreply: vai num único resumo aos gestores (noreply e financeiro), "PAG-X e PAG-Y ainda não foram
#   recebidos", com o motivo de cada um. Pedido de compra continua fora. O laço roda em sequência por causa da lista.
# Os dois flows: o e-mail de erro ia para financeiro@betinhos.com..br (endereço inválido).
$script:LembreteFlowName = 'Flow Enviar Lembrete de Pagamento'
$script:LinkFlowName = 'Flow Gerar Link de Pagamento'
$script:FORMA_CARTAO = 202410000
$script:FORMA_PIX = 202410002
$script:LINK_CONCLUIDO = 202410002
$script:EmailPagante = "trim(coalesce(outputs('Get_a_row_by_ID_BD')?['body/cr40f_email'], ''))"
$script:LinkPronto = "and(equals(outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_statusgeracaolink'], $script:LINK_CONCLUIDO), not(empty(trim(coalesce(outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_linkdepagamento'], '')))))"
$script:ToCartao = "noreply@betinhos.onmicrosoft.com@{if(and($script:LinkPronto, not(empty($script:EmailPagante))), concat(';', $script:EmailPagante), '')}"
$script:Forma = "outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_formadepagamento']"
# Só cai no caso Cartão quando o pagante recebe; o resto vai para o caso padrão (resumo aos gestores).
$script:SwitchExpr = "@if(and(equals($script:Forma, $script:FORMA_CARTAO), $script:LinkPronto, not(empty($script:EmailPagante))), $script:Forma, 0)"
$script:GestoresTo = 'noreply@betinhos.onmicrosoft.com; financeiro@betinhos.com.br'
$script:VarGestores = 'PendentesGestores'
$script:PAGs = "body('Selecionar_PAGs')"
$script:AssuntoGestores = "@{if(equals(length($script:PAGs), 1), concat(outputs('Compor_lista_PAGs'), ' ainda não foi recebido'), concat(outputs('Compor_lista_PAGs'), ' ainda não foram recebidos'))} | Lembrete não enviado ao cliente"
$script:CorpoGestores = '<p>Os pagamentos abaixo completaram mais um ciclo de lembrete e ainda não foram recebidos.</p>' +
  '<p><strong>O lembrete não foi enviado ao cliente</strong>, pelo motivo indicado em cada linha.</p>' +
  "@{replace(body('Tabela_pendentes_gestores'), '<table>', '<table border=""1"" cellpadding=""6"" style=""border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"">')}" +
  '<p>Para o cliente passar a receber o lembrete, gere o link de pagamento e confira se o pagante tem e-mail no cadastro. Pix não tem lembrete automático ao cliente.</p>' +
  '<p style="color:#666;font-size:12px">E-mail automático do Flow Enviar Lembrete de Pagamento.</p>'

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
  Corrigir-Gestores $cd $sw[0].Acao $envioCartao.Value.inputs.host
  Corrigir-EmailErro $cd
}

function O([hashtable] $h) { return [pscustomobject]$h }

function Corrigir-Gestores($cd, $switch, $hostEmail) {
  $acoes = $cd.properties.definition.actions
  $loop = $acoes.Scope.actions.Apply_to_each
  $dias = @($loop.actions.PSObject.Properties | Where-Object { $_.Name -like 'Compose_DiasDesdeCria*' })
  if ($dias.Count -ne 1) { throw 'Compose_DiasDesdeCriação ausente; formato inesperado.' }
  $diasExpr = "outputs('$($dias[0].Name)')"

  # Variável no nível de cima (exigência do Power Automate); o Scope passa a rodar depois dela.
  $acoes | Add-Member -NotePropertyName 'Inicializar_pendentes_gestores' -Force -NotePropertyValue (O @{
    runAfter = O @{}; type = 'InitializeVariable'
    inputs = O @{ variables = @(O @{ name = $script:VarGestores; type = 'array'; value = @() }) }
  })
  $acoes.Scope.runAfter = O @{ Inicializar_pendentes_gestores = @('Succeeded') }
  $loop | Add-Member -NotePropertyName 'runtimeConfiguration' -Force -NotePropertyValue (O @{ concurrency = O @{ repetitions = 1 } })

  $switch.expression = $script:SwitchExpr
  $motivo = "@{if(equals($script:Forma, $script:FORMA_PIX), 'Pix: o lembrete não é enviado ao cliente', if(not($script:LinkPronto), 'Link de pagamento ainda não gerado', 'Pagante sem e-mail cadastrado'))}"
  $item = [ordered]@{
    'PAG' = "@{items('Apply_to_each')?['cr40f_id']}"
    'Pagante' = "@{outputs('Get_a_row_by_ID_BD')?['body/cr40f_nomedopassageiro']}"
    'Valor' = "@{formatNumber(float(outputs('Get_a_row_by_ID_Pagantes')?['body/cr40f_valor']), 'C2', 'pt-BR')}"
    'Forma' = "@{if(equals($script:Forma, $script:FORMA_PIX), 'Pix', 'Cartão de crédito')}"
    'Dias desde a criação' = "@{$diasExpr}"
    'Motivo' = $motivo
  }
  $switch | Add-Member -NotePropertyName 'default' -Force -NotePropertyValue (O @{ actions = O @{
    Condition_Pix_ou_cartao_sem_envio = O @{
      runAfter = O @{}; type = 'If'
      expression = O @{ or = @((O @{ equals = @("@$script:Forma", $script:FORMA_CARTAO) }), (O @{ equals = @("@$script:Forma", $script:FORMA_PIX) })) }
      actions = O @{ Anotar_para_gestores = O @{ runAfter = O @{}; type = 'AppendToArrayVariable'; inputs = O @{ name = $script:VarGestores; value = [pscustomobject]$item } } }
      else = O @{ actions = O @{} }
    }
  } })

  $acoes.Scope.actions | Add-Member -NotePropertyName 'Condition_Ha_pendentes_gestores' -Force -NotePropertyValue (O @{
    runAfter = O @{ Apply_to_each = @('Succeeded') }; type = 'If'
    expression = O @{ and = @(O @{ greater = @("@length(variables('$script:VarGestores'))", 0) }) }
    actions = [pscustomobject][ordered]@{
      Selecionar_PAGs = O @{ runAfter = O @{}; type = 'Select'; inputs = O @{ from = "@variables('$script:VarGestores')"; select = "@item()?['PAG']" } }
      Compor_lista_PAGs = O @{ runAfter = O @{ Selecionar_PAGs = @('Succeeded') }; type = 'Compose'
        inputs = "@if(equals(length($script:PAGs), 1), first($script:PAGs), concat(join(take($script:PAGs, sub(length($script:PAGs), 1)), ', '), ' e ', last($script:PAGs)))" }
      Tabela_pendentes_gestores = O @{ runAfter = O @{ Compor_lista_PAGs = @('Succeeded') }; type = 'Table'; inputs = O @{ from = "@variables('$script:VarGestores')"; format = 'HTML' } }
      Enviar_resumo_gestores = O @{ runAfter = O @{ Tabela_pendentes_gestores = @('Succeeded') }; type = 'OpenApiConnection'
        inputs = O @{
          parameters = [pscustomobject][ordered]@{
            'emailMessage/To' = $script:GestoresTo
            'emailMessage/Subject' = $script:AssuntoGestores
            'emailMessage/Body' = $script:CorpoGestores
            'emailMessage/From' = 'noreply@betinhos.com.br'
            'emailMessage/Importance' = 'Normal'
          }
          host = O @{ apiId = $hostEmail.apiId; operationId = 'SendEmailV2'; connectionName = $hostEmail.connectionName }
        } }
    }
    else = O @{ actions = O @{} }
  })
}

function Conferir-Gestores($cd) {
  $acoes = $cd.properties.definition.actions
  if (-not (Has $acoes 'Inicializar_pendentes_gestores')) { throw 'Falta Inicializar_pendentes_gestores.' }
  if (-not (Has $acoes.Scope.runAfter 'Inicializar_pendentes_gestores')) { throw 'Scope não roda depois da variável.' }
  $c = $acoes.Scope.actions.Condition_Ha_pendentes_gestores
  if ($c.actions.Enviar_resumo_gestores.inputs.parameters.'emailMessage/To' -ne $script:GestoresTo) { throw 'Destinatário do resumo aos gestores não confere.' }
  $sw = @(Get-Acoes $acoes | Where-Object { $_.Nome -eq 'Switch_Forma_de_Pagamento' })[0].Acao
  if ($sw.expression -ne $script:SwitchExpr) { throw 'Expressão do switch não confere.' }
  if (-not (Has $sw.default.actions 'Condition_Pix_ou_cartao_sem_envio')) { throw 'Falta o caso padrão do switch.' }
  if ($acoes.Scope.actions.Apply_to_each.runtimeConfiguration.concurrency.repetitions -ne 1) { throw 'Laço não está em sequência.' }
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
  Conferir-Gestores $cd
  Conferir-EmailErro $cd
}

function Conferir-EmailErro($cd) {
  foreach ($x in @(Get-Acoes $cd.properties.definition.actions)) {
    if ((Is-Envio $x.Acao) -and ([string]$x.Acao.inputs.parameters.'emailMessage/To') -match '\.\.br') { throw "Endereço com '..br' em $($x.Nome)." }
  }
}
