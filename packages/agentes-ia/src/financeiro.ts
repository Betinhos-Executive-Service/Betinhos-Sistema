import { REGRAS_COMUNS, id, num, rotulo, str } from './comum.ts'

type Row = Record<string, unknown>
/** Linhas brutas do Dataverse, como o flow devolve (ListRecords com os $select da Task 7). */
export type DadosFinanceiro = { osConcluidas: Row[]; recibos: Row[]; ops: Row[]; pagamentosTerceiro: Row[] }

export type ContextoFinanceiro = {
  hoje: string
  osConcluidas: { id: string; codigo: string; saida: string; faturamento: number | null; valorAReceber: number | null; temOP: boolean; temRecibo: boolean; cliente: string }[]
  ops: { id: string; codigo: string; status: number | null; valor: number | null; criadaEm: string; cliente: string }[]
  pagamentosTerceiro: { id: string; nome: string; status: number | null; totalRepasse: number | null; margem: number | null; criadoEm: string; favorecido: string }[]
}

export function montarContextoFinanceiro(d: DadosFinanceiro, hoje: string): ContextoFinanceiro {
  const comRecibo = new Set(d.recibos.map((r) => id(r._cr40f_reserva_value)))
  return {
    hoje,
    osConcluidas: d.osConcluidas.map((r) => ({
      id: id(r.cr40f_reservadeveculosid), codigo: str(r.cr40f_idnovo) || str(r.cr40f_id), saida: str(r.cr40f_dataehorriodesada),
      faturamento: num(r.cr40f_statusdefaturamento), valorAReceber: num(r.cr40f_valor_a_receber),
      temOP: Boolean(r._cr40f_financeiro_value), temRecibo: comRecibo.has(id(r.cr40f_reservadeveculosid)), cliente: rotulo(r, '_cr40f_cliente_value'),
    })),
    ops: d.ops.map((r) => ({ id: id(r.cr40f_financeiroid), codigo: str(r.cr40f_idfinanceiro), status: num(r.cr40f_status), valor: num(r.cr40f_valor), criadaEm: str(r.createdon), cliente: str(r.new_clientedaop) })),
    pagamentosTerceiro: d.pagamentosTerceiro.map((r) => ({
      id: id(r.cr40f_pagamentoaterceiroid), nome: str(r.cr40f_name), status: num(r.cr40f_status), totalRepasse: num(r.cr40f_totalrepasse), margem: num(r.cr40f_margemtotal),
      criadoEm: str(r.createdon), favorecido: rotulo(r, '_cr40f_terceirofavorecido_value'),
    })),
  }
}

export const SYSTEM_FINANCEIRO = `Você é o assistente do departamento Financeiro da Betinhos Executive Service (transporte executivo, São Paulo). Você só propõe; uma pessoa aprova.

${REGRAS_COMUNS}

Contexto enviado:
- osConcluidas: OS com status Concluído nos últimos 60 dias. faturamento é o código de cr40f_statusdefaturamento (202410011 Não Faturável, 202410003 Cortesia, 202410004 Permuta, 202410000 Cancelado Sem Taxa: nenhuma delas gera cobrança). temOP indica OP vinculada; temRecibo indica recibo emitido.
- ops: Ordens de Pagamento com status 100000001 (Pagamento Pendente) ou 202410006 (Pagamento Parcial).
- pagamentosTerceiro: lotes de pagamento a terceiro com status 100000002 (Aguardando pagamento) ou margem negativa.

Tipos de proposta (use só estes):
- SemRecibo: OS concluída há mais de 3 dias, faturável, com temRecibo false. registroAlvo: cr40f_reservadeveculos.
- OSSemCobranca: OS concluída há mais de 3 dias, faturável, com temOP false. registroAlvo: cr40f_reservadeveculos.
- OPPendenteAntiga: OP pendente ou parcial criada há mais de 15 dias. registroAlvo: cr40f_financeiro.
- RepasseAguardando: pagamento a terceiro aguardando há mais de 7 dias. registroAlvo: cr40f_pagamentoaterceiro.
- MargemNegativa: pagamento a terceiro com margem menor que zero. registroAlvo: cr40f_pagamentoaterceiro.

Ação permitida: CriarPendencia, com campos {"titulo": texto até 200 caracteres, "descricao": texto}. Use-a em toda proposta. Nunca proponha alterar valores.
Prioridade: alta quando o valor envolvido for maior que R$ 2.000 ou o atraso maior que 30 dias; baixa quando menor que R$ 300; media nos demais.`
