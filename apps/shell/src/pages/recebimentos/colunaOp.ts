import type { FilterCondition, FilterField, FilterGroup, TableFilters, ViewColumnDef, ViewConfig } from '@betinhos/ui'
import { COMPROVANTES_OPCOES } from './domain'

/**
 * Coluna virtual "Comprovantes" das listas de OPs e Pagantes: quantos comprovantes de recebimento a OP tem (soma dos
 * serviços; o pagante mostra o da OP dele). Não ordena (a contagem vem de uma consulta à parte). O filtro Com/Sem
 * compara a contagem já carregada, como os demais filtros dessas listas, que rodam em memória.
 */
export const COMPROVANTES_KEY = 'comprovantes'
/** Logo depois da primeira coluna; quem já tem visão salva recebe a coluna no fim (normalizeConfig do DS). */
export const COMPROVANTES_COLUMN: ViewColumnDef = { key: COMPROVANTES_KEY, label: 'Comprovantes' }
export const COMPROVANTES_FIELD: FilterField = { key: COMPROVANTES_KEY, label: 'Comprovantes', kind: 'bool', options: COMPROVANTES_OPCOES }

/** Valor lido pelo filtro e pelo agrupamento (Sim/Não): a OP tem comprovante? */
export const temComprovante = (contagem: Map<string, number>, opId: string) => (contagem.get(opId.toLowerCase()) ?? 0) > 0

const usaCampo = (node: FilterCondition | FilterGroup): boolean => (node.type === 'group' ? node.items.some(usaCampo) : node.field === COMPROVANTES_KEY)

/** Filtro ou agrupamento lê a contagem: sem ela a lista filtrada sairia errada. */
export function filtraComprovantes(config: ViewConfig, filters: TableFilters) {
  return config.group?.key === COMPROVANTES_KEY || Object.values(filters.quick).some(usaCampo) || usaCampo(filters.advanced)
}

/** A contagem só é buscada com a coluna visível ou usada em filtro/agrupamento (evita consultar milhares de OPs à toa). */
export function usaComprovantes(config: ViewConfig, filters: TableFilters) {
  return config.columns.some((c) => c.key === COMPROVANTES_KEY && c.visible) || filtraComprovantes(config, filters)
}
