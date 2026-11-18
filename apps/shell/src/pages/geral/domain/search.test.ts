// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { keywordTokens } from '../../../app/keywordSearch'
import { buildCountFetch, buildFetch } from './fetch'
import { SEARCH_LINKS, searchFields, type Search } from './search'

const VIEW = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
const base = { page: 1, pageSize: 100, cookie: null, sort: null }
const STATUS = [{ value: 202410001, label: 'Confirmado' }, { value: 202410002, label: 'Cancelado' }]
const find = (text: string): Search => ({ tokens: keywordTokens(text), fields: searchFields((attribute) => (attribute === 'cr40f_status' ? STATUS : [])) })
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')
/** Por palavra (filtro `or`), as condições na forma `alias.atributo operador`. */
const byWord = (xml: string) => Array.from(parse(xml).querySelectorAll('entity > filter[type="and"] > filter[type="or"]'))
  .map((or) => Array.from(or.querySelectorAll('condition')).map((c) => `${c.getAttribute('entityname') ?? ''}.${c.getAttribute('attribute')} ${c.getAttribute('operator')}`))

describe('busca da Geral', () => {
  it('cada palavra vira um OR entre os campos; as palavras ficam em AND', () => {
    const words = byWord(buildFetch(VIEW, { ...base, search: find('ana corolla') }))
    expect(words).toHaveLength(2)
    expect(words[0]).toEqual(words[1])
    expect(words[0]).toContain('.cr40f_id like')
    expect(words[0]).toContain('.cr40f_passageirosetelefonedecontato like')
    expect(words[0]).toContain('busca_cr40f_motorista.cr40f_nomecompleto like')
    expect(words[0]).toContain('busca_cr40f_veiculo.cr40f_placa like')
  })

  it('palavra de 1 caractere é ignorada e a busca é limitada a 6 palavras', () => {
    expect(byWord(buildFetch(VIEW, { ...base, search: find('a ana') }))).toHaveLength(1)
    expect(byWord(buildFetch(VIEW, { ...base, search: find('aa bb cc dd ee ff gg hh') }))).toHaveLength(6)
  })

  it('número vira eq em OS Tenaris e em cotação; texto não numérico fica só nos campos de texto', () => {
    const [number] = byWord(buildFetch(VIEW, { ...base, search: find('1013') }))
    expect(number).toContain('.cr40f_idtenaris eq')
    expect(number).toContain('.cr40f_cotao eq')
    const [text] = byWord(buildFetch(VIEW, { ...base, search: find('ana') }))
    expect(text.some((c) => c.includes(' eq'))).toBe(false)
  })

  it('choice casa o rótulo sem acento nem caixa', () => {
    const doc = parse(buildFetch(VIEW, { ...base, search: find('CONFIRM') }))
    const status = doc.querySelector('condition[attribute="cr40f_status"]')
    expect(status?.getAttribute('operator')).toBe('in')
    expect(Array.from(status!.querySelectorAll('value')).map((v) => v.textContent)).toEqual(['202410001'])
    expect(parse(buildFetch(VIEW, { ...base, search: find('xyzw') })).querySelector('condition[attribute="cr40f_status"]')).toBeNull()
  })

  it('lookups entram por link-entity outer com o alias usado nas condições', () => {
    const doc = parse(buildFetch(VIEW, { ...base, search: find('ana') }))
    const links = Array.from(doc.querySelectorAll('entity > link-entity'))
    expect(links.map((l) => l.getAttribute('alias'))).toEqual(SEARCH_LINKS.map((l) => l.alias))
    for (const link of links) expect(link.getAttribute('link-type')).toBe('outer')
    const motorista = links.find((l) => l.getAttribute('alias') === 'busca_cr40f_motorista')
    expect([motorista?.getAttribute('name'), motorista?.getAttribute('from'), motorista?.getAttribute('to')]).toEqual(['cr40f_funcionarios', 'cr40f_funcionariosid', 'cr40f_motorista'])
  })

  it('curingas do like e aspas viram texto literal', () => {
    const doc = parse(buildFetch(VIEW, { ...base, search: find(`50% d'água`) }))
    expect(doc.querySelector('condition[attribute="cr40f_id"]')?.getAttribute('value')).toBe('%50[%]%')
    expect(doc.querySelector('condition[attribute="cr40f_trajeto"][value="%d\'água%"]')).not.toBeNull()
  })

  it('página e contagem levam a mesma busca; sem palavra válida não há filtro nem link', () => {
    const search = find('ana corolla')
    expect(byWord(buildCountFetch(VIEW, { search }))).toEqual(byWord(buildFetch(VIEW, { ...base, search })))
    expect(parse(buildCountFetch(VIEW, { search })).querySelectorAll('entity > link-entity')).toHaveLength(SEARCH_LINKS.length)
    for (const empty of [find('   '), find('a'), null]) {
      const doc = parse(buildFetch(VIEW, { ...base, search: empty }))
      expect(doc.querySelectorAll('entity > filter, entity > link-entity')).toHaveLength(0)
    }
  })
})
