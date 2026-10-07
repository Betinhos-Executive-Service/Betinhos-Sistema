import { describe, expect, it, vi } from 'vitest'
import { curriculosPath, mapCurriculo } from './queries'
import { linkPatch, statusPatch } from './mutations'
import { MAX_FILE_SIZE, fileProblem, flowBody, parseFlowResponse, postToFlow, toBase64 } from './upload'
import { MOCK_CHOICES, createMockRows } from './mock'
import { buildStages, groupByStage } from '../domain/funnel'

describe('consultas', () => {
  it('lê todas as linhas ativas, mais novas primeiro', () => {
    const path = decodeURIComponent(curriculosPath('new_curriculos'))
    expect(path.startsWith('new_curriculos?$select=new_curriculoid,new_nomecompleto,new_cpf,')).toBe(true)
    expect(path).toContain(',createdon&$filter=statecode eq 0&$orderby=createdon desc')
  })
  it('mapeia a linha com números e nulos', () => {
    const c = mapCurriculo({
      new_curriculoid: '{ABC-1}', new_nomecompleto: 'Ana', new_nota: 8, new_pretensaosalarial: 3500,
      new_statuscurriculo: 100000001, new_cpf: null, createdon: '2026-10-01T12:00:00Z',
    })
    expect(c).toMatchObject({ id: 'abc-1', nome: 'Ana', nota: 8, pretensao: 3500, status: 100000001, cpf: '', cnh: null, link: '' })
    expect(c.criadoEm?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })
  it('monta os PATCH', () => {
    expect(statusPatch(100000004)).toEqual({ new_statuscurriculo: 100000004 })
    expect(linkPatch('https://s/x')).toEqual({ new_linkcurriculo: 'https://s/x' })
  })
})

describe('upload', () => {
  it('recusa tipo e tamanho fora do limite', () => {
    expect(fileProblem({ name: 'cv.PDF', size: MAX_FILE_SIZE })).toBeNull()
    expect(fileProblem({ name: 'cv.exe', size: 1 })).toBe('cv.exe não é um tipo aceito. Use PDF, DOC, DOCX, PNG ou JPG.')
    expect(fileProblem({ name: 'cv.pdf', size: MAX_FILE_SIZE + 1 })).toBe('cv.pdf passa de 10 MB. Reduza o arquivo antes de enviar.')
  })
  it('monta o corpo do Flow igual ao legado', () => {
    const body = flowBody('r1', { name: 'cv.pdf', type: '', size: 3, base64: 'AAA' },
      { new_nomecompleto: 'Ana', new_email: 'ana@x.com', new_cargointeresse: 'Motorista', new_nota: 8 }, 'Renan', '2026-10-05T12:00:00.000Z')
    expect(body).toEqual({
      curriculoId: 'r1', expenseId: 'r1', externalId: 'new_curriculo', fileName: 'cv.pdf', mimeType: 'application/octet-stream', fileSize: 3,
      base64: 'AAA', candidateName: 'Ana', candidateEmail: 'ana@x.com', cargoInteresse: 'Motorista', indicadoPor: '',
      uploadedBy: 'Renan', uploadedAt: '2026-10-05T12:00:00.000Z',
    })
  })
  it('lê o webUrl e tolera resposta vazia ou não JSON', async () => {
    expect(parseFlowResponse('')).toEqual({ webUrl: '' })
    expect(parseFlowResponse('{"webUrl":"https://s/x","driveItemId":"1"}')).toEqual({ webUrl: 'https://s/x' })
    expect(parseFlowResponse('ok')).toEqual({ webUrl: '' })
    expect(await toBase64(new Blob(['oi']))).toBe('b2k=')
  })
  it('posta no Flow e falha com o status HTTP', async () => {
    const ok = vi.fn(async () => new Response('{"webUrl":"https://s/x"}', { status: 200 }))
    expect(await postToFlow('https://flow.invalid/run', { a: 1 }, ok as unknown as typeof fetch)).toBe('https://s/x')
    expect(ok).toHaveBeenCalledWith('https://flow.invalid/run', expect.objectContaining({ method: 'POST', body: '{"a":1}' }))
    const bad = vi.fn(async () => new Response('x', { status: 502 }))
    await expect(postToFlow('https://flow.invalid/run', {}, bad as unknown as typeof fetch)).rejects.toThrow('O envio do arquivo falhou (HTTP 502).')
  })
})

describe('mock', () => {
  it('cobre as cinco etapas e o status vazio', () => {
    const list = createMockRows(new Date('2026-10-05T12:00:00-03:00')).map(mapCurriculo)
    const stages = buildStages(MOCK_CHOICES.status)
    expect(stages).toHaveLength(5)
    expect(list.some((c) => c.status == null)).toBe(true)
    const groups = groupByStage(list, stages)
    expect(stages.every((s) => (groups.get(s.value) ?? []).length > 0)).toBe(true)
    expect(groups.get(100000000)).toHaveLength(3)
  })
})
