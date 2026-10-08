import { cnhEmAtencao } from '../alertas'
import { agrupar, mesesComDados, soma } from '../base'
import { stL } from '../format'
import { ticketStats, type Contexto } from '../kpis'
import { DIA_MS, hojeBR, mesRotulo } from '../periodo'
import { linhasScore, notaPorMes, ordenarLinhasScore, rankingMensal, scoreMotoristas, type LinhaScore, type NotaMes, type RankingMes, type ResultadoScore } from '../score'
import type { Dados, Funcionario, Reserva } from '../types'

export type MesMotorista = { mes: string; rotulo: string; qtd: number; pct: number }
export type LinhaRankingMotorista = {
  /** Mesma chave do filtro "Motorista" (`motoristaKey`): id do funcionário ou `nome:<nome>` sem id. */
  key: string
  /** Apelido, senão nome completo ('—' sem os dois), como o `tbMot` do legado. */
  nome: string
  nomeCompleto: string
  funcao: string
  /** Categoria do veículo mais usado no período: true própria, false terceirizada, null sem serviço com veículo, sem categoria ou Aluguel. */
  propria: boolean | null
  servicos: number
  faturamento: number
  ticket: number
  /** Participação nos serviços do recorte (%). */
  pct: number
  /** Validade da CNH (AAAA-MM-DD; '' sem validade). */
  cnhDia: string
  /** Meses com serviço no recorte: quantidade do motorista e % sobre o total do mês. */
  meses: MesMotorista[]
}
export type CnhVencendo = { nome: string; cnhDia: string; /** Dias corridos até a validade (negativo = vencida). */ dias: number }
export type LinhaScoreMotorista = LinhaScore & { nome: string; rotulo: string }
export type Motoristas = {
  /** `null` = s/dado (conjunto não carregou). */
  kpis: { total: number | null; cnhAtencao: number | null; score: ResultadoScore | null }
  /** `months` do legado: meses com serviço no recorte (mínimo 1), divisor do "/mês" do ranking. */
  mesesBase: number
  ranking: LinhaRankingMotorista[]
  cnhVencendo: CnhVencendo[]
  scorePorMotoristaMes: LinhaScoreMotorista[]
  rankingMensal: RankingMes[]
  notaPorMes: NotaMes[]
}

const ativo = (f: Funcionario) => stL(f.statusLabel) === 'ativo'
const diaDaCnh = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '')

/** Veículo mais usado (empate: o do serviço mais recente) e a sua categoria; Aluguel e sem categoria não entram no filtro próprio/terceiro. */
function propriaDe(srvs: Reserva[], categoria: ReadonlyMap<string, string>): boolean | null {
  const uso = new Map<string, { qtd: number; ultimo: number }>()
  for (const r of srvs) {
    if (!r.veiculoId) continue
    const u = uso.get(r.veiculoId) ?? { qtd: 0, ultimo: -Infinity }
    u.qtd += 1
    if (Number.isFinite(r.saidaMs) && r.saidaMs > u.ultimo) u.ultimo = r.saidaMs
    uso.set(r.veiculoId, u)
  }
  const [maisUsado] = [...uso].sort((a, b) => b[1].qtd - a[1].qtd || b[1].ultimo - a[1].ultimo)
  const cat = maisUsado ? categoria.get(maisUsado[0]) : undefined
  return cat === 'Propria' ? true : cat === 'Terceirizada' ? false : null
}

/**
 * Aba Motoristas (`renderMotoristas` + `renderDriverSafetyScore` do legado). Ranking: funcionários ativos (todas as funções) com os
 * serviços de `ctx.rv` casados por id (sem id, pelo nome exibido), ordenados por quantidade (ordem estável do cadastro no empate).
 * Score, ranking mensal e nota por mês vêm do Infleet no período do filtro, sem escopo de veículo (como `scoreMotoristas`).
 */
export function calcularMotoristas(ctx: Contexto, dados: Dados): Motoristas {
  const { rv, f, now } = ctx
  const fora = (c: Dados['indisponiveis'][number]) => dados.indisponiveis.includes(c)
  const semFuncionarios = fora('funcionarios')
  const semInfleet = fora('viagens') || fora('eventos') || fora('telemetria')
  const ativos = semFuncionarios ? [] : dados.funcionarios.filter(ativo)

  const categoria = new Map(dados.veiculos.map((v) => [v.id, v.categoria as string]))
  const porId = agrupar(rv.filter((r) => r.motoristaId), (r) => r.motoristaId)
  const porNome = agrupar(rv, (r) => r.motorista)
  const meses = mesesComDados(rv)
  const porMes = agrupar(rv, (r) => r.mes)
  const ranking = ativos.map((fu): LinhaRankingMotorista => {
    const nome = fu.apelido || fu.nome || '—'
    const srvs = (fu.id ? porId.get(fu.id) : porNome.get(nome)) ?? []
    const doMotorista = agrupar(srvs, (r) => r.mes)
    return {
      key: fu.id || `nome:${nome.toLowerCase()}`,
      nome,
      nomeCompleto: fu.nome || nome,
      funcao: fu.funcao,
      propria: propriaDe(srvs, categoria),
      servicos: srvs.length,
      faturamento: soma(srvs),
      ticket: ticketStats(srvs).ticket,
      pct: rv.length ? (srvs.length / rv.length) * 100 : 0,
      cnhDia: diaDaCnh(fu.cnhMs),
      meses: meses.map((mes) => {
        const qtd = doMotorista.get(mes)?.length ?? 0
        const total = porMes.get(mes)?.length ?? 0
        return { mes, rotulo: mesRotulo(mes), qtd, pct: total ? (qtd / total) * 100 : 0 }
      }),
    }
  }).sort((a, b) => b.servicos - a.servicos)

  const hoje = Date.parse(hojeBR(now))
  const cnhVencendo = (semFuncionarios ? [] : cnhEmAtencao(dados.funcionarios, now.getTime()))
    .sort((a, b) => a.cnhMs - b.cnhMs)
    .map((fu) => {
      const cnhDia = diaDaCnh(fu.cnhMs)
      return { nome: fu.apelido || fu.nome || '—', cnhDia, dias: Math.round((Date.parse(cnhDia) - hoje) / DIA_MS) }
    })

  // `driverMap` do legado: todos os funcionários (inclusive inativos), apelido ou nome.
  const nomes = new Map(dados.funcionarios.map((fu) => [fu.id, fu.apelido || fu.nome || 'Motorista sem nome']))
  const nomeDe = (id: string) => nomes.get(id) || 'Motorista vinculado'
  const linhas = semInfleet ? [] : linhasScore(dados.viagens, dados.eventos, dados.telemetria, f.inicio, f.fim)

  return {
    kpis: {
      total: semFuncionarios ? null : ativos.length,
      cnhAtencao: semFuncionarios ? null : cnhVencendo.length,
      score: semInfleet ? null : scoreMotoristas(dados.viagens, dados.eventos, dados.telemetria, f.inicio, f.fim),
    },
    mesesBase: Math.max(1, meses.length),
    ranking,
    cnhVencendo,
    scorePorMotoristaMes: ordenarLinhasScore(linhas).map((l) => ({ ...l, nome: nomeDe(l.motoristaId), rotulo: mesRotulo(l.mes) })),
    rankingMensal: rankingMensal(linhas, nomeDe),
    notaPorMes: notaPorMes(linhas),
  }
}
