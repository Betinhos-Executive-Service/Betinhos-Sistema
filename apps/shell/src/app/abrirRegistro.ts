import { getXrmHost } from '../pages/composicao/data/xrm'
import { abrirGavetaRegistro, temGaveta } from './registroAberto'

const GENERAL_TABLE = 'cr40f_reservadeveculos'
const GENERAL_WEBRESOURCE = 'new_formulario_geral.html'

/** Painel lateral do model-driven (navigateTo com target 2 + position 2): o registro abre por cima da grade, que continua atrás. */
export const RECORD_DRAWER = { target: 2, position: 2, width: { value: 50, unit: '%' } } as const
/** O Formulário Geral é largo: pede mais espaço no painel. */
export const GENERAL_DRAWER = { target: 2, position: 2, width: { value: 75, unit: '%' } } as const

const guid = (id: string) => id.replace(/[{}]/g, '')

/**
 * Abre um registro relacionado (lookup, ID) a partir de uma lista (Composição, Geral). Tabela com tela no shell: abre a
 * gaveta dessa tela por cima da lista, sem trocar de rota (`GavetaRegistro`). Senão, dentro do model-driven, painel
 * lateral com `navigateTo` (o Geral no Formulário Geral, o resto no formulário nativo); sem `navigateTo`, `openForm`;
 * por URL direta, aba nova do Dataverse.
 */
export function openGridRecord(table: string, recordId: string): Promise<unknown> | undefined {
  const id = guid(recordId)
  if (temGaveta(table)) {
    abrirGavetaRegistro(table, id)
    return undefined
  }
  const host = getXrmHost()
  const navigation = host?.Navigation
  if (navigation?.navigateTo) {
    if (table === GENERAL_TABLE) {
      return navigation.navigateTo({
        pageType: 'webresource',
        webresourceName: GENERAL_WEBRESOURCE,
        data: JSON.stringify({ mode: 'edit', entityName: GENERAL_TABLE, id, recordId: id, entityId: id }),
      }, GENERAL_DRAWER)
    }
    return navigation.navigateTo({ pageType: 'entityrecord', entityName: table, entityId: id }, RECORD_DRAWER)
  }
  if (typeof navigation?.openForm === 'function') return navigation.openForm({ entityName: table, entityId: id })
  const clientUrl = host?.Utility?.getGlobalContext().getClientUrl()?.replace(/\/+$/, '')
  if (!clientUrl) return undefined
  window.open(`${clientUrl}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`, '_blank', 'noopener')
  return undefined
}
