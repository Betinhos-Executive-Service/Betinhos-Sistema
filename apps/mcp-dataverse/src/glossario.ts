import { fold } from './dicas'

/** Regras de negócio vindas das telas do Sistema (apps/shell), conferidas na metadata do DEV. Formato "termo = regra"; sem chamada de rede. */
export const GLOSSARIO: { termos: string; texto: string }[] = [
  {
    termos: 'serviço viagem os reserva geral status cancelado',
    texto:
      'serviço/viagem/OS = cr40f_reservadeveculos (cr40f_id; rótulo "Geral"); saída cr40f_dataehorriodesada; cr40f_status "Status de Operação": 202410000 Pré-reserva, 202410004 Solicitado, 202410001 Confirmado, 202410005 Programado, 202410006 Em Execução, 202410008 Concluído, 202410002 Cancelado, 202410010 Cancelado com Ressalvas, 100000001 Requer Análise; OP do serviço = lookup cr40f_financeiro; categoria new_categoriadoitem: 100000000 Serviço, 100000001 Manutenção, 100000002 Troca de Veículos',
  },
  {
    termos: 'faturamento valor preço composição a receber pago status de faturamento',
    texto:
      'valor/faturamento do serviço = new_valortotal da composição cr40f_composicaodeprecos (lookup new_composicaodepreco, _new_composicaodepreco_value; new_status 100000000 Pendente, 100000001 Concluido); faturamento do painel = soma de new_valortotal dos serviços com new_categoriadoitem 100000000, por cr40f_dataehorriodesada, sem filtro de status; "a receber" do painel = composição concluída + com OP + cr40f_statusdefaturamento ≠ 202410010 + valor > 0\ncr40f_statusdefaturamento "Status de Faturamento": 202410010 Pago, 202410005 Pendente, 202410007 Pagamento Pendente, 202410012 Pagamento Em Atraso, 202410008 Faturamento Mensal, 100000001 Composição Realizada, 202410006 Pagante em Viagem, 202410002 Cancelado Com Taxa, 202410000 Cancelado Sem Taxa, 202410003 Cortesia, 202410004 Permuta, 202410011 Não Faturável\ncr40f_valor_a_receber ("Valor a receber", Money) = valor a receber do motorista/serviço (Recebimentos e App Motoristas); NÃO é o faturamento do painel',
  },
  {
    termos: 'passageiro cliente',
    texto: 'passageiro = cr40f_bancodedados (cr40f_nomedopassageiro; tem lookup cr40f_cliente); cliente = cr40f_clientes1 (cr40f_nomedocliente); serviço: Passageiro1..4 = cr40f_Passageiro1..4, Cliente = cr40f_Cliente',
  },
  {
    termos: 'cotação cotacao pedido de cotação',
    texto:
      'cotação = cr40f_pedidodecotacao (cr40f_titulo); cr40f_statuscotacao: abertas 100004000 Nova, 100004001 Em análise pelo financeiro, 100004002 Aguardando informação, 100004003 Cotada, 100004004 Respondida ao cliente; encerradas 100004007 "Convertida em serviço" (no código "Aceita pelo cliente": ganha), 100004006 Perdida (com motivo), 100004005 Cancelada; valor cr40f_valorcotado; prazo cr40f_prazoresponder',
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
      'despesa = cr40f_despesaoperacional (cr40f_nome; lookup cr40f_categoria; data cr40f_datagasto); cr40f_statusoperacional: 100000000 Enviado, 100000001 Precisa corrigir, 100000002 Validado, 100000003 Recusado, 100000004 Cancelado; cr40f_statusfinanceiro: 100000000 Não reembolsável, 100000001 Aguardando pagamento, 100000002 Pago, 100000003 Cancelado; categoria = cr40f_categoriadespesaoperacional (cr40f_nome); abastecimento = categoria "Abastecimento"',
  },
  {
    termos: 'veículo veiculo multa manutenção manutencao equipamento cartão cartao transação',
    texto:
      'veículo = cr40f_veiculos (cr40f_placa; cr40f_statusdoveiculo: 202410001 Ativo, 202410000 Vendido); multa = cr40f_multas (data cr40f_dataehorario); manutenção = cr40f_manutencoes (data cr40f_datamanutencao; valor cr40f_valor); equipamento = cr40f_equipamento (cr40f_name); transação de cartão = cr40f_transacaocartao (cr40f_name)',
  },
]

/** Sem termo: tudo; com termo: só os blocos que o citam (sem acento nem caixa). */
export function glossario(termo?: string): string {
  const t = fold(termo ?? '')
  const hit = t ? GLOSSARIO.filter((g) => fold(g.termos).includes(t) || t.split(/\s+/).some((w) => w.length > 2 && fold(g.termos).split(/\s+/).includes(w))) : GLOSSARIO
  const list = hit.length ? hit : GLOSSARIO
  return `${hit.length || !t ? '' : `Sem bloco para "${termo}"; segue tudo.\n`}${list.map((g) => g.texto).join('\n')}`
}
