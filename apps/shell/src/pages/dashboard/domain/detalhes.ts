import { QUALIDADE, cnhEmAtencao, multasPendentes, type AlertaQualidade } from './alertas'
import { infracaoDe } from './abas/multas'
import { aReceberLinha, cpPendentes } from './kpis'
import { DIA_MS, entre, hojeBR, type Periodo } from './periodo'
import type { Funcionario, Multa, Reserva } from './types'

/* Drill-down: as listas por trás de um KPI, alerta ou linha, tiradas do que já está carregado (sem consulta nova). */

/** Tabelas do Dataverse que o link "Abrir no Dataverse" abre. */
export const ENTIDADE = { reserva: 'cr40f_reservadeveculos', funcionario: 'cr40f_funcionarios', multa: 'cr40f_multas' } as const
export type Entidade = keyof typeof ENTIDADE

export type LinhaServicoDetalhe = { id: string; dia: string; codigo: string; op: string; cliente: string; motorista: string; status: string; valor: number }
export type LinhaCnhDetalhe = { id: string; motorista: string; validade: string; /** Dias até a validade (negativo = vencida). */ dias: number }
export type LinhaMultaDetalhe = { id: string; dia: string; motorista: string; infracao: string; status: string }

type Base = { titulo: string; descricao: string }
export type Detalhe =
  | (Base & { tipo: 'servicos'; /** Mostra a coluna OP (A receber). */ comOp: boolean; linhas: LinhaServicoDetalhe[] })
  | (Base & { tipo: 'cnh'; linhas: LinhaCnhDetalhe[] })
  | (Base & { tipo: 'multas'; linhas: LinhaMultaDetalhe[] })

/** Ordem cronológica (sem data no fim); empate pelo horário e pelo código. */
const cronologica = (a: Reserva, b: Reserva) =>
  (a.dia || '9999').localeCompare(b.dia || '9999') || (a.saidaMs || 0) - (b.saidaMs || 0) || a.cpCodigo.localeCompare(b.cpCodigo, 'pt-BR')

export const linhaServico = (r: Reserva): LinhaServicoDetalhe => ({
  id: r.id, dia: r.dia, codigo: r.cpCodigo, op: r.opCodigo, cliente: r.cliente, motorista: r.motorista, status: r.statusLabel, valor: r.valor || 0,
})
const servicos = (titulo: string, descricao: string, rows: Reserva[], comOp = false): Detalhe =>
  ({ tipo: 'servicos', titulo, descricao, comOp, linhas: [...rows].sort(cronologica).map(linhaServico) })

/** KPI "CP pendente" do Resumo: uma linha por CP pendente (`getSemValorRows`), as mesmas do número do card. */
export const detalheCpPendente = (rv: Reserva[]) =>
  servicos('CP pendente', 'Serviços produzidos com composição de preço e faturamento pendentes.', cpPendentes(rv))

/** KPI "A receber" do Resumo: CP concluída, com OP, faturamento não pago e valor positivo. */
export const detalheAReceber = (rv: Reserva[]) =>
  servicos('A receber', 'Serviços com composição concluída e OP emitida, ainda sem faturamento pago.', rv.filter(aReceberLinha), true)

export type QualidadeComLista = Exclude<AlertaQualidade, 'semTipoVeiculo'>
const TITULO_QUALIDADE: Record<QualidadeComLista, [string, string]> = {
  semVeiculo: ['Sem veículo', 'Serviços já iniciados, não cancelados, com motorista e sem veículo (desde 01/06/2026).'],
  semMotorista: ['Sem motorista', 'Serviços confirmados, programados ou concluídos, já iniciados e sem motorista (desde 10/04/2026).'],
  semCliente: ['Sem cliente', 'Serviços sem cliente informado (desde 01/04/2026).'],
}
/** Alertas de qualidade do Resumo: os serviços do recorte que acendem o alerta, pela mesma regra do número. */
export function detalheQualidade(id: QualidadeComLista, rv: Reserva[], nowMs: number): Detalhe {
  const [titulo, descricao] = TITULO_QUALIDADE[id]
  return servicos(titulo, descricao, rv.filter((r) => QUALIDADE[id](r, nowMs)))
}

/** Serviços de uma linha do ranking de motoristas: pelo id do funcionário ou, sem id (`nome:`), pelo nome exibido (como o ranking). */
export function detalheServicosMotorista(rv: Reserva[], motorista: { key: string; nome: string }): Detalhe {
  const rows = motorista.key.startsWith('nome:') ? rv.filter((r) => r.motorista === motorista.nome) : rv.filter((r) => r.motoristaId === motorista.key)
  return servicos(`Serviços de ${motorista.nome}`, 'Serviços do motorista no período e nos filtros do dashboard.', rows)
}

/** "CNH em atenção": funcionários ativos com CNH vencida ou vencendo em até 90 dias, da validade mais antiga para a mais nova. */
export function detalheCnh(funcionarios: Funcionario[], now: Date): Detalhe {
  const hoje = Date.parse(hojeBR(now))
  const linhas = cnhEmAtencao(funcionarios, now.getTime()).sort((a, b) => a.cnhMs - b.cnhMs).map((fu): LinhaCnhDetalhe => {
    const validade = new Date(fu.cnhMs).toISOString().slice(0, 10)
    return { id: fu.id, motorista: fu.apelido || fu.nome || '—', validade, dias: Math.round((Date.parse(validade) - hoje) / DIA_MS) }
  })
  return { tipo: 'cnh', titulo: 'CNH em atenção', descricao: 'Motoristas ativos com CNH vencida ou com validade em até 90 dias.', linhas }
}

/** "Multas pendentes": status Notificar o condutor, pela data da multa no período. */
export function detalheMultasPendentes(multas: Multa[], p: Periodo): Detalhe {
  const linhas = multasPendentes(multas.filter((m) => entre(m.dia, p.inicio, p.fim)))
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((m): LinhaMultaDetalhe => ({ id: m.id, dia: m.dia, motorista: m.motorista, infracao: infracaoDe(m), status: m.statusLabel || '—' }))
  return { tipo: 'multas', titulo: 'Multas pendentes', descricao: 'Multas com status Notificar o condutor, pela data da multa no período.', linhas }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Link do formulário do registro no Dataverse; null sem `clientUrl` (modo exemplo) ou sem GUID (histórico CSV). */
export function linkRegistro(clientUrl: string | null, entidade: Entidade, id: string) {
  if (!clientUrl || !GUID.test(id)) return null
  return `${clientUrl}/main.aspx?etn=${ENTIDADE[entidade]}&id=${id}&pagetype=entityrecord`
}
