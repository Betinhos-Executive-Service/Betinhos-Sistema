import { agrupar, passaSegmentos } from '../base'
import { anteriorDe, comparar, servicosAnteriores, type ChipAnterior } from '../comparar'
import { int, normL } from '../format'
import type { Contexto } from '../kpis'
import { manutencaoEmAndamento } from './manutencoes'
import { entre, fmtDia, mesRotulo, parseDia } from '../periodo'
import type { Conjunto, Dados, EventoConducao, Reserva, TelemetriaDia, Veiculo } from '../types'

/** Início do uso mensal da frota própria (legado L15912: a contagem só vale a partir de 01/06/2026). */
export const CORTE_USO_FROTA = '2026-06-01'
const INFLEET: Conjunto[] = ['viagens', 'eventos', 'telemetria']

export type KpisFrota = {
  /** Frota: o cadastro sem os veículos de status "Vendido" (spec §6). */
  total: number
  /** Cadastro inteiro e quantos dele estão vendidos (apoio do total). */
  cadastrados: number; vendidos: number
  /** Status "ativo" ou "ativo(a)" (`isActiveVehicle` do legado; spec §6). */
  disponiveis: number
  /** Blindados da frota (sem os vendidos). */
  blindados: number
  /** Veículos distintos da frota com manutenção em andamento no período (spec §6); null = manutenções indisponíveis (s/dado). */
  emManutencao: number | null
  /** Média dos percentuais diários de uso da frota própria na janela do uso mensal; null sem próprios ativos ou sem dias. */
  usoMedioPropria: number | null
  /** `veiculos` falhou: cards cadastrais e uso em s/dado. */
  indisponivel: boolean
}
export type TelemetriaFrota = {
  km: number; velocidadeMedia: number; velocidadeMaxima: number; excessos: number
  /** km/l real das viagens; null fora da faixa de 2 a 30 ou sem km/litros (legado mostra "—"). */
  consumoKmL: number | null
  ociosoMin: number
}
/** Médias diárias de um grupo de dias (`fmtBucket` do legado). */
export type BucketUso = { dias: number; pct: number; ociosos: number; terceiros: number; aluguel: number }
export type UsoMes = {
  mes: string; rotulo: string
  /** % médio de uso dos próprios em dias úteis / fim de semana; null sem dias daquele tipo no mês. */
  usoUteis: number | null; usoFds: number | null
  /** Médias diárias do mês inteiro (úteis + fim de semana). */
  usados: number; ociosos: number; terceiros: number; aluguel: number
  uteis: BucketUso; fds: BucketUso
}
/**
 * Eventos classificados por mês; `excesso` é a 1ª categoria do legado e tem precedência na classificação.
 * `total` soma as 4 categorias; `km` é a distância diária do mês (mesmo escopo e período); `taxa` = total / km × 1.000
 * (0 sem km), a medida do `cFrotaEventosMensal`; `tendencia` é a reta de mínimos quadrados sobre as taxas (`rateTrend`).
 */
export type EventosMes = {
  mes: string; rotulo: string; aceleracao: number; frenagem: number; curva: number; excesso: number
  total: number; km: number; taxa: number; tendencia: number
}
export type Frota = {
  kpis: KpisFrota
  /** null quando qualquer conjunto Infleet falhou. */
  telemetria: TelemetriaFrota | null
  kmPorDia: { dia: string; km: number }[]
  usoMensal: UsoMes[]
  /** Ativos no escopo usados no uso mensal (`metaFrotaUso`). */
  usoTotais: { proprios: number; terceiros: number; aluguel: number }
  eventosPorMes: EventosMes[]
  infleetIndisponivel: boolean
  /**
   * Chips "ANT." de Km rodados (subir é favorável), Excessos e Motor ocioso (cair é favorável), com o mesmo escopo aplicado ao período
   * anterior (veículos com serviço nele); null com o Infleet fora do ar.
   */
  ant: { km: ChipAnterior; excessos: ChipAnterior; ocioso: ChipAnterior } | null
}

