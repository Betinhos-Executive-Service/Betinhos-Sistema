import type { Option } from '../data/schema'
import catalogo from './manutencaoCatalogo.json'

/** Catálogo único de categorias e serviços. O mesmo JSON gera as opções no Dataverse e o flow do JEV (scripts/). */
export type Servico = Option & { categoria: number }

export const CATEGORIAS_MANUT: Option[] = catalogo.categorias
export const SERVICOS_MANUT: Servico[] = catalogo.servicos.map(({ value, label, categoria }) => ({ value, label, categoria }))
export const ORIGEM = { IA: 100000000, MANUAL: 100000001, REVISAR: 100000002 } as const

export const CAMPO = { servicos: 'new_servicosmanutencao', categorias: 'new_categoriasmanutencao', origem: 'new_classificacaoorigem', confianca: 'new_confiancaia', descricao: 'cr40f_descricao' } as const

/** Categorias derivadas dos serviços, sem repetição e na ordem do catálogo. */
export function categoriasDe(servicos: number[]) {
  const usadas = new Set(SERVICOS_MANUT.filter((servico) => servicos.includes(servico.value)).map((servico) => servico.categoria))
  return CATEGORIAS_MANUT.filter((categoria) => usadas.has(categoria.value)).map((categoria) => categoria.value)
}

/** Escolha múltipla do Dataverse: "100000000,100000001" <-> [100000000, 100000001]. */
export function lerMulti(value: unknown): number[] {
  return typeof value === 'string' && value ? value.split(',').map(Number).filter(Number.isFinite) : []
}
export const gravarMulti = (values: number[]) => (values.length ? values.join(',') : null)

/** Patch da correção manual: a IA deixa de sobrescrever este registro. */
export function patchManual(servicos: number[]) {
  return { [CAMPO.servicos]: gravarMulti(servicos), [CAMPO.categorias]: gravarMulti(categoriasDe(servicos)), [CAMPO.origem]: ORIGEM.MANUAL, [CAMPO.confianca]: null }
}

/** Patch que devolve o registro à IA: limpa a origem e regrava a descrição para disparar o flow. */
export function patchReclassificar(descricao: string) {
  return { [CAMPO.origem]: null, [CAMPO.descricao]: descricao }
}
