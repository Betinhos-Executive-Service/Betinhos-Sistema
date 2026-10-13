import { afterEach, describe, expect, it, vi } from 'vitest'
import { callFlow, createSharePointDocs, pastaFuncionario, sanitizeFileName, uniqueName } from './sharepoint'

afterEach(() => vi.unstubAllGlobals())

describe('sharepoint helpers', () => {
  it('separa a pasta de DEV', () => {
    expect(pastaFuncionario('abc', 'DEV')).toBe('Funcionarios/DEV/abc')
    expect(pastaFuncionario('abc', 'PROD')).toBe('Funcionarios/abc')
  })

  it('limpa nomes que o flow recusaria', () => {
    expect(sanitizeFileName('../CNH frente/verso.pdf')).toBe('_CNH frente_verso.pdf')
    expect(sanitizeFileName('a..b.png')).toBe('a.b.png')
    expect(sanitizeFileName('Exame toxicológico 2026.pdf')).toBe('Exame toxicológico 2026.pdf')
  })

  it('evita sobrescrever arquivo com o mesmo nome', () => {
    expect(uniqueName('laudo.pdf', ['outro.pdf'])).toBe('laudo.pdf')
    expect(uniqueName('laudo.pdf', ['Laudo.pdf', 'laudo (2).pdf'])).toBe('laudo (3).pdf')
  })

  it('transforma resposta de erro do flow em mensagem legível', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sucesso: false, erro: 'Solicitação inválida.' }), { status: 400 })))
    await expect(callFlow('https://x', {})).rejects.toThrow('Solicitação inválida.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    await expect(callFlow('https://x', {})).rejects.toThrow('HTTP 502')
  })
})

describe('createSharePointDocs.listar', () => {
  it('lista uma subpasta do dono', async () => {
    const api = {
      retrieveMultipleRecords: vi.fn(async (entity: string) => entity === 'environmentvariabledefinition'
        ? { entities: [{ environmentvariabledefinitionid: 'def', defaultvalue: 'https://flow/listar' }] }
        : { entities: [] }),
    }
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ sucesso: true, arquivos: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const docs = createSharePointDocs(api as never, 'DEV', 'Veiculos')
    await docs.listar('v1', 'Documentos/CRLV')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ caminhoCompleto: 'Veiculos/DEV/v1/Documentos/CRLV' })
  })
})
