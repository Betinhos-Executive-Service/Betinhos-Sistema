// @vitest-environment node

import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { blocosDoOrcamento, diasDoServico, gerarPdfOrcamento, nomeArquivoOrcamento, type Bloco } from './orcamento'

const timbrado = new Uint8Array(readFileSync(new URL('./timbrado.png', import.meta.url)))
const hoje = new Date('2026-11-24T15:00:00Z')
const dados = { nome: 'Ana & Cia', cliente: 'Kenvue', valorCents: 62049, inicio: '2026-10-30', fim: '2026-10-31', hoje }
const texto = (blocos: Bloco[]) => blocos.map((b) => ('pontilhado' in b ? '----' : b.trechos.map((t) => t.t).join(''))).join('\n')

describe('orçamento de pedido de compra', () => {
  it('troca nome, cliente, valor, data e dias', () => {
    const t = texto(blocosDoOrcamento(dados))
    expect(t).toContain('São José dos Campos, 24 de Novembro de 2026')
    expect(t).toContain('Aos cuidados de: Ana & Cia')
    expect(t).toContain('Cliente: Kenvue')
    expect(t).toContain('Assunto: Serviços prestados de transporte para equipe de Ana & Cia\n')
    expect(t).toContain('equipe de Ana & Cia nos dias 30/10/2026 a 31/10/2026')
    expect(t).toMatch(/valor total de R\$\s620,49/)
    expect(t).not.toMatch(/arame/i)
  })

  it('gera um PDF de uma página, inclusive com caractere fora do WinAnsi', async () => {
    const pdf = await gerarPdfOrcamento(timbrado, { ...dados, nome: 'Łukasz Ğ 漢' })
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1)
  })

  it('formata dias e nome do arquivo', () => {
    expect(diasDoServico('2026-10-30', '2026-10-30')).toBe('30/10/2026')
    expect(diasDoServico(null, null)).toBe('')
    expect(nomeArquivoOrcamento('Camila  Rangel', hoje)).toBe('ORÇAMENTO CAMILA RANGEL - 24-11.pdf')
  })
})
