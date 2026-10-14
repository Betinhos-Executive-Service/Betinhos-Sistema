import { addMonths, diaSP } from '../data/dates'
import { MULTA } from '../data/schema'
import type { FrotaData, Veiculo } from '../data/types'
import { centavos, multasNoPeriodo, realizadas, type Periodo } from './indicadores'

export type Fonte = 'manutencao' | 'multas' | 'combustivel' | 'documentos'
export const FONTES: Fonte[] = ['manutencao', 'multas', 'combustivel', 'documentos']
export const FONTE_LABEL: Record<Fonte, string> = { manutencao: 'Manutenção', multas: 'Multas', combustivel: 'Combustível', documentos: 'Documentos (IPVA e seguro)' }
export type ParcelaCusto = { valor: number; qtd: number; semValor: number; indisponivel: boolean }
export type CustoTotal = { total: number; porFonte: Record<Fonte, ParcelaCusto>; kmRodado: number | null; custoPorKm: number | null; despesasManutencaoSemVinculo: number }
/** Documento de frota com custo; vazio até a branch de Documentos ser mesclada. */
export type DocumentoCusto = { veiculoId: string; dia: string; valor: number | null }
export type EntradaCusto = Pick<FrotaData, 'manutencoes' | 'multas' | 'infracoes' | 'despesasCombustivel' | 'telemetriaKm'> & { documentos: DocumentoCusto[]; indisponiveis: Partial<Record<Fonte | 'telemetria', boolean>> }
export type CustoVeiculo = { veiculoId: string; placa: string; total: number; custoPorKm: number | null; maiorFonte: Fonte | null }
export type CustoMesEmpilhado = { chave: string; porFonte: Record<Fonte, number>; total: number }

type Lancamento = { fonte: Fonte; dia: string; veiculoId: string | undefined; valor: number | null }

/** Todos os lançamentos de custo do período, já com dia (America/Sao_Paulo) e valor; ignora multa finalizada sem valor. */
function lancamentos(entrada: EntradaCusto, periodo: Periodo): Lancamento[] {
  const valorInfracao = (id: string | null) => entrada.infracoes.find((item) => item.id === id)?.valor ?? null
  const itens: Lancamento[] = []
  for (const m of realizadas(entrada.manutencoes, periodo)) itens.push({ fonte: 'manutencao', dia: diaSP(m.dataManutencao ?? m.criadoEm)!, veiculoId: m.veiculo?.id, valor: m.valor })
  for (const m of multasNoPeriodo(entrada.multas, periodo)) {
    const valor = valorInfracao(m.infracaoId)
    if (m.status === MULTA.FINALIZADO && valor === null) continue
    itens.push({ fonte: 'multas', dia: diaSP(m.dataHora ?? m.criadoEm)!, veiculoId: m.veiculo?.id, valor })
  }
  for (const d of entrada.despesasCombustivel) if (d.categoria === 'combustivel' && d.dia && d.dia >= periodo.de && d.dia <= periodo.ate) itens.push({ fonte: 'combustivel', dia: d.dia, veiculoId: d.veiculo?.id, valor: d.valor })
  for (const d of entrada.documentos) if (d.dia >= periodo.de && d.dia <= periodo.ate) itens.push({ fonte: 'documentos', dia: d.dia, veiculoId: d.veiculoId, valor: d.valor })
  return itens.filter((item) => !entrada.indisponiveis[item.fonte])
}

export function custoTotalVeiculo(entrada: EntradaCusto, veiculoId: string, periodo: Periodo): CustoTotal {
  const porFonte = Object.fromEntries(FONTES.map((f) => [f, { valor: 0, qtd: 0, semValor: 0, indisponivel: !!entrada.indisponiveis[f] }])) as Record<Fonte, ParcelaCusto>
  for (const item of lancamentos(entrada, periodo)) {
    if (item.veiculoId !== veiculoId) continue
    const parcela = porFonte[item.fonte]
    parcela.qtd += 1
    if (item.valor === null) parcela.semValor += 1
    else parcela.valor = centavos(parcela.valor + item.valor)
  }
  const total = centavos(FONTES.reduce((soma, f) => soma + porFonte[f].valor, 0))
  const linhas = entrada.indisponiveis.telemetria ? [] : entrada.telemetriaKm.filter((t) => t.veiculoId === veiculoId && t.dia >= periodo.de && t.dia <= periodo.ate)
  const kmRodado = linhas.length ? linhas.reduce((soma, t) => soma + t.km, 0) : null
  const despesasManutencaoSemVinculo = entrada.despesasCombustivel.filter((d) => d.categoria === 'manutencao' && d.veiculo?.id === veiculoId && d.manutencao === null && d.dia !== null && d.dia >= periodo.de && d.dia <= periodo.ate).length
  return { total, porFonte, kmRodado, custoPorKm: kmRodado && kmRodado > 0 ? centavos(total / kmRodado) : null, despesasManutencaoSemVinculo }
}

export function custoPorVeiculo(entrada: EntradaCusto, veiculos: Pick<Veiculo, 'id' | 'placa'>[], periodo: Periodo): CustoVeiculo[] {
  return veiculos
    .map((veiculo) => {
      const custo = custoTotalVeiculo(entrada, veiculo.id, periodo)
      const maior = FONTES.reduce<Fonte | null>((atual, f) => (custo.porFonte[f].valor > (atual ? custo.porFonte[atual].valor : 0) ? f : atual), null)
      return { veiculoId: veiculo.id, placa: veiculo.placa, total: custo.total, custoPorKm: custo.custoPorKm, maiorFonte: maior }
    })
    .sort((a, b) => b.total - a.total || a.placa.localeCompare(b.placa))
}

export function custoPorMesEmpilhado(entrada: EntradaCusto, periodo: Periodo): CustoMesEmpilhado[] {
  const meses = new Map<string, CustoMesEmpilhado>()
  for (let mes = periodo.de.slice(0, 7); mes <= periodo.ate.slice(0, 7); mes = addMonths(`${mes}-01`, 1).slice(0, 7)) {
    meses.set(mes, { chave: mes, porFonte: { manutencao: 0, multas: 0, combustivel: 0, documentos: 0 }, total: 0 })
  }
  for (const item of lancamentos(entrada, periodo)) {
    const mes = meses.get(item.dia.slice(0, 7))
    if (!mes || item.valor === null) continue
    mes.porFonte[item.fonte] = centavos(mes.porFonte[item.fonte] + item.valor)
    mes.total = centavos(mes.total + item.valor)
  }
  return [...meses.values()]
}
