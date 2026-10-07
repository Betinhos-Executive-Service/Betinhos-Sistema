import { describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import { saveExisting, submitNew, type SubmitDeps } from './submit'
import { readPending, type KV } from '../domain/submission'

function memory(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

function setup(upload: (id: string, file: File, payload: Row) => Promise<string> = async () => 'https://s/cv.pdf') {
  const kv = memory()
  const create = vi.fn(async (_payload: Row) => 'r1')
  const update = vi.fn(async (_id: string, _payload: Row) => {})
  const uploadFn = vi.fn(upload)
  const deps: SubmitDeps = { create, update, upload: uploadFn, kv, uploadEnabled: true }
  return { kv, create, update, upload: uploadFn, deps }
}

const payload = { new_nomecompleto: 'Ana', new_cargointeresse: 'Motorista', new_statuscurriculo: 100000000 }
const file = new File(['cv'], 'cv.pdf', { type: 'application/pdf' })

describe('submitNew', () => {
  it('cria, envia e grava o link', async () => {
    const t = setup()
    expect(await submitNew(t.deps, payload, file)).toEqual({ recordId: 'r1', link: 'https://s/cv.pdf', message: 'Currículo registrado e arquivo anexado.', uploadFailed: false })
    expect(t.update).toHaveBeenCalledWith('r1', { new_linkcurriculo: 'https://s/cv.pdf' })
    expect(readPending(t.kv)).toBeNull()
  })
  it('arquivo salvo no SharePoint sem link: conclui sem gravar new_linkcurriculo', async () => {
    const t = setup(async () => '')
    expect(await submitNew(t.deps, payload, file)).toEqual({ recordId: 'r1', link: null, message: 'Currículo registrado e arquivo anexado.', uploadFailed: false })
    expect(t.update).not.toHaveBeenCalled()
    expect(await saveExisting(t.deps, 'r9', {}, file, payload)).toEqual({ link: null, message: 'Alterações salvas e arquivo anexado.', uploadFailed: false })
    expect(readPending(t.kv)).toBeNull()
  })
  it('não duplica o registro quando o upload falha e o usuário salva de novo', async () => {
    let fail = true
    const t = setup(async () => { if (fail) throw new Error('HTTP 502'); return 'https://s/cv.pdf' })
    const first = await submitNew(t.deps, payload, file)
    expect(first).toMatchObject({ recordId: 'r1', uploadFailed: true })
    expect(readPending(t.kv)?.phase).toBe('record-created')
    fail = false
    const second = await submitNew(t.deps, payload, file)
    expect(t.create).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ recordId: 'r1', link: 'https://s/cv.pdf', message: 'Cadastro concluído sem duplicar o registro.', uploadFailed: false })
  })
  it('retoma só a gravação do link', async () => {
    const t = setup()
    t.update.mockRejectedValueOnce(new Error('timeout'))
    await expect(submitNew(t.deps, payload, file)).rejects.toThrow('timeout')
    expect(readPending(t.kv)).toMatchObject({ phase: 'upload-completed', webUrl: 'https://s/cv.pdf' })
    const result = await submitNew(t.deps, payload, null)
    expect(t.create).toHaveBeenCalledTimes(1)
    expect(t.upload).toHaveBeenCalledTimes(1)
    expect(result.message).toBe('Cadastro retomado e link gravado sem duplicar o registro.')
  })
  it('pede o arquivo quando o registro já existe sem ele', async () => {
    const t = setup(async () => { throw new Error('falhou') })
    await submitNew(t.deps, payload, file)
    await expect(submitNew(t.deps, payload, null)).rejects.toThrow('Este cadastro já foi criado e aguarda o arquivo "cv.pdf".')
    expect(t.create).toHaveBeenCalledTimes(1)
  })
  it('sem arquivo ou sem Flow, só cria', async () => {
    const t = setup()
    expect((await submitNew(t.deps, payload, null)).message).toBe('Currículo registrado.')
    const u = setup()
    const result = await submitNew({ ...u.deps, uploadEnabled: false }, payload, file)
    expect(result.message).toBe('Currículo registrado. Envio de arquivo indisponível neste ambiente.')
    expect(u.upload).not.toHaveBeenCalled()
    expect(readPending(u.kv)).toBeNull()
  })
})

describe('saveExisting', () => {
  it('salva só o que mudou e anexa o arquivo', async () => {
    const t = setup()
    expect(await saveExisting(t.deps, 'r9', {}, null, payload)).toEqual({ link: null, message: 'Alterações salvas.', uploadFailed: false })
    expect(t.update).not.toHaveBeenCalled()
    const result = await saveExisting(t.deps, 'r9', { new_nota: 9 }, file, payload)
    expect(t.update.mock.calls).toEqual([['r9', { new_nota: 9 }], ['r9', { new_linkcurriculo: 'https://s/cv.pdf' }]])
    expect(result).toEqual({ link: 'https://s/cv.pdf', message: 'Alterações salvas e arquivo anexado.', uploadFailed: false })
  })
  it('mantém as alterações quando só o upload falha', async () => {
    const t = setup(async () => { throw new Error('HTTP 500') })
    expect(await saveExisting(t.deps, 'r9', { new_nota: 9 }, file, payload)).toEqual({
      link: null, message: 'Alterações salvas, mas o envio do arquivo falhou. Anexe de novo e salve para tentar outra vez.', uploadFailed: true,
    })
  })
})
