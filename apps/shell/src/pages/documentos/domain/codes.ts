// domain/codes.ts
import type { Categoria, Marco } from './types'

export const CATEGORIA_CODE: Record<Categoria, number> = { pessoas: 100000000, frota: 100000001 }
export const categoriaDe = (code: unknown): Categoria | null => (code === 100000000 ? 'pessoas' : code === 100000001 ? 'frota' : null)

export const SITUACAO_CODE = { vigente: 100000000, substituido: 100000001 } as const

export const MARCO_CODE: Record<Marco, number> = { '60': 100000000, '30': 100000001, '7': 100000002, vencido: 100000003 }
export const marcoDoCodigo = (code: unknown): Marco | null =>
  (Object.entries(MARCO_CODE).find(([, v]) => v === code)?.[0] as Marco | undefined) ?? null

/** Valores de `cr40f_obrigatoriopara` (multi-choice). */
export const OBRIG = { motorista: 100000000, administrativo: 100000001, proprio: 100000002, terceiro: 100000003, aluguel: 100000004 } as const
export const OBRIG_LABEL: Record<number, string> = {
  100000000: 'Motorista', 100000001: 'Administrativo', 100000002: 'Próprio', 100000003: 'Terceiro', 100000004: 'Aluguel',
}
export const OBRIG_DA_CATEGORIA: Record<Categoria, number[]> = {
  pessoas: [OBRIG.motorista, OBRIG.administrativo],
  frota: [OBRIG.proprio, OBRIG.terceiro, OBRIG.aluguel],
}

const FUNCAO: Record<number, number> = { 202410000: OBRIG.motorista, 202410001: OBRIG.administrativo }
const CATEGORIA_VEICULO: Record<number, number> = { 100000000: OBRIG.proprio, 100000001: OBRIG.terceiro, 100000002: OBRIG.aluguel }
export const obrigDeFuncao = (funcao: unknown) => (typeof funcao === 'number' ? FUNCAO[funcao] ?? null : null)
export const obrigDeCategoriaVeiculo = (categoria: unknown) => (typeof categoria === 'number' ? CATEGORIA_VEICULO[categoria] ?? null : null)

export const FUNC_DESLIGADO = 1
export const VEICULO_VENDIDO = 202410000
