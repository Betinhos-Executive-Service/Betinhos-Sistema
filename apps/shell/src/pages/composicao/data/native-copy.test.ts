// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildViews, saveView, type CatalogField, type SavedView, type ViewDefinition } from './views'
import { legacyNativeBase } from './native-copy'
import { lockedNativeCopy, nativeSaveSource, resolveCompositionQuery } from './composition-query'

const catalog: CatalogField[] = [
  { id: 'client', label: 'Cliente', table: 'cr40f_clientes1', attribute: 'cr40f_nomedocliente', path: ['cr40f_reservadeveculos', 'cr40f_clientes1'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }, { from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], type: 'String', available: true },
  { id: 'route', label: 'Rota', table: 'cr40f_reservadeveculos', attribute: 'cr40f_trajeto', path: ['cr40f_reservadeveculos'], relationships: [{ from: 'cr40f_reservadeveculosid', to: 'cr40f_servicorelacionadogeral' }], type: 'String', available: true },
  { id: 'new_valortotal', label: 'Total', table: 'cr40f_composicaodeprecos', attribute: 'new_valortotal', path: [], type: 'Money', available: true },
  { id: 'new_status', label: 'Status', table: 'cr40f_composicaodeprecos', attribute: 'new_status', path: [], type: 'Picklist', available: true },
]
// Visão original com filtro "ou" junto com outro na raiz: a tela não lê, então a cópia precisa preservá-lo.
const original = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_valortotal" /><filter type="and"><condition attribute="new_valortotal" operator="gt" value="100" /></filter><filter type="or"><condition attribute="new_valortotal" operator="lt" value="900" /></filter></entity></fetch>'
const userDefinition: ViewDefinition = { columns: [{ id: 'new_valortotal', width: 140, pinned: true }], filters: [{ id: 'new_status', operator: 'eq', value: '2' }], sort: [] }
const source: SavedView = { id: 'origem', kind: 'personal', name: 'Original', managed: false, nativeOnly: true, nativeFiltersEditable: false, sourceFetchXml: original, definition: userDefinition }

afterEach(() => vi.unstubAllGlobals())

const conditions = (fetchXml: string) => [...new DOMParser().parseFromString(fetchXml, 'application/xml').querySelectorAll('condition')].map((item) => `${item.getAttribute('attribute')} ${item.getAttribute('operator')} ${item.getAttribute('value')}`)

/** Grava a cópia pela própria `saveView` e devolve as linhas que o Dataverse teria, para reler com `buildViews`. */
async function saveCopy(nativeBase?: string) {
  const fetchXml = nativeSaveSource(source, userDefinition, catalog, false)!
  const createRecord = vi.fn(async (_table: string, _payload: Record<string, unknown>) => ({ id: 'copia' }))
  vi.stubGlobal('window', { Xrm: { WebApi: { createRecord, retrieveMultipleRecords: vi.fn(async () => ({ entities: [] })), retrieveRecord: vi.fn(async () => ({})) }, Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm.dynamics.com' }) } } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ObjectTypeCode: 10342 }) })))
  await saveView('Cópia', 'personal', userDefinition, catalog, undefined, fetchXml, true, nativeBase)
  const view = createRecord.mock.calls.find(([table]) => table === 'userquery')![1]
  const pin = createRecord.mock.calls.find(([table]) => table !== 'userquery')![1]
  const rows: { personal: Record<string, unknown>[]; publicViews: Record<string, unknown>[]; pins: Record<string, unknown>[] } = { personal: [{ userqueryid: 'copia', name: 'Cópia', ...view }], publicViews: [], pins: [{ new_viewid: 'copia', ...pin }] }
  return { rows, fetchXml }
}

describe('cópia de visão nativa com filtros do usuário', () => {
  it('(d) cópia antiga, sem nativeBase: os filtros do usuário saem da base e ficam editáveis', async () => {
    const { rows, fetchXml } = await saveCopy()
    expect(conditions(fetchXml)).toEqual(expect.arrayContaining(['new_valortotal gt 100', 'new_valortotal lt 900', 'new_status eq 2']))
    const [copy] = buildViews(rows, catalog)
    expect(copy).toMatchObject({ nativeOnly: true, managed: false, nativeFiltersEditable: false })
    expect(conditions(copy.sourceFetchXml!)).toEqual(['new_valortotal gt 100', 'new_valortotal lt 900'])
    expect(copy.definition.filters).toEqual([{ id: 'new_status', operator: 'eq', value: '2' }])
    expect(copy.definition.columns).toEqual([{ id: 'new_valortotal', width: 140, pinned: true }])
    // Filtro do usuário removido na grade: a consulta volta a ter só os da visão original.
    const query = resolveCompositionQuery(copy, { ...copy.definition, filters: [] }, catalog, '').view
    expect(conditions(String(query && 'fetchXml' in query ? query.fetchXml : copy.sourceFetchXml))).toEqual(['new_valortotal gt 100', 'new_valortotal lt 900'])
  })

  it('cópia nova guarda a base no pin e a lê de volta sem comparar FetchXML', async () => {
    const { rows } = await saveCopy(original)
    expect(JSON.parse(String(rows.pins[0].new_definition))).toMatchObject({ nativeBase: original, filters: [{ id: 'new_status' }] })
    const [copy] = buildViews(rows, catalog)
    expect(copy.sourceFetchXml).toBe(original)
    expect(copy.definition).not.toHaveProperty('nativeBase')
    expect(copy.definition.filters).toEqual(userDefinition.filters)
    expect(lockedNativeCopy(copy, false)).toBe(true)
    const query = resolveCompositionQuery(copy, { ...copy.definition, filters: [{ id: 'new_status', operator: 'eq', value: '3' }] }, catalog, '').view
    expect(conditions(String(query && 'fetchXml' in query ? query.fetchXml : ''))).toEqual(expect.arrayContaining(['new_valortotal gt 100', 'new_valortotal lt 900', 'new_status eq 3']))
  })

  it('(d) com divergência na cópia antiga, continua travada como antes', async () => {
    const { rows } = await saveCopy()
    const edited = String(rows.personal[0].fetchxml).replace('value="900"', 'value="950"').replace('value="2"', 'value="7"')
    for (const fetchxml of [edited, String(rows.personal[0].fetchxml).replace('<condition attribute="new_status" operator="eq" value="2"', '<condition attribute="new_status" operator="eq" value="7"')]) {
      const [copy] = buildViews({ ...rows, personal: [{ ...rows.personal[0], fetchxml }] }, catalog)
      expect(copy).toMatchObject({ nativeOnly: true, managed: false })
      expect(conditions(copy.sourceFetchXml!)).toContain('new_status eq 7')
      expect(copy.definition.filters).toEqual([])
    }
  })

  it('pin com coluna que o catálogo não tem mantém a cópia travada', async () => {
    const { rows } = await saveCopy()
    const [copy] = buildViews(rows, catalog.filter((field) => field.id !== 'new_status'))
    expect(conditions(copy.sourceFetchXml!)).toContain('new_status eq 2')
    expect(copy.definition.filters).toEqual([])
  })

  it('legacyNativeBase devolve null sem filtro de usuário e quando o FetchXML da cópia é de outra forma', () => {
    expect(legacyNativeBase(original, '<fetch><entity name="x"/></fetch>')).toBeNull()
    expect(legacyNativeBase('não é xml', original)).toBeNull()
  })
})
