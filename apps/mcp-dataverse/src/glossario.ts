import { fold } from './dicas'

/** Regras de negócio vindas das telas do Sistema (apps/shell), conferidas na metadata do DEV. Formato "termo = regra"; sem chamada de rede. */
export const GLOSSARIO: { termos: string; texto: string }[] = [
  {
    termos: 'serviço viagem os reserva geral status cancelado',
    texto:
      'serviço/viagem/OS = cr40f_reservadeveculos (cr40f_id; rótulo "Geral"); saída cr40f_dataehorriodesada; cr40f_status "Status de Operação": 202410000 Pré-reserva, 202410004 Solicitado, 202410001 Confirmado, 202410005 Programado, 202410006 Em Execução, 202410008 Concluído, 202410002 Cancelado, 202410010 Cancelado com Ressalvas, 100000001 Requer Análise; OP do serviço = lookup cr40f_financeiro; período do serviço nas telas (Dashboard e Geral) = o dia (fuso de São Paulo) de cr40f_dataehorriodesada; new_datadefinalizacao (finalização) existe mas o Sistema só a usa no prazo de faturar da aba Financeiro, não para período. "Concluído na semana": o Sistema não define; usar cr40f_status 202410008 Concluído com cr40f_dataehorriodesada na semana é suposição: não definido no Sistema: pergunte ao usuário; categoria new_categoriadoitem: 100000000 Serviço, 100000001 Manutenção, 100000002 Troca de Veículos',
  },
  {
    termos: 'faturamento valor preço composição a receber pago status de faturamento',
    texto:
      'valor/faturamento do serviço = new_valortotal da composição cr40f_composicaodeprecos (lookup new_composicaodepreco, _new_composicaodepreco_value; new_status 100000000 Pendente, 100000001 Concluido); faturamento do painel = soma de new_valortotal dos serviços com new_categoriadoitem 100000000, por cr40f_dataehorriodesada, sem filtro de status; "a receber" do painel = composição concluída + com OP + cr40f_statusdefaturamento ≠ 202410010 + valor > 0\ncr40f_statusdefaturamento "Status de Faturamento": 202410010 Pago, 202410005 Pendente, 202410007 Pagamento Pendente, 202410012 Pagamento Em Atraso, 202410008 Faturamento Mensal, 100000001 Composição Realizada, 202410006 Pagante em Viagem, 202410002 Cancelado Com Taxa, 202410000 Cancelado Sem Taxa, 202410003 Cortesia, 202410004 Permuta, 202410011 Não Faturável\ncr40f_valor_a_receber ("Valor a receber", Money) NÃO é o faturamento do painel: o Sistema só o lê no drawer de comprovantes do serviço (Recebimentos), junto de cr40f_receber (Sim/Não) e cr40f_formadepagamento. Total "a receber do motorista": não definido no Sistema: pergunte ao usuário\nFaturamento por cliente e mês, FetchXML pronto (a ligação reserva → composição é o lookup new_composicaodepreco; cliente da reserva é cr40f_cliente → cr40f_clientes1/cr40f_nomedocliente): <fetch aggregate="true"><entity name="cr40f_reservadeveculos"><attribute name="cr40f_cliente" groupby="true" alias="cliente"/><filter><condition attribute="new_categoriadoitem" operator="eq" value="100000000"/><condition attribute="cr40f_dataehorriodesada" operator="ge" value="<inicio UTC>"/><condition attribute="cr40f_dataehorriodesada" operator="lt" value="<fim UTC>"/></filter><link-entity name="cr40f_composicaodeprecos" from="cr40f_composicaodeprecosid" to="new_composicaodepreco" link-type="inner" alias="cp"><attribute name="new_valortotal" aggregate="sum" alias="faturamento"/></link-entity><order alias="faturamento" descending="true"/></entity></fetch>; o mês vem de whoami.agora.intervalos.mesAtual/mesPassado ({ge, lt}); para o nome do cliente troque o groupby pelo link-entity cr40f_clientes1 (from="cr40f_clientes1id" to="cr40f_cliente") com <attribute name="cr40f_nomedocliente" groupby="true" alias="cliente"/>. A tela do Dashboard não filtra status no faturamento (cancelado entra se tiver composição); se o usuário quiser sem cancelados, acrescente condition cr40f_status ne 202410002 e pergunte antes',
  },
  {
    termos: 'passageiro cliente',
    texto: 'passageiro = cr40f_bancodedados (cr40f_nomedopassageiro; tem lookup cr40f_cliente); cliente = cr40f_clientes1 (cr40f_nomedocliente); serviço: Passageiro1..4 = cr40f_Passageiro1..4, Cliente = cr40f_Cliente',
  },
  {
    termos: 'cotação cotacao pedido de cotação',
    texto:
      'cotação = cr40f_pedidodecotacao (cr40f_titulo); cr40f_statuscotacao: abertas 100004000 Nova, 100004001 Em análise pelo financeiro, 100004002 Aguardando informação, 100004003 Cotada, 100004004 Respondida ao cliente; encerradas 100004007 "Convertida em serviço" (no código "Aceita pelo cliente": ganha), 100004006 Perdida (com motivo), 100004005 Cancelada; valor cr40f_valorcotado; prazo cr40f_prazoresponder; cliente: a tela do Planner sempre grava e mostra o texto cr40f_clienteempresa e, só quando o usuário escolhe um cliente cadastrado, também o lookup cr40f_cliente (→ cr40f_clientes1); por isso cotação de um cliente pode ter só o texto: busque por contains(cr40f_clienteempresa,\'x\') e, se houver cadastro, também _cr40f_cliente_value eq <id>',
  },
  {
    termos: 'pagante cobrança cobranca pagamento',
    texto:
      'pagante/cobrança = cr40f_pagantes (cr40f_id; valor cr40f_valor); cr40f_status: 202410001 Pendente, 202410002 Pago, 202410003 Negado, 202410004 Expirado, 202410005 Cancelado, 202410006 Não Finalizado, 202410007 Autorizado, 202410010 Aguardando Facial; a receber = Pendente, Negado, Expirado, Não Finalizado, Aguardando Facial; pago = Pago ou Autorizado\npagante → OP = _cr40f_financeiro_value (rótulo "Ordem de Pagamento"); pagante → pessoa = _cr40f_bancodedados_value (rótulo "Pagante"), que tem _cr40f_cliente_value (cliente); OP → serviços = reservas com _cr40f_financeiro_value eq <id da OP>',
  },
  {
    termos: 'op ordem de pagamento financeiro',
    texto: 'OP = cr40f_financeiro (cr40f_idfinanceiro; rótulo "Ordens de Pagamento"; valor cr40f_valor); cr40f_status: 202410000 Aberta, 100000001 Pagamento Pendente, 202410006 Pagamento Parcial, 202410003 Paga, 202410004 Cancelada; o cliente da OP também vem em texto new_clientedaop',
  },
  {
    termos: 'funcionário funcionario motorista empresa',
    texto: 'funcionário/motorista = cr40f_funcionarios (cr40f_nomecompleto); cr40f_status: 0 Ativo, 2 Afastado, 1 Desligado (só nesta tabela); cr40f_funcao: 202410000 Motorista, 202410001 Administrativo; empresa cr40f_nomedaempresa: 202410000 Betinhos, 202410001 DePaula',
  },
  {
    termos: 'despesa abastecimento categoria combustível',
    texto:
      'despesa = cr40f_despesaoperacional (cr40f_nome; lookup cr40f_categoria; data cr40f_datagasto); cr40f_statusoperacional: 100000000 Enviado, 100000001 Precisa corrigir, 100000002 Validado, 100000003 Recusado, 100000004 Cancelado; cr40f_statusfinanceiro: 100000000 Não reembolsável, 100000001 Aguardando pagamento, 100000002 Pago, 100000003 Cancelado; categoria = cr40f_categoriadespesaoperacional (cr40f_nome); abastecimento = categoria "Abastecimento"; totais da tela Despesas: "Total filtrado" soma cr40f_valor de todas as linhas da lista filtrada, sem excluir nenhum status por padrão (a visão padrão é "Todas as despesas"), e "A pagar" soma só cr40f_statusfinanceiro 100000001 Aguardando pagamento; só a conciliação do cartão ignora Recusado (100000003) e Cancelado (100000004). Total "que conta" de despesas (ex.: sem recusadas/canceladas): não definido no Sistema: pergunte ao usuário',
  },
  {
    termos: 'veículo veiculo multa manutenção manutencao equipamento cartão cartao transação',
    texto:
      'veículo = cr40f_veiculos (cr40f_placa; cr40f_statusdoveiculo: 202410001 Ativo, 202410000 Vendido); multa = cr40f_multas (data cr40f_dataehorario); manutenção = tabela cr40f_manutencoes (não a categoria 100000001 do item da reserva): veículo no lookup cr40f_placa_carro (_cr40f_placa_carro_value), data cr40f_datamanutencao, valor cr40f_valor, status cr40f_status; manutenção por veículo = agrupar cr40f_manutencoes por _cr40f_placa_carro_value; equipamento = cr40f_equipamento (cr40f_name); transação de cartão = cr40f_transacaocartao (cr40f_name)',
  },
]

/** Sem termo: tudo; com termo: só os blocos que o citam (sem acento nem caixa). */
export function glossario(termo?: string): string {
  const t = fold(termo ?? '')
  const hit = t ? GLOSSARIO.filter((g) => fold(g.termos).includes(t) || t.split(/\s+/).some((w) => w.length > 2 && fold(g.termos).split(/\s+/).includes(w))) : GLOSSARIO
  const list = hit.length ? hit : GLOSSARIO
  return `${hit.length || !t ? '' : `Sem bloco para "${termo}"; segue tudo.\n`}${list.map((g) => g.texto).join('\n')}`
}
