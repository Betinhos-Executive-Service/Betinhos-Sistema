import { describe, expect, it } from 'vitest'
import { PDFDocument, decodePDFRawStream, type PDFArray, type PDFRawStream } from 'pdf-lib'
import { COMUNICADO_ESCOPO, COMUNICADO_ESTADO, COMUNICADO_PUSH, COMUNICADO_TIPO, type Comunicado, type Destinatario } from '../domain/comunicados'
import type { Par } from '../domain/comprovante'
import { gerarComprovantesPdf } from './comprovantesPdf'

const comunicado = (id: string, tipo: Comunicado['tipo'], corpo = 'Ponto de encontro: porta 4.'): Comunicado => ({ id, titulo: 'Embarque no GRU', corpo, tipo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado: COMUNICADO_ESTADO.disparado, disparadoEm: '2026-11-01T13:00:00Z' })
const dest = (id: string, extra: Partial<Destinatario> = {}): Destinatario => ({ id, comunicadoId: 'c', motoristaId: 'm', enviadoEm: '2026-11-01T13:00:00Z', abertoEm: '2026-11-01T13:05:00Z', lidoEm: null, cienteEm: '2026-11-01T13:10:00Z', nomeAssinante: 'Márcio Lima', observacao: 'Combinado, só às 23h.', assinaturaJson: JSON.stringify([[[0.1, 0.5], [0.5, 0.2], [0.9, 0.6]]]), pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra })
const base = { geradoPor: 'Renan', geradoEm: new Date('2026-11-10T15:00:00Z'), versao: '0.0.1' }
const par = (c: Comunicado, d: Destinatario): Par => ({ comunicado: c, destinatario: d, motorista: 'Márcio Lima' })

// A Helvetica padrão grava o texto como strings hex (WinAnsi = Latin-1) no content stream; decodifica de volta.
async function textoDaPagina(bytes: Uint8Array, indice: number) {
  const page = (await PDFDocument.load(bytes)).getPage(indice)
  const { context } = page.node
  const lista = page.node.Contents() as PDFArray
  const cru = Array.from({ length: lista.size() }, (_, i) => Buffer.from(decodePDFRawStream(context.lookup(lista.get(i)) as PDFRawStream).decode()).toString('latin1')).join('\n')
  return [...cru.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('\n')
}

describe('gerarComprovantesPdf', () => {
  it('gera capa + uma página por par, com rodapé de paginação', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'Embarque no GRU', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia), dest('a')), par(comunicado('c', COMUNICADO_TIPO.ciencia), dest('b'))] })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getTitle()).toBe('Comprovantes de comunicados · Embarque no GRU')
  })

  it('mantém os acentos e descarta emoji sem falhar', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'motorista', alvo: 'Márcio Lima', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia, 'Atenção 🚗 à ação'), dest('a'))] })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    const texto = await textoDaPagina(bytes, 1)
    expect(texto).toContain('Atenção à ação')
    expect(texto).toContain('Comprovante de ciência')
    expect(texto).toContain('Assinante registrado: Márcio Lima')
  })

  it('Informativo vira comprovante de leitura, sem bloco de assinatura', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.informativo), dest('a', { cienteEm: null, lidoEm: '2026-11-01T13:10:00Z', assinaturaJson: '' }))] })
    const texto = await textoDaPagina(bytes, 1)
    expect(texto).toContain('Comprovante de leitura')
    expect(texto).not.toMatch(/^Assinatura$/m)
    expect(texto).not.toContain('Assinante registrado')
    expect(texto).toContain('SHA-256')
  })

  it('assinatura inválida na Ciência não falha', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia), dest('a', { assinaturaJson: 'não é json' }))] })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
    expect(await textoDaPagina(bytes, 1)).toContain('Assinatura não disponível no registro.')
  })

  it('texto longo continua na página seguinte do mesmo comprovante', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia, 'Linha longa de texto. '.repeat(400)), dest('a'))] })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2)
  })
})
