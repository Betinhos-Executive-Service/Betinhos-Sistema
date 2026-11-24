// @vitest-environment node

import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { diasDoServico, nomeArquivoOrcamento, preencherOrcamento } from './orcamento'

const modelo = new Uint8Array(readFileSync(new URL('./modelo-orcamento.docx', import.meta.url)))
const texto = (docx: Uint8Array) => strFromU8(unzipSync(docx)['word/document.xml']).replace(/<[^>]+>/g, '')
const hoje = new Date('2026-11-24T15:00:00Z')

describe('orçamento de pedido de compra', () => {
  it('troca nome, valor, data e dias e mantém o resto do modelo', () => {
    const docx = preencherOrcamento(modelo, { nome: 'Ana & Cia', valorCents: 62049, inicio: '2026-10-30', fim: '2026-10-31', hoje })
    const t = texto(docx)
    expect(t).toContain('São José dos Campos, 24 de Novembro de 2026')
    expect(t).toContain('Aos cuidados de: Ana &amp; Cia')
    expect(t).toContain('equipe de Ana &amp; Cia (fábrica de arames da Johnson)')
    expect(t).toContain('nos dias 30/10/2026 a 31/10/2026')
    expect(t).toMatch(/valor total de R\$\s620,49/)
    expect(t).not.toMatch(/\{\{/)
    expect(Object.keys(unzipSync(docx))).toEqual(Object.keys(unzipSync(modelo)))
  })

  it('modelo não carrega dados pessoais do documento original', () => {
    const tudo = Object.entries(unzipSync(modelo)).filter(([nome]) => nome.endsWith('.xml') || nome.endsWith('.rels')).map(([, dados]) => strFromU8(dados)).join(' ')
    expect(tudo).not.toMatch(/Regiane|Camila|@fornecedores|Juliana|Junior de Paula/i)
  })

  it('formata dias e nome do arquivo', () => {
    expect(diasDoServico('2026-10-30', '2026-10-30')).toBe('30/10/2026')
    expect(diasDoServico(null, null)).toBe('')
    expect(nomeArquivoOrcamento('Camila  Rangel', hoje)).toBe('ORÇAMENTO CAMILA RANGEL - 24-11.docx')
  })
})
