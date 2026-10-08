import type { Posse, Ref, Veiculo } from '../data/types'

/**
 * Quem está com o carro agora. A posse aberta (`new_fimdaposse` nulo) é a fonte:
 * o plugin do App Motoristas não mantém `cr40f_motoristaatual`, que só vale sem posse aberta.
 */
export type MotoristaAtual =
  | { tipo: 'motorista'; motorista: Ref; fonte: 'posse' | 'cadastro' }
  | { tipo: 'base'; local: Ref | null }
  | { tipo: 'sem' }

/** Posse aberta mais recente por veículo. */
export function possesAbertas(posses: Posse[]): Map<string, Posse> {
  const abertas = new Map<string, Posse>()
  for (const posse of posses) {
    if (posse.fim || !posse.veiculo) continue
    const atual = abertas.get(posse.veiculo.id)
    if (!atual || (posse.inicio ?? '') > (atual.inicio ?? '')) abertas.set(posse.veiculo.id, posse)
  }
  return abertas
}

export function motoristaAtual(veiculo: Veiculo, abertas: Map<string, Posse>): MotoristaAtual {
  const posse = abertas.get(veiculo.id)
  if (posse) return posse.motorista ? { tipo: 'motorista', motorista: posse.motorista, fonte: 'posse' } : { tipo: 'base', local: posse.localBase }
  return veiculo.motorista ? { tipo: 'motorista', motorista: veiculo.motorista, fonte: 'cadastro' } : { tipo: 'sem' }
}

export function rotuloNaBase(local: Ref | null) {
  return local?.label ? `Na base · ${local.label}` : 'Na base'
}

export function rotuloMotoristaAtual(atual: MotoristaAtual): string | null {
  if (atual.tipo === 'motorista') return atual.motorista.label || null
  if (atual.tipo === 'base') return rotuloNaBase(atual.local)
  return null
}
