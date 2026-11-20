import { describe, expect, it } from 'vitest'
import { MAX_CHARS, clean, limitJson, ok, redact } from './format'
import { applyFetchPaging, fetchXmlEntity, keyPath } from './metadata'

describe('truncamento', () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i, nome: `registro ${i} ${'x'.repeat(100)}` }))

  it('respeita o limite de ~60 KB e sinaliza _truncado com o total devolvido', () => {
    const out = limitJson({ value: rows, proximaPagina: 'https://dev.crm.test/next' })
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS)
    const parsed = JSON.parse(out)
    expect(parsed._truncado).toBe(true)
    expect(parsed.value.length).toBeLessThan(2000)
    expect(parsed.value.length).toBeGreaterThan(100)
    expect(parsed._aviso).toMatch(/cortada/i)
    expect(parsed.proximaPagina).toBeUndefined()
    expect(parsed.maisRegistros).toBe(true)
    expect(parsed._aviso).toMatch(/resposta cortada: \d+ de \d+ linhas; reduza tamanhoPagina ou select/)
  })

  it('não marca nada quando cabe', () => {
    const parsed = JSON.parse(limitJson({ value: rows.slice(0, 3) }))
    expect(parsed._truncado).toBeUndefined()
    expect(parsed.value).toHaveLength(3)
  })

  it('ok() remove @odata.context/@odata.etag', () => {
    const text = ok({ value: [{ a: 1, '@odata.etag': 'W/"1"' }], '@odata.context': 'x' }).content[0].text
    expect(text).not.toContain('@odata')
  })

  it('clean é recursivo', () => {
    expect(clean({ a: { '@odata.etag': 1, b: 2 } })).toEqual({ a: { b: 2 } })
  })

  it('redact apaga Bearer e JWT soltos', () => {
    expect(redact('x Bearer abc.def.ghi y')).not.toContain('abc.def')
    expect(redact('tk eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig fim')).not.toContain('eyJhbGci')
  })
})

describe('FetchXML e chaves', () => {
  const xml = '<fetch><entity name="cr40f_reserva"><attribute name="cr40f_name"/></entity></fetch>'

  it('lê a tabela de <entity name>', () => {
    expect(fetchXmlEntity(xml)).toBe('cr40f_reserva')
  })

  it('aplica página, count e paging-cookie (escapado)', () => {
    const out = applyFetchPaging(xml, { page: 2, count: 50, pagingCookie: '<cookie page="1"/>' })
    expect(out).toContain('page="2"')
    expect(out).toContain('count="50"')
    expect(out).toContain('paging-cookie="&lt;cookie page=&quot;1&quot;/&gt;"')
  })

  it('substitui atributos de paginação existentes em vez de duplicar', () => {
    const out = applyFetchPaging('<fetch page="1" count="10"><entity name="a"/></fetch>', { page: 3, count: 20 })
    expect(out.match(/page=/g)).toHaveLength(1)
    expect(out).toContain('page="3"')
  })

  it('com top= não aplica página, count nem cookie', () => {
    const out = applyFetchPaging('<fetch top="5"><entity name="a"/></fetch>', { page: 2, count: 50 })
    expect(out).toBe('<fetch top="5"><entity name="a"/></fetch>')
  })

  it('decodifica paging-cookie com percent-encoding antes de escapar', () => {
    const out = applyFetchPaging(xml, { page: 2, pagingCookie: encodeURIComponent('<cookie page="1"/>') })
    expect(out).toContain('paging-cookie="&lt;cookie page=&quot;1&quot;/&gt;"')
  })

  it('keyPath codifica valores e usa GUID sem aspas na chave primária', () => {
    expect(keyPath({ c: 'a/b?c' })).toBe("c='a%2Fb%3Fc'")
    const g = '11111111-1111-1111-1111-111111111111'
    expect(keyPath({ cr40f_reservaid: g }, 'cr40f_reservaid')).toBe(g)
    expect(() => keyPath({ 'a/b': 'x' })).toThrow()
  })

  it('keyPath monta a chave alternativa com escape', () => {
    expect(keyPath({ cr40f_codigo: "O'Brien", n: 3 })).toBe("cr40f_codigo='O''Brien',n=3")
    expect(() => keyPath({})).toThrow()
  })
})

describe('saída enxuta', () => {
  it('clean remove etag, context e nulos e compacta FormattedValue e lookup', () => {
    const out = clean({
      '@odata.context': 'c', '@odata.etag': 'e', a: null, b: 1,
      'st@OData.Community.Display.V1.FormattedValue': 'Ativo', st: 1,
      'x@OData.Community.Display.V1.FormattedValue': '5', x: 5,
      '_cli_value': 'g', '_cli_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'account',
    }) as Record<string, unknown>
    expect(out['@odata.etag']).toBeUndefined()
    expect(out['@odata.context']).toBeUndefined()
    expect('a' in out).toBe(false)
    expect(out['st@txt']).toBe('Ativo')
    expect('x@txt' in out).toBe(false)
    expect(out['_cli_value@tab']).toBe('account')
  })

  it('limitJson trunca e sinaliza', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ i, t: 'x'.repeat(100) }))
    const s = limitJson({ value: rows }, 2000)
    expect(s.length).toBeLessThanOrEqual(2600)
    expect(s).toMatch(/trunc/i)
  })
})
