// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
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
