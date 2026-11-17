// apps/shell/src/pages/frota/data/manutencaoDataverse.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarComandosXrm, type DepsXrm } from './manutencaoDataverse'

const ID = '{AAAAAAAA-1111-2222-3333-444444444444}'
const LIMPO = 'aaaaaaaa-1111-2222-3333-444444444444'
const API = 'https://org23b93544.crm2.dynamics.com/api/data/v9.2'

function criarDeps() {
  const webApi = {
    retrieveMultipleRecords: vi.fn(async (_entity: string, _options?: string) => ({ entities: [] as Record<string, unknown>[] })),
    retrieveRecord: vi.fn(async (_entity: string, _id: string, _options?: string) => ({}) as Record<string, unknown>),
    updateRecord: vi.fn(async (_entity: string, _id: string, _data: Record<string, unknown>) => ({})),
    createRecord: vi.fn(async (_entity: string, _data: Record<string, unknown>) => ({ id: '{BBBBBBBB-1111-2222-3333-444444444444}' })),
  }
  const d: DepsXrm = {
    api: webApi, apiUrl: API, envLabel: 'DEV',
    lerVariavel: vi.fn(async (_schemaName: string) => 'https://flow.invalid/arquivos?sig=SEGREDO'),
    metadata: vi.fn(async () => ({ value: [] })) as unknown as DepsXrm['metadata'],
    comportamentos: async () => ({ cr40f_janelainicio: 'DateOnly', cr40f_janelafim: 'DateOnly' }),
  }
  return { d, webApi }
}

const resposta = (ok: boolean, status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status, json: async () => body }))
const corpo = (fetchMock: ReturnType<typeof resposta>, i = 0) => JSON.parse(String(fetchMock.mock.calls[i][1]?.body))

afterEach(() => vi.unstubAllGlobals())

