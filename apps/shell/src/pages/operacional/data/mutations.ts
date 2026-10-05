import { cleanId } from '@betinhos/dataverse'

/** Navegação do lookup cr40f_motorista (não confirmada pela metadata via MCP; ver relatório da Tarefa 5). */
export const NAV_MOTORISTA = 'cr40f_Motorista'

export const statusPatch = (value: number) => ({ cr40f_status: value })

/** Atribuição do motorista (bind). */
export function motoristaPatch(funcionarioSet: string, motoristaId: string) {
  return { [`${NAV_MOTORISTA}@odata.bind`]: `/${funcionarioSet}(${cleanId(motoristaId)})` }
}

/**
 * Remoção do motorista: DELETE na referência do lookup, nunca `@odata.bind: null`.
 * A confirmação do nome da navegação acontece no primeiro teste em DEV.
 */
export function motoristaRefPath(reservaSet: string, reservaId: string) {
  return `${reservaSet}(${cleanId(reservaId)})/${NAV_MOTORISTA}/$ref`
}