type Categoria = 'excesso' | 'aceleracao' | 'frenagem' | 'curva'
/** `eventCategories` do legado (L15622): a primeira que casa vence; slug e descrição em minúsculas. */
const CATEGORIAS: { key: Categoria; match: (tipo: string, texto: string) => boolean }[] = [
  { key: 'excesso', match: (t, x) => t.includes('overspeed') || x.includes('velocidade') },
  { key: 'aceleracao', match: (t, x) => t.includes('acceleration') || x.includes('acelera') },
  { key: 'frenagem', match: (t, x) => t.includes('braking') || x.includes('frenagem') || x.includes('freada') },
  { key: 'curva', match: (t, x) => t.includes('cornering') || x.includes('curva') },
]
const classificar = (e: EventoConducao) => {
  const tipo = e.tipo.toLowerCase()
  const texto = e.descricao.toLowerCase()
  return CATEGORIAS.find((c) => c.match(tipo, texto))?.key ?? null
}

/** `rateTrend` do legado: regressão linear pelos índices, limitada a ≥ 0; com menos de 2 pontos devolve os próprios valores. */
export function tendenciaLinear(valores: number[]) {
  const n = valores.length
  if (n < 2) return [...valores]
  const xMedia = (n - 1) / 2
  const yMedia = valores.reduce((s, v) => s + v, 0) / n
  const den = valores.reduce((s, _, i) => s + (i - xMedia) ** 2, 0)
  const incl = den ? valores.reduce((s, v, i) => s + (i - xMedia) * (v - yMedia), 0) / den : 0
  return valores.map((_, i) => Math.max(0, yMedia + incl * (i - xMedia)))
}

/** `isActiveVehicle` do legado: só "ativo" ou "ativo(a)". */
const ativo = (v: Veiculo) => { const s = normL(v.statusLabel).trim(); return s === 'ativo' || s === 'ativo(a)' }
const vendido = (v: Veiculo) => normL(v.statusLabel).includes('vendid')
/** `isReservableService` do legado. */
const reservavel = (r: Reserva) => { const k = normL(r.statusLabel); return !k.includes('cancel') && !k.includes('recus') }

type Acum = { dias: number; pct: number; usados: number; ociosos: number; terceiros: number; aluguel: number }
const novoAcum = (): Acum => ({ dias: 0, pct: 0, usados: 0, ociosos: 0, terceiros: 0, aluguel: 0 })
const media = (a: Acum): BucketUso => ({
  dias: a.dias, pct: a.dias ? a.pct / a.dias : 0, ociosos: a.dias ? a.ociosos / a.dias : 0,
  terceiros: a.dias ? a.terceiros / a.dias : 0, aluguel: a.dias ? a.aluguel / a.dias : 0,
})

/**
 * `buildOwnFleetUsageRows` do legado: para cada dia de max(início, 01/06/2026) até o fim, a fração dos próprios ativos
 * com reserva não cancelada/recusada; reservas do período e dos segmentos sem filtrar a categoria do item (`VW.reservas`),
 * dia pelo texto bruto `slice(0, 10)`.
 */