describe('Custom APIs da manutenção', () => {
  it('agendar manda o pedido em RequestJson, com o Guid limpo', async () => {
    const f = resposta(true, 200, { ResponseJson: JSON.stringify({ geralId: 'g1' }) })
    vi.stubGlobal('fetch', f)
    await criarComandosXrm(criarDeps().d).agendarManutencao({ manutencaoId: ID, inicio: '2026-11-23', fim: '2026-11-29', comentario: 'Levar cedo' })
    expect(f.mock.calls[0][0]).toBe(`${API}/cr40f_ManutencaoAgendar`)
    expect(f.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(corpo(f).RequestJson)).toEqual({ manutencaoId: LIMPO, inicio: '2026-11-23', fim: '2026-11-29', comentario: 'Levar cedo' })
  })

  it('reprovar e cancelar vão para as APIs deles', async () => {
    const f = resposta(true, 200, { ResponseJson: '{}' })
    vi.stubGlobal('fetch', f)
    const comandos = criarComandosXrm(criarDeps().d)
    await comandos.reprovarManutencao(ID, 'Sem verba')
    await comandos.cancelarManutencao(ID, null)
    expect(f.mock.calls.map((call) => call[0])).toEqual([`${API}/cr40f_ManutencaoReprovar`, `${API}/cr40f_ManutencaoCancelar`])
    expect(JSON.parse(corpo(f, 0).RequestJson)).toEqual({ manutencaoId: LIMPO, comentario: 'Sem verba' })
    expect(JSON.parse(corpo(f, 1).RequestJson)).toEqual({ manutencaoId: LIMPO, comentario: null })
  })

  it('erro de negócio do servidor chega com a mensagem dele', async () => {
    vi.stubGlobal('fetch', resposta(false, 400, { error: { message: 'A janela precisa ser um dia ou uma semana de segunda a domingo.' } }))
    await expect(criarComandosXrm(criarDeps().d).agendarManutencao({ manutencaoId: ID, inicio: '2026-11-24', fim: '2026-11-30', comentario: null })).rejects.toThrow('A janela precisa ser um dia ou uma semana de segunda a domingo.')
  })

  it('concluir manda o contrato inteiro e lê a despesa e o estado do anexo', async () => {
    const f = resposta(true, 200, { ResponseJson: JSON.stringify({ despesaId: '{CCCCCCCC-1111-2222-3333-444444444444}', statusAnexo: 100000001, geralId: null }) })
    vi.stubGlobal('fetch', f)
    const pedido = { manutencaoId: ID, servicos: [100000007], km: 85200, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina', cidadeId: '{DDDDDDDD-1111-2222-3333-444444444444}', realizadoPorId: '{EEEEEEEE-1111-2222-3333-444444444444}', servicoRealizado: null, comentario: 'ok', linkNotaFiscal: 'https://x.invalid/nf', linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null }
    const r = await criarComandosXrm(criarDeps().d).concluirManutencao(pedido)
    expect(r).toEqual({ despesaId: 'cccccccc-1111-2222-3333-444444444444', statusAnexo: 100000001, geralId: null })
    expect(f.mock.calls[0][0]).toBe(`${API}/cr40f_ManutencaoConcluir`)
    expect(JSON.parse(corpo(f).RequestJson)).toEqual({ ...pedido, manutencaoId: LIMPO, cidadeId: 'dddddddd-1111-2222-3333-444444444444', realizadoPorId: 'eeeeeeee-1111-2222-3333-444444444444' })
  })

  it('concluir sem a despesa na resposta é erro', async () => {
    vi.stubGlobal('fetch', resposta(true, 200, { ResponseJson: '{}' }))
    const pedido = { manutencaoId: ID, servicos: [100000007], km: 1, data: '2026-11-17T10:00:00-03:00', valor: 1, pagamento: 202410000, estabelecimento: 'x', cidadeId: ID, realizadoPorId: ID, servicoRealizado: null, comentario: null, linkNotaFiscal: null, linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null }
    await expect(criarComandosXrm(criarDeps().d).concluirManutencao(pedido)).rejects.toThrow(/não devolveu a despesa/)
  })

  it('recusa id que não é Guid sem chamar o servidor', async () => {
    const f = resposta(true, 200, {})
    vi.stubGlobal('fetch', f)
    await expect(criarComandosXrm(criarDeps().d).reprovarManutencao("x'; drop", 'motivo')).rejects.toThrow('Identificador inválido')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('detalhe e criação', () => {
  it('detalhe lê as colunas da gaveta com os comportamentos de data', async () => {
    const { d, webApi } = criarDeps()
    webApi.retrieveRecord.mockResolvedValueOnce({ cr40f_manutencoesid: LIMPO, cr40f_status: 202410001, cr40f_janelainicio: '2026-11-23', cr40f_janelafim: '2026-11-29', cr40f_foto01: 'https://x.invalid/1' })
    const m = await criarComandosXrm(d).detalheManutencao(ID)
    expect(webApi.retrieveRecord.mock.calls[0][0]).toBe('cr40f_manutencoes')
    expect(webApi.retrieveRecord.mock.calls[0][1]).toBe(LIMPO)
    expect(webApi.retrieveRecord.mock.calls[0][2]).toContain('new_linkdanotafiscal')
    expect(m).toMatchObject({ id: LIMPO, status: 202410001, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', fotosPedido: ['https://x.invalid/1'] })
  })

  it('detalhe de registro que não existe devolve null', async () => {
    const { d, webApi } = criarDeps()
    webApi.retrieveRecord.mockRejectedValueOnce(new Error(`cr40f_manutencoes With Id = ${LIMPO} Does Not Exist`))
    expect(await criarComandosXrm(d).detalheManutencao(ID)).toBeNull()
  })

  it('criar grava Solicitado com veículo e solicitante pelos binds', async () => {
    const { d, webApi } = criarDeps()
    const id = await criarComandosXrm(d).criarManutencao({ veiculoId: '{11111111-1111-4111-8111-111111111111}', descricao: 'Freio', grau: 4, tipo: 2, km: 85000, solicitanteId: '{22222222-2222-4222-8222-222222222222}' })
    expect(id).toBe('bbbbbbbb-1111-2222-3333-444444444444')
    expect(webApi.createRecord).toHaveBeenCalledWith('cr40f_manutencoes', {
      cr40f_descricao: 'Freio', cr40f_graudamanutencao: 4, cr40f_kmatual: 85000, cr40f_status: 0, cr40f_tipodoreparo: 2,
      'cr40f_Placa_Carro@odata.bind': '/cr40f_veiculoses(11111111-1111-4111-8111-111111111111)',
      'cr40f_Solicitado_por@odata.bind': '/cr40f_funcionarioses(22222222-2222-4222-8222-222222222222)',
    })
  })

  it('criar sem tipo nem solicitante não manda essas colunas', async () => {
    const { d, webApi } = criarDeps()
    await criarComandosXrm(d).criarManutencao({ veiculoId: '{11111111-1111-4111-8111-111111111111}', descricao: 'Pneu', grau: 2, tipo: null, km: 1000, solicitanteId: null })
    const enviado = webApi.createRecord.mock.calls[0][1]
    expect(enviado).not.toHaveProperty('cr40f_tipodoreparo')
    expect(enviado).not.toHaveProperty('cr40f_Solicitado_por@odata.bind')
  })
})
