import { getXrmHost } from '../pages/composicao/data/xrm'

const GENERAL_TABLE = 'cr40f_reservadeveculos'
const GENERAL_WEBRESOURCE = 'new_formulario_geral.html'

/** Painel lateral do model-driven (navigateTo com target 2 + position 2): o registro abre por cima da grade, que continua atrás. */
export const RECORD_DRAWER = { target: 2, position: 2, width: { value: 50, unit: '%' } } as const
/** O Formulário Geral é largo: pede mais espaço no painel. */
export const GENERAL_DRAWER = { target: 2, position: 2, width: { value: 75, unit: '%' } } as const

const guid = (id: string) => id.replace(/[{}]/g, '')

/**
 * Abre o registro no painel lateral. Dentro do model-driven usa `navigateTo` (o Geral no Formulário Geral, o resto no
 * formulário nativo). Por URL direta o shim do Xrm não navega: o registro abre numa aba nova do Dataverse.
 */
/** Usado pela Composição e pela Geral: clique num registro relacionado (lookup, ID) abre o registro sem sair da lista. */
export function openGridRecord(table: string, recordId: string): Promise<unknown> | undefined {
  const host = getXrmHost()
  const navigation = host?.Navigation
  const id = guid(recordId)
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