function usoFrota(vei: Veiculo[], ctx: Contexto) {
  const ids = (cat: Veiculo['categoria']) => new Set(vei.filter((v) => ativo(v) && v.categoria === cat && v.id).map((v) => v.id))
  const proprios = ids('Propria')
  const terceiros = ids('Terceirizada')
  const aluguel = ids('Aluguel')
  const porDia = new Map<string, { own: Set<string>; third: Set<string>; rental: Set<string> }>()
  for (const r of ctx.todas) {
    if (!entre(r.dia, ctx.f.inicio, ctx.f.fim) || !passaSegmentos(r, ctx.f) || !reservavel(r)) continue
    const id = r.veiculoId
    if (!id || !r.saidaRaw || (!proprios.has(id) && !terceiros.has(id) && !aluguel.has(id))) continue
    const dia = r.saidaRaw.slice(0, 10)
    let d = porDia.get(dia)
    if (!d) { d = { own: new Set(), third: new Set(), rental: new Set() }; porDia.set(dia, d) }
    if (proprios.has(id)) d.own.add(id)
    if (terceiros.has(id)) d.third.add(id)
    if (aluguel.has(id)) d.rental.add(id)
  }

  const inicio = ctx.f.inicio > CORTE_USO_FROTA ? ctx.f.inicio : CORTE_USO_FROTA
  const meses = new Map<string, { uteis: Acum; fds: Acum }>()
  const total = novoAcum()
  const { y, m, d: d0 } = parseDia(inicio)
  for (let i = 0, dia = inicio; dia <= ctx.f.fim; i++, dia = fmtDia(y, m, d0 + i)) {
    const p = parseDia(dia)
    const fds = [0, 6].includes(new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay())
    const mes = dia.slice(0, 7)
    let b = meses.get(mes)
    if (!b) { b = { uteis: novoAcum(), fds: novoAcum() }; meses.set(mes, b) }
    const linha = porDia.get(dia)
    const usados = proprios.size ? (linha?.own.size ?? 0) : 0
    const pct = proprios.size ? (usados / proprios.size) * 100 : 0
    for (const a of [fds ? b.fds : b.uteis, total]) {
      a.dias += 1
      a.pct += pct
      a.usados += usados
      a.ociosos += Math.max(0, proprios.size - usados)
      a.terceiros += linha?.third.size ?? 0
      a.aluguel += linha?.rental.size ?? 0
    }
  }

  const usoMensal = [...meses].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, b]): UsoMes => {
    const dias = b.uteis.dias + b.fds.dias
    const somaMes = (k: keyof Acum) => (b.uteis[k] + b.fds[k]) / dias
    const uteis = media(b.uteis)
    const fds = media(b.fds)
    return {
      mes, rotulo: mesRotulo(mes), usoUteis: uteis.dias ? uteis.pct : null, usoFds: fds.dias ? fds.pct : null,
      usados: somaMes('usados'), ociosos: somaMes('ociosos'), terceiros: somaMes('terceiros'), aluguel: somaMes('aluguel'), uteis, fds,
    }
  })
  return {
    usoMensal,
    usoMedio: proprios.size && total.dias ? total.pct / total.dias : null,
    totais: { proprios: proprios.size, terceiros: terceiros.size, aluguel: aluguel.size },
  }
}

/**
 * Aba Frota (`renderFrota` + `renderInfleetTelemetry` do legado). KPIs cadastrais: a frota inteira (`dados.veiculos`), pois
 * descrevem o cadastro e o template do legado que os escopava nunca foi montado (decisão do controller, Fix round 1).
 * Divergência consciente (spec §6): o status do veículo só tem Ativo, Vendido ou vazio, então "Em manutenção" por palavra-chave
 * ficava sempre em 0. Agora a frota exclui os vendidos, "Disponíveis" são os ativos e "Em manutenção" são os veículos distintos da
 * frota com manutenção em andamento (Solicitado, Aprovado ou Programado) pela data da manutenção no período do filtro.
 * Uso da frota própria, telemetria, viagens e eventos mantêm o escopo do legado: como o filtro de datas está sempre
 * preenchido (`hasFleetFilters` verdadeiro), só os veículos com serviço em `ctx.rv`, no período do filtro (dia em Brasília).
 */
