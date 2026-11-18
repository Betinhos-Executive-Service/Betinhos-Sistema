import { JANELA_DIAS } from '../../documentos/domain/vencimento'
import { QUALIDADE, cnhEmAtencao, multasPendentes, type AlertaQualidade } from './alertas'
import { infracaoDe } from './abas/multas'
import { aReceberLinha, cpPendentes } from './kpis'
import { calcularResumo } from './resumo'
import { extrasDoKpi, indicadorDoId, listaGeral, nomeDoMotorista, top5, topsClientesMotoristas, ID_KPI, type Extras, type TabelaDetalhe, type Top } from './indicadores'
import { listaCnh, listaPorData } from './extrasAba'
import { DIA_MS, entre, hojeBR, type Periodo } from './periodo'
import { normL, plural } from './format'
import type { Contexto } from './kpis'
import type { Dados, Funcionario, Multa, Reserva } from './types'

/* Drill-down: as listas por trás de um KPI, alerta ou linha, tiradas do que já está carregado (sem consulta nova). */

/** Tabelas do Dataverse que o link "Abrir no Dataverse" abre. */
export const ENTIDADE = { reserva: 'cr40f_reservadeveculos', funcionario: 'cr40f_funcionarios', multa: 'cr40f_multas' } as const
export type Entidade = keyof typeof ENTIDADE

export type LinhaServicoDetalhe = { id: string; dia: string; codigo: string; op: string; cliente: string; motorista: string; status: string; valor: number }
export type LinhaCnhDetalhe = { id: string; motorista: string; validade: string; /** Dias até a validade (negativo = vencida). */ dias: number }
export type LinhaMultaDetalhe = { id: string; dia: string; motorista: string; infracao: string; status: string }

type Base = { titulo: string; descricao: string } & Extras
/** Indicador sem lista de registros (faturamento, total produzido…): o card mostra a tabela de números dele. */
export type IndicadorDetalhe = Base & { tipo: 'indicador'; tabela: TabelaDetalhe }
/** O que o card ampliado abre: lista de registros ou indicador. */
export type Ampliado = Detalhe | IndicadorDetalhe
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
  const rows = rv.filter((r) => QUALIDADE[id](r, nowMs))
  return { ...servicos(titulo, descricao, rows), tops: topsClientesMotoristas(rows, 'qtd', '(serviços)') }
}

/** Serviços de uma linha do ranking de motoristas: pelo id do funcionário ou, sem id (`nome:`), pelo nome exibido (como o ranking). */
export function detalheServicosMotorista(rv: Reserva[], motorista: { key: string; nome: string }): Detalhe {
  const rows = motorista.key.startsWith('nome:') ? rv.filter((r) => r.motorista === motorista.nome) : rv.filter((r) => r.motoristaId === motorista.key)
  return servicos(`Serviços de ${motorista.nome}`, 'Serviços do motorista no período e nos filtros do dashboard.', rows)
}

/** "CNH em atenção": funcionários ativos com CNH vencida ou vencendo em até 60 dias (JANELA_DIAS), da validade mais antiga para a mais nova. */
export function detalheCnh(funcionarios: Funcionario[], now: Date): Extract<Detalhe, { tipo: 'cnh' }> {
  const hoje = Date.parse(hojeBR(now))
  const linhas = cnhEmAtencao(funcionarios, now.getTime()).sort((a, b) => a.cnhMs - b.cnhMs).map((fu): LinhaCnhDetalhe => {
    const validade = new Date(fu.cnhMs).toISOString().slice(0, 10)
    return { id: fu.id, motorista: fu.apelido || fu.nome || '—', validade, dias: Math.round((Date.parse(validade) - hoje) / DIA_MS) }
  })
  return { tipo: 'cnh', titulo: 'CNH em atenção', descricao: `Motoristas ativos com CNH vencida ou com validade em até ${JANELA_DIAS} dias.`, linhas }
}

