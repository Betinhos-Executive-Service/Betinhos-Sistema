import { describe, expect, it } from 'vitest'
import casos from '../casos.json'
import { CATALOGO } from './catalogo.ts'
import {
  compararMatrizes,
  configuracaoEfetiva,
  hojeSaoPaulo,
  resolverChave,
  validarMatriz,
  type Excecao,
  type Matriz,
  type Origem,
} from './resolver.ts'

interface Caso {
  nome: string
  hoje: string
  matriz: Matriz | null
  pessoa: { vinculo?: number | null; piloto?: boolean; excecoes?: Excecao[] }
  esperado: Record<string, boolean>
  origens?: Record<string, Origem>
  perfil?: 'proprio' | 'terceiro'
  piloto?: boolean
  semVinculo?: boolean
}

describe('casos.json (compartilhado com os testes de C#)', () => {
  it('o catálogo do arquivo é o catálogo do código', () => {
    expect(casos.catalogo).toEqual(JSON.parse(JSON.stringify(CATALOGO)))
  })

  it.each(casos.casos as unknown as Caso[])('$nome', (caso) => {
    const config = configuracaoEfetiva({ matriz: caso.matriz, pessoa: caso.pessoa, hoje: caso.hoje })
    expect(Object.keys(config.chaves).sort()).toEqual(CATALOGO.map((c) => c.chave).sort())
    for (const [chave, valor] of Object.entries(caso.esperado)) expect(config.chaves[chave], chave).toBe(valor)
    for (const [chave, origem] of Object.entries(caso.origens ?? {})) expect(config.origens[chave], `origem de ${chave}`).toBe(origem)
    if (caso.perfil) expect(config.perfil).toBe(caso.perfil)
    if (caso.piloto !== undefined) expect(config.piloto).toBe(caso.piloto)
    if (caso.semVinculo !== undefined) expect(config.semVinculo).toBe(caso.semVinculo)
  })
})

describe('resolverChave', () => {
  it('chave fora do catálogo é erro', () => {
    expect(() => resolverChave('inexistente', { hoje: '2026-11-23' })).toThrow(RangeError)
  })

  it('a regra nunca lê o relógio: a mesma exceção muda só com o "hoje" recebido', () => {
    const pessoa = { vinculo: 0, excecoes: [{ chave: 'multas', ligado: true, validade: '2026-11-23' }] }
    expect(resolverChave('multas', { pessoa, hoje: '2026-11-23' }).ligado).toBe(true)
    expect(resolverChave('multas', { pessoa, hoje: '2026-11-24' }).ligado).toBe(false)
  })
})

describe('configuracaoEfetiva', () => {
  it('repassa o número da versão; sem versão fica null', () => {
    expect(configuracaoEfetiva({ hoje: '2026-11-23' }).versao).toBeNull()
    expect(configuracaoEfetiva({ hoje: '2026-11-23', versao: 3, matriz: { proprio: { history: false } } }).versao).toBe(3)
  })
})

describe('compararMatrizes', () => {
  it('lista só o que muda, por perfil, ignorando chave fixa', () => {
    const antes: Matriz = { proprio: { history: true }, terceiro: { history: true } }
    const depois: Matriz = { proprio: { history: false, services: false }, terceiro: { history: true } }
    expect(compararMatrizes(antes, depois)).toEqual([{ chave: 'history', perfil: 'proprio', de: true, para: false }])
  })

  it('sem versão anterior compara contra o padrão do catálogo', () => {
    const depois: Matriz = { proprio: { multas: true }, terceiro: {} }
    const mudancas = compararMatrizes(null, depois)
    expect(mudancas).toContainEqual({ chave: 'multas', perfil: 'proprio', de: false, para: true })
    expect(mudancas).toContainEqual({ chave: 'services.qrCharge', perfil: 'proprio', de: false, para: true })
    expect(mudancas).not.toContainEqual(expect.objectContaining({ chave: 'history' }))
  })

  it('matrizes iguais não têm mudança', () => {
    const m: Matriz = { proprio: { history: false }, terceiro: {} }
    expect(compararMatrizes(m, structuredClone(m))).toEqual([])
  })
})

describe('validarMatriz', () => {
  it('aceita matriz válida', () => {
    expect(validarMatriz({ proprio: { history: false, services: true }, terceiro: {} })).toEqual([])
  })

  it('recusa chave fora do catálogo e chave fixa desligada', () => {
    expect(validarMatriz({ proprio: { xpto: true, services: false }, terceiro: { comunicados: false } })).toEqual([
      { codigo: 'CHAVE_INVALIDA', chave: 'xpto', perfil: 'proprio' },
      { codigo: 'CHAVE_FIXA', chave: 'services', perfil: 'proprio' },
      { codigo: 'CHAVE_FIXA', chave: 'comunicados', perfil: 'terceiro' },
    ])
  })
})

describe('hojeSaoPaulo', () => {
  it('usa o dia de São Paulo, não o UTC', () => {
    expect(hojeSaoPaulo(new Date('2026-11-24T01:30:00Z'))).toBe('2026-11-23')
    expect(hojeSaoPaulo(new Date('2026-11-24T03:30:00Z'))).toBe('2026-11-24')
  })
})