export function calcularFrota(ctx: Contexto, dados: Dados): Frota {
  const { f } = ctx
  const escopo = new Set(ctx.rv.map((r) => r.veiculoId).filter(Boolean))
  const veiIndisp = dados.indisponiveis.includes('veiculos')
  const cadastro = veiIndisp ? [] : dados.veiculos
  const vei = cadastro.filter((v) => escopo.has(v.id))
  const uso = veiIndisp ? { usoMensal: [], usoMedio: null, totais: { proprios: 0, terceiros: 0, aluguel: 0 } } : usoFrota(vei, ctx)
  const frota = cadastro.filter((v) => !vendido(v))
  const idsFrota = new Set(frota.map((v) => v.id).filter(Boolean))
  const emManutencao = dados.indisponiveis.includes('manutencoes') ? null : new Set(dados.manutencoes
    .filter((m) => m.veiculoId && idsFrota.has(m.veiculoId) && entre(m.dia, f.inicio, f.fim) && manutencaoEmAndamento(m.statusLabel))
    .map((m) => m.veiculoId)).size

  const kpis: KpisFrota = {
    total: frota.length,
    cadastrados: cadastro.length,
    vendidos: cadastro.length - frota.length,
    disponiveis: frota.filter(ativo).length,
    blindados: frota.filter((v) => v.blindado).length,
    emManutencao,
    usoMedioPropria: uso.usoMedio,
    indisponivel: veiIndisp,
  }

  const infleetIndisponivel = INFLEET.some((c) => dados.indisponiveis.includes(c))
  const base = { kpis, usoMensal: uso.usoMensal, usoTotais: uso.totais, infleetIndisponivel }
  if (infleetIndisponivel) return { ...base, telemetria: null, kmPorDia: [], eventosPorMes: [], ant: null }

  const noEscopo = (r: { dia: string; veiculoId: string }) => entre(r.dia, f.inicio, f.fim) && escopo.has(r.veiculoId)
  const diarias = dados.telemetria.filter(noEscopo)
  // Período anterior com a mesma regra de escopo: os veículos com serviço nele, pela distância diária no período anterior.
  const pAnt = anteriorDe(ctx)
  const rvAnt = servicosAnteriores(ctx)
  const escopoAnt = new Set((rvAnt ?? []).map((r) => r.veiculoId).filter(Boolean))
  const diariasAnt = pAnt && rvAnt ? dados.telemetria.filter((t) => entre(t.dia, pAnt.inicio, pAnt.fim) && escopoAnt.has(t.veiculoId)) : null
  const somaDe = (rows: TelemetriaDia[] | null, k: 'distanciaKm' | 'excessos' | 'ociosoMin') => (rows ? rows.reduce((s, t) => s + t[k], 0) : null)
  const viagens = dados.viagens.filter(noEscopo)
  const eventos = dados.eventos.filter(noEscopo)

  const km = diarias.reduce((s, t) => s + t.distanciaKm, 0)
  const peso = diarias.reduce((s, t) => s + Math.max(t.distanciaKm, 1), 0)
  const velPonderada = diarias.reduce((s, t) => s + t.velocidadeMedia * Math.max(t.distanciaKm, 1), 0)
  const kmViagens = viagens.reduce((s, v) => s + v.distancia, 0)
  const litros = viagens.reduce((s, v) => s + v.combustivelL, 0)
  const consumo = kmViagens > 0 && litros > 0 ? kmViagens / litros : 0
  const telemetria: TelemetriaFrota = {
    km,
    velocidadeMedia: peso ? velPonderada / peso : 0,
    velocidadeMaxima: diarias.reduce((m, t) => Math.max(m, t.velocidadeMaxima), 0),
    excessos: diarias.reduce((s, t) => s + t.excessos, 0),
    consumoKmL: consumo >= 2 && consumo <= 30 ? consumo : null,
    ociosoMin: diarias.reduce((s, t) => s + t.ociosoMin, 0),
  }

  const kmPorDia = [...agrupar(diarias.filter((t) => t.dia), (t) => t.dia)]
    .map(([dia, rows]) => ({ dia, km: rows.reduce((s, t) => s + t.distanciaKm, 0) }))
    .sort((a, b) => a.dia.localeCompare(b.dia))

  const porMes = new Map<string, Record<Categoria, number>>()
  for (const e of eventos) {
    const cat = classificar(e)
    if (!cat || !e.mes) continue
    let linha = porMes.get(e.mes)
    if (!linha) { linha = { aceleracao: 0, frenagem: 0, curva: 0, excesso: 0 }; porMes.set(e.mes, linha) }
    linha[cat] += 1
  }
  // monthKm do legado: distância diária com `data.slice(0, 7)` igual ao mês do evento.
  const kmMes = new Map<string, number>()
  for (const t of diarias) kmMes.set(t.mes, (kmMes.get(t.mes) ?? 0) + t.distanciaKm)
  const linhasEventos = [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, c]) => {
    const total = c.aceleracao + c.frenagem + c.curva + c.excesso
    const km = kmMes.get(mes) ?? 0
    return { mes, rotulo: mesRotulo(mes), ...c, total, km, taxa: km ? (total / km) * 1000 : 0 }
  })
  const tendencia = tendenciaLinear(linhasEventos.map((l) => l.taxa))
  const eventosPorMes: EventosMes[] = linhasEventos.map((l, i) => ({ ...l, tendencia: tendencia[i] }))

  const ant = {
    km: comparar(telemetria.km, somaDe(diariasAnt, 'distanciaKm'), (v) => `${int(Math.round(v))} km`, 'sobe'),
    excessos: comparar(telemetria.excessos, somaDe(diariasAnt, 'excessos'), int, 'desce'),
    ocioso: comparar(telemetria.ociosoMin, somaDe(diariasAnt, 'ociosoMin'), (v) => `${int(Math.round(v))} min`, 'desce'),
  }
  return { ...base, telemetria, kmPorDia, eventosPorMes, ant }
}
