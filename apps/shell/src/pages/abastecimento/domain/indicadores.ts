import type { Abastecimento, Veiculo } from './types'

/** Km rodados entre dois abastecimentos seguidos do mesmo veículo, ambos com odômetro; o consumo é o do segundo. */
export type Trecho = { de: Abastecimento; ate: Abastecimento; km: number; kmPorLitro: number }

export type ResumoVeiculo = {
  veiculoId: string | null
  placa: string
  modelo: string
  qtd: number
  litros: number
  valor: number
  kmPorLitro: number | null
  precoMedio: number | null
  ultimo: Date | null
  motoristas: string[]
}
export type ResumoMotorista = { motoristaId: string | null; nome: string; qtd: number; litros: number; valor: number; kmPorLitro: number | null; placas: string[] }
export type Totais = { qtd: number; litros: number; valor: number; precoMedio: number | null; kmPorLitro: number | null }

export const porData = (a: Abastecimento, b: Abastecimento) => a.data.getTime() - b.data.getTime()
/** Chave do veículo para agrupar: id cadastrado ou a placa do extrato. */
export const chaveVeiculo = (a: Abastecimento) => a.veiculoId ?? `placa:${a.placa}`
export const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function agruparPorVeiculo(lista: Abastecimento[]) {
  const grupos = new Map<string, Abastecimento[]>()
  for (const a of lista) { const k = chaveVeiculo(a); grupos.set(k, [...(grupos.get(k) ?? []), a]) }
  for (const g of grupos.values()) g.sort(porData)
  return grupos
}

/**
 * Trechos de todos os veículos. Abastecimento sem odômetro quebra a sequência (o seguinte não tem com o que
 * comparar); odômetro que não avança, que avança mais de 5.000 km (erro de digitação) ou litros zerados também
 * não geram trecho. Nesses casos o km/l fica vazio, sem erro.
 */
export function trechos(lista: Abastecimento[]): Trecho[] {
  const out: Trecho[] = []
  for (const grupo of agruparPorVeiculo(lista).values()) {
    let anterior: Abastecimento | null = null
    for (const a of grupo) {
      if (a.odometro == null) { anterior = null; continue }
      if (anterior && a.litros && a.odometro > anterior.odometro! && a.odometro - anterior.odometro! <= 5000) {
        const km = a.odometro - anterior.odometro!
        out.push({ de: anterior, ate: a, km, kmPorLitro: km / a.litros })
      }
      anterior = a
    }
  }
  return out
}

const kmPorLitroDe = (ts: Trecho[]) => {
  const litros = ts.reduce((s, t) => s + (t.ate.litros ?? 0), 0)
  return litros > 0 ? ts.reduce((s, t) => s + t.km, 0) / litros : null
}
const soma = (lista: Abastecimento[], campo: 'litros' | 'valor') => lista.reduce((s, a) => s + (a[campo] ?? 0), 0)
const precoMedioDe = (lista: Abastecimento[]) => { const l = soma(lista, 'litros'); return l > 0 ? soma(lista, 'valor') / l : null }
const nomes = (lista: Abastecimento[]) => [...new Set(lista.map((a) => a.motorista).filter(Boolean))]

/** Km/l de cada abastecimento (pelo trecho que termina nele), para a lista e os cartões. */
export const kmPorLitroPorAbastecimento = (ts: Trecho[]) => new Map(ts.map((t) => [t.ate.id, t.kmPorLitro]))

/** Um resumo por veículo; `ts` são os trechos do histórico inteiro, filtrados aqui pelo abastecimento final. */
export function resumoPorVeiculo(lista: Abastecimento[], ts: Trecho[], veiculos: Veiculo[]): ResumoVeiculo[] {
  const ids = new Set(lista.map((a) => a.id))
  const porVeiculo = new Map(veiculos.map((v) => [v.id, v]))
  const out: ResumoVeiculo[] = []
  for (const [chave, grupo] of agruparPorVeiculo(lista)) {
    const v = grupo[0].veiculoId ? porVeiculo.get(grupo[0].veiculoId) : null
    out.push({
      veiculoId: grupo[0].veiculoId, placa: v?.placa ?? grupo[0].placa, modelo: v?.modelo ?? '', qtd: grupo.length,
      litros: soma(grupo, 'litros'), valor: soma(grupo, 'valor'),
      kmPorLitro: kmPorLitroDe(ts.filter((t) => chaveVeiculo(t.ate) === chave && ids.has(t.ate.id))),
      precoMedio: precoMedioDe(grupo), ultimo: grupo[grupo.length - 1].data, motoristas: nomes(grupo),
    })
  }
  return out.sort((a, b) => b.valor - a.valor)
}

export function resumoPorMotorista(lista: Abastecimento[], ts: Trecho[]): ResumoMotorista[] {
  const grupos = new Map<string, Abastecimento[]>()
  for (const a of lista) { const k = a.motoristaId ?? `nome:${a.motorista}`; grupos.set(k, [...(grupos.get(k) ?? []), a]) }
  return [...grupos.values()].map((grupo) => {
    const meus = new Set(grupo.map((a) => a.id))
    return {
      motoristaId: grupo[0].motoristaId, nome: grupo[0].motorista || 'Sem motorista', qtd: grupo.length,
      litros: soma(grupo, 'litros'), valor: soma(grupo, 'valor'),
      kmPorLitro: kmPorLitroDe(ts.filter((t) => meus.has(t.ate.id))),
      placas: [...new Set(grupo.map((a) => a.placa).filter(Boolean))],
    }
  }).sort((a, b) => b.valor - a.valor)
}

export function totais(lista: Abastecimento[], ts: Trecho[]): Totais {
  const ids = new Set(lista.map((a) => a.id))
  return { qtd: lista.length, litros: soma(lista, 'litros'), valor: soma(lista, 'valor'), precoMedio: precoMedioDe(lista), kmPorLitro: kmPorLitroDe(ts.filter((t) => ids.has(t.ate.id))) }
}

export type Filtro = { mes: string | null; motoristaId: string | null; veiculoId: string | null }

export function filtrar(lista: Abastecimento[], f: Filtro) {
  return lista.filter((a) => (!f.mes || mesDe(a.data) === f.mes) && (!f.motoristaId || a.motoristaId === f.motoristaId) && (!f.veiculoId || chaveVeiculo(a) === f.veiculoId))
}

/** Meses com abastecimento, do mais recente ao mais antigo. */
export const mesesDisponiveis = (lista: Abastecimento[]) => [...new Set(lista.map((a) => mesDe(a.data)))].sort().reverse()
