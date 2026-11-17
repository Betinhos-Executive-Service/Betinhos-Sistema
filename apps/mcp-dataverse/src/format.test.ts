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
    expect(parsed.proximaPagina).toBe('https://dev.crm.test/next')
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
  const xml = '<fetch top="5"><entity name="cr40f_reserva"><attribute name="cr40f_name"/></entity></fetch>'

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

  it('keyPath monta a chave alternativa com escape', () => {
    expect(keyPath({ cr40f_codigo: "O'Brien", n: 3 })).toBe("cr40f_codigo='O''Brien',n=3")
    expect(() => keyPath({})).toThrow()
  })
})
