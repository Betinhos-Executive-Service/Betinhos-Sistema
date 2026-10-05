import { cleanId } from '@betinhos/dataverse'

/** Navegação do lookup cr40f_motorista (não confirmada pela metadata via MCP; ver relatório da Tarefa 5). */
export const NAV_MOTORISTA = 'cr40f_Motorista'

export const statusPatch = (value: number) => ({ cr40f_status: value })

export function motoristaPatch(funcionarioSet: string, motoristaId: string | null) {
  return { [`${NAV_MOTORISTA}@odata.bind`]: motoristaId ? `/${funcionarioSet}(${cleanId(motoristaId)})` : null }
}
