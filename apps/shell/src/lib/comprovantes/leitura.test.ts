import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import type { Comprovante } from './arquivo'
import { createArquivos, MAX_BUSCAS } from './leitura'

const anexo: Comprovante = { id: 'a1', nome: 'cupom.jpg', url: null, driveItemId: 'DRIVE-1' }
const client = (url = 'https://flow.test/consultar') => ({ getAll: vi.fn(async (path: string) => (path.startsWith('environmentvariablevalues') ? [{ value: url }] : [])) }) as unknown as DataverseClient

afterEach(() => vi.unstubAllGlobals())

describe('leitura do comprovante no OneDrive', () => {
  it('chama o flow pelo driveitemid, monta blob URL e guarda em cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: true, mimeType: 'application/octet-stream', conteudoBase64: btoa('abc') }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    const ler = createArquivos(client())
    expect(await ler(anexo)).toEqual({ nome: 'cupom.jpg', mime: 'image/jpeg', url: 'blob:teste' })
    await ler(anexo)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ id: 'DRIVE-1', nomeArquivo: 'cupom.jpg' })
  })

  it('erro do flow chega com a mensagem dele e não fica em cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: false, erro: 'Comprovante não encontrado no OneDrive.' }), { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const ler = createArquivos(client())
    await expect(ler(anexo)).rejects.toThrow('Comprovante não encontrado no OneDrive.')
    await expect(ler(anexo)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('comprovante antigo vai pelo link e usa o nome do OneDrive, com extensão', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: true, nomeArquivo: 'comprovante-1.jpg', mimeType: 'image/jpeg', conteudoBase64: btoa('abc') }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    const antigo = { ...anexo, nome: 'comprovante-1', driveItemId: '', url: 'https://betinhos-my.sharepoint.com/:i:/g/x' }
    expect(await createArquivos(client())(antigo)).toMatchObject({ nome: 'comprovante-1.jpg', mime: 'image/jpeg' })
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ link: 'https://betinhos-my.sharepoint.com/:i:/g/x', nomeArquivo: 'comprovante-1' })
  })

  it('comprovante novo no SharePoint vai com origem sharepoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: true, nomeArquivo: 'd1-1.jpg', mimeType: 'image/jpeg', conteudoBase64: btoa('abc') }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    const novo = { ...anexo, driveItemId: '42', url: 'https://betinhos.sharepoint.com/:i:/s/sistema/abc' }
    await createArquivos(client())(novo)
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ id: '42', nomeArquivo: 'cupom.jpg', origem: 'sharepoint' })
  })

  it('id do OneDrive com link do OneDrive pessoal (betinhos-my) continua sem origem', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sucesso: true, mimeType: 'image/jpeg', conteudoBase64: btoa('abc') }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    await createArquivos(client())({ ...anexo, url: 'https://betinhos-my.sharepoint.com/:i:/g/x' })
    expect(JSON.parse(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ id: 'DRIVE-1', nomeArquivo: 'cupom.jpg' })
  })

  it('sem arquivo no OneDrive ou sem variável configurada, explica o motivo', async () => {
    await expect(createArquivos(client())({ ...anexo, driveItemId: '', url: null })).rejects.toThrow('ainda não tem o arquivo')
    await expect(createArquivos(client(''))(anexo)).rejects.toThrow('new_URLFlowConsultarArquivoOneDrive')
  })

  it('no máximo 4 buscas ao mesmo tempo; a 5ª espera uma terminar', async () => {
    const respostas: (() => void)[] = []
    const fetchMock = vi.fn(() => new Promise<Response>((ok) => respostas.push(() => ok(new Response(JSON.stringify({ sucesso: true, mimeType: 'image/jpeg', conteudoBase64: btoa('abc') }), { status: 200 })))))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:teste' }))
    const ler = createArquivos(client())
    const leituras = Array.from({ length: MAX_BUSCAS + 1 }, (_, i) => ler({ ...anexo, id: `a${i}` }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(MAX_BUSCAS))
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(MAX_BUSCAS)
    respostas[0]()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(MAX_BUSCAS + 1))
    respostas.slice(1).forEach((r) => r())
    await Promise.all(leituras)
  })

  it('leitura que passa do tempo cai com mensagem clara e não fica em cache', async () => {
    const fetchMock = vi.fn((_: string, init?: RequestInit) => new Promise<Response>((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(new DOMException('aborted', 'AbortError')))))
    vi.stubGlobal('fetch', fetchMock)
    const ler = createArquivos(client(), 20)
    await expect(ler(anexo)).rejects.toThrow('demorou mais de')
    await expect(ler(anexo)).rejects.toThrow('demorou mais de')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
