// domain/nomes.test.ts
import { describe, expect, it } from 'vitest'
import { nomeArquivo, nomeDocumento, pastaDoc, subpastaDoc, elipseMeio, nomeAmigavel } from './nomes'
import { documentosQuery } from './query'

describe('nomes e pastas', () => {
  it('pasta por categoria, separando DEV', () => {
    expect(subpastaDoc('CNH')).toBe('Documentos/CNH')
    expect(pastaDoc('pessoas', 'abc', 'CNH', 'DEV')).toBe('Funcionarios/DEV/abc/Documentos/CNH')
    expect(pastaDoc('frota', 'xyz', 'IPVA', 'PROD')).toBe('Veiculos/xyz/Documentos/IPVA')
  })

  it('nome do registro e do arquivo', () => {
    expect(nomeDocumento({ nome: 'CNH' }, { nome: 'Ana' })).toBe('CNH · Ana')
    expect(nomeArquivo('CNH', '2031-05-10', 'frente/verso.pdf')).toBe('CNH_2031-05-10_frente_verso.pdf')
    expect(nomeArquivo('RG', null, 'rg.jpg')).toBe('RG_sem-data_rg.jpg')
  })
})

describe('URL da central', () => {
  it('lê e grava com padrões fora da URL', () => {
    const q = new URLSearchParams('aba=frota&kpi=vencido&tipo=t1&q=abc')
    expect(documentosQuery.ler(q)).toEqual({ aba: 'frota', kpi: 'vencido', tipo: 't1', q: 'abc' })
    expect(documentosQuery.ler(new URLSearchParams('aba=xx&kpi=yy'))).toEqual({ aba: 'pessoas', kpi: null, tipo: null, q: '' })
    expect(documentosQuery.gravar({ aba: 'pessoas', kpi: null, tipo: null, q: '' })).toEqual({ aba: null, kpi: null, tipo: null, q: null })
  })
})

describe('nome amigável do arquivo', () => {
  it('tira o prefixo código_data_ (ou sem-data) e mantém nomes sem prefixo', () => {
    expect(nomeAmigavel('CNH_2031-05-10_frente.pdf')).toBe('frente.pdf')
    expect(nomeAmigavel('RG_sem-data_rg.pdf')).toBe('rg.pdf')
    expect(nomeAmigavel('CERT_ESTADUAL_2031-05-10_certidao_2.pdf')).toBe('certidao_2.pdf')
    expect(nomeAmigavel('outro.pdf')).toBe('outro.pdf')
    expect(nomeAmigavel('CNH_2031-05-10_')).toBe('CNH_2031-05-10_')
  })

  it('elipse no meio só quando passa do limite, preservando o fim (extensão)', () => {
    expect(elipseMeio('frente.pdf', 28)).toBe('frente.pdf')
    const longo = 'carteira-nacional-de-habilitacao-digital-frente-e-verso.pdf'
    const curto = elipseMeio(longo, 28)
    expect(curto).toHaveLength(28)
    expect(curto).toContain('…')
    expect(curto.startsWith('carteira')).toBe(true)
    expect(curto.endsWith('verso.pdf')).toBe(true)
  })
})
