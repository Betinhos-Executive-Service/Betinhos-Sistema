import { describe, expect, it } from 'vitest'
import { PDFDocument, decodePDFRawStream, type PDFArray, type PDFRawStream } from 'pdf-lib'
import { COMUNICADO_ESCOPO, COMUNICADO_ESTADO, COMUNICADO_PUSH, COMUNICADO_TIPO, type Comunicado, type Destinatario, type Evidencia } from '../domain/comunicados'
import type { Par } from '../domain/comprovante'
import { gerarComprovantesPdf } from './comprovantesPdf'

const comunicado = (id: string, tipo: Comunicado['tipo'], corpo = 'Ponto de encontro: porta 4.'): Comunicado => ({ id, titulo: 'Embarque no GRU', corpo, tipo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado: COMUNICADO_ESTADO.disparado, disparadoEm: '2026-11-01T13:00:00Z' })
const dest = (id: string, extra: Partial<Destinatario> = {}): Destinatario => ({ id, comunicadoId: 'c', motoristaId: 'm', enviadoEm: '2026-11-01T13:00:00Z', abertoEm: '2026-11-01T13:05:00Z', lidoEm: null, cienteEm: '2026-11-01T13:10:00Z', nomeAssinante: 'Márcio Lima', observacao: 'Combinado, só às 23h.', assinaturaJson: JSON.stringify([[[0.1, 0.5], [0.5, 0.2], [0.9, 0.6]]]), evidenciaAbertura: null, evidenciaCiencia: null, pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra })
const evidencia: Evidencia = { invalida: false, appVersion: '2.1.860', userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Android', model: 'SM-A546', ip: '203.0.113.7', ipVerificado: true, geo: { status: 'ok', lat: -23.18, lon: -45.88, accuracy: 30 } }
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

  it('Ciência mostra Abertura e Ciência em "Aparelho e local", com IP, mapa e a nota nova', async () => {
    const semGps: Evidencia = { ...evidencia, ip: '198.51.100.9', ipVerificado: false, geo: { status: 'negada', lat: null, lon: null, accuracy: null } }
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia), dest('a', { evidenciaAbertura: evidencia, evidenciaCiencia: semGps }))] })
    const texto = await textoDaPagina(bytes, 1)
    expect(texto).toContain('Aparelho e local')
    expect(texto).toMatch(/Abertura\n[\s\S]*Aparelho: Android SM-A546/)
    expect(texto).toContain('Endereço de internet (IP): 203.0.113.7 (verificado)')
    expect(texto).toContain('Localização: -23.18000, -45.88000 (±30 m)')
    expect(texto).toContain('Mapa: https://www.google.com/maps?q=-23.18000,-45.88000')
    expect(texto).toMatch(/Ciência\n[\s\S]*198\.51\.100\.9 \(não verificado\)[\s\S]*Localização: não autorizada/)
    // A nota quebra em duas linhas.
    expect(texto.replace(/\n/g, ' ')).toContain('IP carimbado pelo servidor da Betinhos; aparelho e localização informados pelo aparelho do motorista.')
  })

  it('Informativo mostra só o bloco "Leitura"', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.informativo), dest('a', { cienteEm: null, lidoEm: '2026-11-01T13:10:00Z', assinaturaJson: '', evidenciaAbertura: evidencia }))] })
    const texto = await textoDaPagina(bytes, 1)
    expect(texto).toMatch(/^Leitura$/m)
    expect(texto).not.toMatch(/^Abertura$/m)
    expect(texto).not.toMatch(/^Ciência$/m)
    expect(texto).toContain('Versão do App: 2.1.860')
  })

  it('sem evidência (registro antigo) ou ilegível não falha e avisa', async () => {
    const bytes = await gerarComprovantesPdf({ ...base, modo: 'comunicado', alvo: 'x', pares: [par(comunicado('c', COMUNICADO_TIPO.ciencia), dest('a', { evidenciaCiencia: { ...evidencia, invalida: true } }))] })
    const texto = await textoDaPagina(bytes, 1)
    expect(texto).toContain('Não registrado (registro anterior à captura do aparelho).')
    expect(texto).toContain('Registro do aparelho ilegível (formato inválido).')
  })
})
