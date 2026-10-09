import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import type { Anexo } from '../domain/types'
import { createArquivos } from './arquivo'

const anexo: Anexo = { id: 'a1', nome: 'cupom.jpg', tipo: 100000000, status: 100000001, url: null, driveItemId: 'DRIVE-1', enviadoEm: null, enviadoPor: '' }
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

  it('sem arquivo no OneDrive ou sem variável configurada, explica o motivo', async () => {
    await expect(createArquivos(client())({ ...anexo, driveItemId: '', url: null })).rejects.toThrow('não tem o arquivo no OneDrive')
    await expect(createArquivos(client(''))(anexo)).rejects.toThrow('new_URLFlowConsultarArquivoOneDrive')
  })
})
