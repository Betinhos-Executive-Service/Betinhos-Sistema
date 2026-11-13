// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogCacheKey, readCachedCatalog, sameCatalog, writeCachedCatalog } from './catalog-cache'
import type { CatalogField } from './views'

const field: CatalogField = { id: 'cr40f_valordadiaria', label: 'Diária', table: 'cr40f_composicaodeprecos', attribute: 'cr40f_valordadiaria', path: [], type: 'Money', available: true }

afterEach(() => window.localStorage.clear())

describe('cache do catálogo de campos', () => {
  it('usa a URL do ambiente na chave, sem diferenciar barra final ou maiúsculas', () => {
    expect(catalogCacheKey('https://org.crm2.dynamics.com/')).toBe(catalogCacheKey('https://ORG.crm2.dynamics.com'))
    expect(catalogCacheKey('https://dev.crm2.dynamics.com')).not.toBe(catalogCacheKey('https://prod.crm2.dynamics.com'))
  })

  it('devolve o catálogo gravado enquanto está dentro da validade', () => {
    const key = catalogCacheKey('https://org.crm2.dynamics.com')
    writeCachedCatalog(key, [field], 1_000)
    expect(readCachedCatalog(key, 2_000)).toEqual([field])
    expect(readCachedCatalog(key, 1_000 + 13 * 60 * 60 * 1000)).toBeNull()
  })

  it('grava catálogo do tamanho do DEV dentro da cota do localStorage e o devolve igual', () => {
    // DEV em 13/11/2026: 16 mil campos em 136 caminhos; cru, 8,4 milhões de caracteres (estourava a cota de ~5 milhões).
    const fields: CatalogField[] = []
    for (let path = 0; path < 136; path++) {
      const table = `cr40f_tabela${path % 30}`
      const relationships = [{ from: 'cr40f_servicoid', to: 'cr40f_servicorelacionadogeral' }, { from: `${table}id`, to: `cr40f_lookup${path}` }]
      const tablePath = ['cr40f_reservadeveculos', table]
      for (let index = 0; index < 120; index++) {
        const attribute = `cr40f_campo_com_nome_longo_${index}`
        const available = index % 7 !== 0
        fields.push({ id: `cr40f_reservadeveculos@cr40f_servicorelacionadogeral/${table}@cr40f_lookup${path}.${attribute}`, label: `Campo de exemplo número ${index}`, table, tableLabel: `Tabela ${path % 30}`, attribute, primaryIdAttribute: `${table}id`, primaryNameAttribute: 'cr40f_name', path: tablePath, relationships, type: available ? 'String' : 'Virtual', available, writable: index % 2 === 0, pickerEligible: false, reason: available ? undefined : 'Tipo Virtual não aceito como coluna da view' })
      }
    }
    fields.push({ ...fields[0], id: 'route', label: 'Trajeto', pickerEligible: true }, { id: 'date', label: 'Data', table: 'cr40f_composicaodeprecos', attribute: 'new_dataehorariodesaidacalculado', path: [], type: 'DateTime', available: true, pickerEligible: true })
    expect(JSON.stringify(fields).length).toBeGreaterThan(5_000_000)
    const key = catalogCacheKey('https://org.crm2.dynamics.com')
    writeCachedCatalog(key, fields, 1_000)
    expect(window.localStorage.getItem(key)!.length).toBeLessThan(1_500_000)
    const cached = readCachedCatalog(key, 2_000)
    expect(cached).toEqual(fields)
    expect(sameCatalog(cached!, fields)).toBe(true)
  })

  it('mantém ausente, falso e nulo como vieram da metadata', () => {
    const key = catalogCacheKey('https://org.crm2.dynamics.com')
    const related = { ...field, id: 'cr40f_clientes1@cr40f_cliente.cr40f_nome', table: 'cr40f_clientes1', attribute: 'cr40f_nome', primaryNameAttribute: null as unknown as string, path: ['cr40f_clientes1'], relationships: [{ from: 'cr40f_clientes1id', to: 'cr40f_cliente' }], available: false, writable: false, reason: 'Campo sem leitura disponível' }
    writeCachedCatalog(key, [field, related], 1)
    const [own, back] = readCachedCatalog(key, 2)!
    expect(own).not.toHaveProperty('writable')
    expect(back).toEqual(related)
    expect(back.primaryNameAttribute).toBeNull()
  })

  it('segue sem cache quando a gravação falha', () => {
    const key = catalogCacheKey('https://org.crm2.dynamics.com')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError') })
    expect(() => writeCachedCatalog(key, [field], 1)).not.toThrow()
    setItem.mockRestore()
    expect(readCachedCatalog(key, 2)).toBeNull()
  })

  it('ignora conteúdo inválido, vazio ou de outra versão', () => {
    const key = catalogCacheKey('https://org.crm2.dynamics.com')
    window.localStorage.setItem(key, '{"version":99,"savedAt":1,"fields":[{}]}')
    expect(readCachedCatalog(key, 2)).toBeNull()
    window.localStorage.setItem(key, 'não é json')
    expect(readCachedCatalog(key, 2)).toBeNull()
    writeCachedCatalog(key, [], 1)
    expect(readCachedCatalog(key, 2)).toBeNull()
  })

  it('compara catálogos pelo conteúdo', () => {
    expect(sameCatalog([field], [{ ...field }])).toBe(true)
    expect(sameCatalog([field], [{ ...field, label: 'Outro' }])).toBe(false)
    expect(sameCatalog([field], [])).toBe(false)
  })
})
