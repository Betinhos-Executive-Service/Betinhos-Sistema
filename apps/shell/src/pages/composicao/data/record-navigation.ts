import { getXrmHost } from './xrm'

const GENERAL_TABLE = 'cr40f_reservadeveculos'
const GENERAL_WEBRESOURCE = 'new_formulario_geral.html'

export function openGridRecord(table: string, recordId: string): Promise<unknown> | undefined {
  const host = getXrmHost()
  const navigation = host?.Navigation
  if (!navigation) return undefined
  if (table === GENERAL_TABLE && navigation.navigateTo) {
    return navigation.navigateTo({
      pageType: 'webresource',
      webresourceName: GENERAL_WEBRESOURCE,
      data: JSON.stringify({ mode: 'edit', entityName: GENERAL_TABLE, id: recordId, recordId, entityId: recordId }),
    }, { target: 1 })
  }
  // O shim do Xrm do shell não tem openForm: sem ele a linha não abre, em vez de lançar.
  if (typeof navigation.openForm !== 'function') return undefined
  return navigation.openForm({ entityName: table, entityId: recordId })
}