/** "Multas pendentes": etapa 1 (identificar o responsável), pela data da multa no período. */
export function detalheMultasPendentes(multas: Multa[], p: Periodo): Extract<Detalhe, { tipo: 'multas' }> {
  const linhas = multasPendentes(multas.filter((m) => entre(m.dia, p.inicio, p.fim)))
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((m): LinhaMultaDetalhe => ({ id: m.id, dia: m.dia, motorista: m.motorista, infracao: infracaoDe(m), status: m.statusLabel || '—' }))
  return { tipo: 'multas', titulo: 'Multas pendentes', descricao: 'Multas na etapa 1. Identificar o responsável, pela data da multa no período.', linhas }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Link do formulário do registro no Dataverse; null sem `clientUrl` (modo exemplo) ou sem GUID (histórico CSV). */
export function linkRegistro(clientUrl: string | null, entidade: Entidade, id: string) {
  if (!clientUrl || !GUID.test(id)) return null
  return `${clientUrl}/main.aspx?etn=${ENTIDADE[entidade]}&id=${id}&pagetype=entityrecord`
}

/** Id do drill-down de uma linha do ranking de motoristas (`motorista:<key>`). */
export const idDetalheMotorista = (key: string) => `motorista:${key}`


/** KPIs com lista de serviços: a lista de sempre mais valor, gráfico, comparativo e top 5 do indicador. */
function comExtrasDoKpi(d: Detalhe, kpi: keyof typeof ID_KPI, ctx: Contexto, dados: Dados): Detalhe {
  const { tabela: _, ...extras } = extrasDoKpi(kpi, ctx, calcularResumo(ctx, dados).kpis)
  return { ...d, ...extras }
}

const topCnh = (d: Extract<Detalhe, { tipo: 'cnh' }>): Top[] => [{
  titulo: 'Top 5 vencimentos mais próximos',
  itens: d.linhas.slice(0, 5).map((l) => ({ rotulo: l.motorista, valor: l.dias < 0 ? `Vencida há ${plural(-l.dias, 'dia', 'dias')}` : l.dias === 0 ? 'Vence hoje' : `Vence em ${plural(l.dias, 'dia', 'dias')}` })),
}]

const topMultas = (d: Extract<Detalhe, { tipo: 'multas' }>): Top[] => [
  { titulo: 'Top 5 infrações', itens: top5(d.linhas, (l) => l.infracao, (g) => g.length, (v) => String(v)) },
  { titulo: 'Top 5 motoristas', itens: top5(d.linhas, (l) => l.motorista, (g) => g.length, (v) => String(v)) },
]

/**
 * Drill-down pelo id guardado na URL (`detalhe=cnh`): refaz a lista com o recorte atual.
 * `null` enquanto os dados não chegaram ou se o id não existe mais (ex.: motorista fora do filtro).
 */
export function detalheDoId(id: string, ctx: Contexto, dados: Dados): Detalhe | null {
  const agora = ctx.now.getTime()
  switch (id) {
    case 'cp-pendente': return comExtrasDoKpi(detalheCpPendente(ctx.rv), 'cpPendente', ctx, dados)
    case 'a-receber': return comExtrasDoKpi(detalheAReceber(ctx.rv), 'aReceber', ctx, dados)
    case 'cnh': { const d = detalheCnh(dados.funcionarios, ctx.now); return { ...d, tops: topCnh(d), lista: listaCnh(ctx.now) } }
    case 'multas': { const d = detalheMultasPendentes(dados.multas, ctx.f); return { ...d, tops: topMultas(d), lista: listaPorData('frota-multas', 'data', ctx.f.inicio, ctx.f.fim) } }
    case 'sem-veiculo': return detalheQualidade('semVeiculo', ctx.rv, agora)
    case 'sem-motorista': return detalheQualidade('semMotorista', ctx.rv, agora)
    case 'sem-cliente': return detalheQualidade('semCliente', ctx.rv, agora)
  }
  if (!id.startsWith('motorista:')) return null
  const key = id.slice('motorista:'.length)
  const nome = nomeDoMotorista(ctx, key)
  if (!nome) return null
  const d = detalheServicosMotorista(ctx.rv, { key, nome })
  const doMotorista = key.startsWith('nome:') ? ctx.rv.filter((r) => r.motorista === nome) : ctx.rv.filter((r) => r.motoristaId === key)
  return { ...d, tops: [topsClientesMotoristas(doMotorista, 'dinheiro', 'em R$')[0]], lista: listaGeral(ctx.f, ctx.todas, { key, nome }) }
}

/** Card ampliado pelo id da URL: indicador (faturamento, total produzido…) ou a lista de registros de `detalheDoId`. */
export function ampliadoDoId(id: string, ctx: Contexto, dados: Dados): Ampliado | null {
  const indicador = indicadorDoId(id, ctx, dados)
  return indicador ? { tipo: 'indicador', ...indicador } : detalheDoId(id, ctx, dados)
}
