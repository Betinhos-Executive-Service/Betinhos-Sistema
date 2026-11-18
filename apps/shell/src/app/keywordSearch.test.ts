// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { escapeLike, highlightParts, integerToken, keywordFilter, keywordTokens, matchesKeywords, moneyToken } from './keywordSearch'

const filterOf = (tokens: string[], fields: Parameters<typeof keywordFilter>[2]) => keywordFilter(document.implementation.createDocument(null, 'entity'), tokens, fields)

describe('tokenização', () => {
  it('separa por espaço, ignora 1 caractere, tira repetidas (sem acento/caixa) e limita a 6', () => {
    expect(keywordTokens('  embraer   a  Embraer  são SAO x  ')).toEqual(['embraer', 'são'])
    expect(keywordTokens('aa bb cc dd ee ff gg hh')).toEqual(['aa', 'bb', 'cc', 'dd', 'ee', 'ff'])
    expect(keywordTokens('')).toEqual([])
  })
})

describe('escape', () => {
  it('curingas do like viram literais', () => {
    expect(escapeLike("50%_[x]'")).toBe("50[%][_][[]x]'")
  })
})

describe('número', () => {
  it('aceita formato pt-BR e rejeita texto', () => {
    expect(moneyToken('1.234,50')).toBe('1234.50')
    expect(moneyToken('150,00')).toBe('150.00')
    expect(moneyToken('150')).toBe('150')
    expect(moneyToken('12.34')).toBeNull()
    expect(moneyToken('embraer')).toBeNull()
    expect(moneyToken('R$150')).toBeNull()
    expect(integerToken('54191')).toBe('54191')
    expect(integerToken('1,5')).toBeNull()
  })
})

describe('keywordFilter', () => {
  const fields = [
    { kind: 'text' as const, attribute: 'cr40f_trajeto' },
    { kind: 'text' as const, attribute: 'cr40f_nomedocliente', entity: 'r1' },
    { kind: 'money' as const, attribute: 'new_valortotal' },
    { kind: 'integer' as const, attribute: 'cr40f_idtenaris', entity: 'r2' },
    { kind: 'choice' as const, attribute: 'new_status', options: [{ value: 1, label: 'Pendente' }, { value: 2, label: 'Concluído' }, { value: 3, label: 'Concluído parcial' }] },
  ]

  it('AND entre palavras, OR entre campos', () => {
    const and = filterOf(['embraer', 'guarulhos'], fields)!
    expect(and.getAttribute('type')).toBe('and')
    const ors = [...and.children]
    expect(ors).toHaveLength(2)
    expect(ors.map((item) => item.getAttribute('type'))).toEqual(['or', 'or'])
    expect([...ors[0].children].map((item) => [item.getAttribute('attribute'), item.getAttribute('entityname'), item.getAttribute('value')])).toEqual([['cr40f_trajeto', null, '%embraer%'], ['cr40f_nomedocliente', 'r1', '%embraer%']])
  })

  it('choice por rótulo sem acento vira in nos valores', () => {
    const or = filterOf(['concluido'], fields)!.firstElementChild!
    const choice = or.querySelector('condition[attribute="new_status"]')!
    expect(choice.getAttribute('operator')).toBe('in')
    expect([...choice.children].map((item) => item.textContent)).toEqual(['2', '3'])
    expect(filterOf(['xyz'], fields)!.querySelector('condition[attribute="new_status"]')).toBeNull()
  })

  it('número pt-BR vira eq em dinheiro e inteiro; texto não gera condição de dinheiro', () => {
    const number = filterOf(['1.234,50', '54191'], fields)!
    const [first, second] = [...number.children]
    expect(first.querySelector('condition[attribute="new_valortotal"]')?.getAttribute('value')).toBe('1234.50')
    expect(first.querySelector('condition[attribute="cr40f_idtenaris"]')).toBeNull()
    expect(second.querySelector('condition[attribute="cr40f_idtenaris"]')?.getAttribute('value')).toBe('54191')
    expect(filterOf(['embraer'], fields)!.querySelector('condition[attribute="new_valortotal"]')).toBeNull()
  })

  it('sem campos possíveis devolve null', () => {
    expect(filterOf(['embraer'], [])).toBeNull()
  })
})

describe('modo local e destaque', () => {
  it('todas as palavras em algum texto, sem acento nem caixa', () => {
    expect(matchesKeywords(['sao', 'jose'], ['Cliente X', 'São José dos Campos'])).toBe(true)
    expect(matchesKeywords(['sao', 'paulo'], ['São José dos Campos'])).toBe(false)
  })

  it('marca o trecho original ("sao jose" em "São José")', () => {
    expect(highlightParts('De São José dos Campos', ['sao', 'jose'])).toEqual([{ text: 'De ', hit: false }, { text: 'São', hit: true }, { text: ' ', hit: false }, { text: 'José', hit: true }, { text: ' dos Campos', hit: false }])
    expect(highlightParts('Guarulhos', ['xyz'])).toEqual([{ text: 'Guarulhos', hit: false }])
  })
})
