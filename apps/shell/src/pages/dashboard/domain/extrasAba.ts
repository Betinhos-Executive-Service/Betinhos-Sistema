import { emptyFilters, type FilterCondition } from '@betinhos/ui'
import { brl, int, normL } from './format'
import { comNota, listaGeral, NOTA_PERIODO, top5, topsClientesMotoristas, type ListaAlvo, type Top } from './indicadores'
import type { Contexto } from './kpis'
import { DIA_MS, entre, hojeBR } from './periodo'
import { filtrarDespesas, type FiltrosDespesa } from './abas/despesas'
import { cancelado, produzido } from './kpis'
import { emergencial } from './destaques'
import type { Dados, Reserva } from './types'
import { JANELA_DIAS } from '../../documentos/domain/vencimento'

/* Top 5 e "Ver na lista" dos cards das abas (KPIs e análises), tirados do que já está carregado: um resolvedor só, por aba. */

const entreDatas = (campo: string, de: string, ate: string): Record<string, FilterCondition> => ({
  [campo]: { type: 'condition', id: `rapido-${campo}`, field: campo, op: 'between', value: de, to: ate },
})

/** Lista de destino filtrada só por uma data (a única condição que o dashboard e a lista têm em comum). */
export const listaPorData = (rota: string, campo: string, de: string, ate: string, nota: string = NOTA_PERIODO): ListaAlvo => ({
  rota, nota, filtros: { ...emptyFilters(), quick: entreDatas(campo, de, ate) },
})

/** Funcionários com a validade da CNH vencida ou dentro da janela de atenção (o status ativo fica por conta da lista). */
export const listaCnh = (now: Date): ListaAlvo => {
  const limite = new Date(Date.parse(hojeBR(now)) + JANELA_DIAS * DIA_MS).toISOString().slice(0, 10)
  return listaPorData('funcionarios', 'cnh', '1900-01-01', limite, 'CNH vencida ou a vencer na janela; status ativo não aplicado')
}

const soma$ = (g: { valor: number }[]) => g.reduce((t, x) => t + x.valor, 0)

type Entrada = { ctx: Contexto; dados: Dados; despesa: FiltrosDespesa }

const servicos = (rows: (r: Reserva) => boolean = () => true) => ({ ctx }: Entrada) => topsClientesMotoristas(ctx.rv.filter(rows), 'qtd', '(serviços)')
const despesas = ({ ctx: { f }, dados, despesa }: Entrada): Top[] => {
  const ds = filtrarDespesas(dados.despesas, f, { ...despesa, motoristas: f.motoristas })
  return [
    { titulo: 'Top 5 categorias', itens: top5(ds, (d) => d.categoria, soma$, brl) },
    { titulo: 'Top 5 motoristas', itens: top5(ds, (d) => d.motorista, soma$, brl) },
  ]
}
const manutencoes = (porCusto: boolean) => ({ ctx: { f }, dados }: Entrada): Top[] => {
  const ms = dados.manutencoes.filter((m) => entre(m.dia, f.inicio, f.fim))
  const placa = new Map(dados.veiculos.map((v) => [v.id, v.placa]))
  const [medida, fmt] = porCusto ? [soma$, brl] as const : [(g: unknown[]) => g.length, int] as const
  return [
    { titulo: porCusto ? 'Top 5 veículos por custo' : 'Top 5 veículos', itens: top5(ms, (m) => placa.get(m.veiculoId) ?? '', medida, fmt) },
    { titulo: 'Top 5 tipos de reparo', itens: top5(ms, (m) => (m.tipoReparo === '—' ? '' : m.tipoReparo), medida, fmt) },
  ]
}
const multas = ({ ctx: { f }, dados }: Entrada): Top[] => {
  const ml = dados.multas.filter((m) => entre(m.dia, f.inicio, f.fim))
  return [
    { titulo: 'Top 5 infrações', itens: top5(ml, (m) => m.infracaoDescricao || m.infracaoCodigo, (g) => g.length, int) },
    { titulo: 'Top 5 motoristas', itens: top5(ml, (m) => (normL(m.motorista) === '—' ? '' : m.motorista), (g) => g.length, int) },
  ]
}
const maioresServicos = ({ ctx }: Entrada): Top[] => [{
  titulo: 'Os 5 maiores serviços',
  itens: [...ctx.rv].sort((a, b) => b.valor - a.valor).slice(0, 5).map((r) => ({ rotulo: r.cpCodigo || r.opCodigo || 'Sem código', apoio: r.cliente, valor: brl(r.valor) })),
}]

/**
 * Top 5 só onde ele explica o número, pela mesma regra do indicador ("aba:título"): somas e contagens, inclusive de subconjuntos.
 * Médias, percentuais, tempos e valores sem regra clara ficam fora, sem aproximação.
 */
const REGRAS: Record<string, (e: Entrada) => Top[]> = {
  'servicos:Total de serviços': servicos(),
  'servicos:Serviços por mês': servicos(),
  'servicos:Concluídos': servicos(produzido),
  'servicos:Cancelados': servicos(cancelado),
  'servicos:Emergenciais': servicos(emergencial),
  'financeiro:Maior serviço': maioresServicos,
  'financeiro:Clientes ativos': (e) => servicos()(e).slice(0, 1),
  'despesas:Despesa realizada': despesas,
  'despesas:Despesas por mês': despesas,
  'manutencoes:Manutenções': manutencoes(false),
  'manutencoes:Custo total': manutencoes(true),
  'manutencoes:Custo por mês': manutencoes(true),
  'multas:Multas': multas,
  'multas:Multas por mês': multas,
}

/** Top 5 e "Ver na lista" do card de um KPI ou análise da aba, tirados do que já está carregado. */
export function extrasDaAba(aba: string, titulo: string, ctx: Contexto, dados: Dados, despesa: FiltrosDespesa): { tops?: Top[]; lista: ListaAlvo | null } {
  const { f } = ctx
  const tops = REGRAS[`${aba}:${titulo}`]?.({ ctx, dados, despesa })
  const lista = (() => {
    switch (aba) {
      case 'servicos': case 'financeiro': return comNota(listaGeral(f, ctx.todas, undefined, true))
      case 'despesas': return listaPorData('despesas', 'data', f.inicio, f.fim)
      case 'manutencoes': return listaPorData('frota-manutencoes', 'data', f.inicio, f.fim)
      case 'multas': return listaPorData('frota-multas', 'data', f.inicio, f.fim)
      default: return null
    }
  })()
  return { ...(tops ? { tops } : {}), lista }
}
