import { describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { Proposta } from '../domain/types'
import { createSource } from './source'

const RESERVA = 'aaaaaaaa-0000-4000-8000-000000000002'
const MOTORISTA = 'bbbbbbbb-0000-4000-8000-000000000001'
const SETS: Record<string, string> = { cr40f_reservadeveculos: 'cr40f_reservadeveculoses', cr40f_plannertarefa: 'cr40f_plannertarefas' }

function fakeHost(opts: { reserva?: Row; pendencias?: Row[] } = {}) {
  const request = vi.fn(async (_path: string) => opts.reserva ?? {})
  const getAll = vi.fn(async (_path: string) => opts.pendencias ?? [])
  const update = vi.fn(async () => {})
  const create = vi.fn(async () => 'novo-id')
  const entities = vi.fn(async (names: string[]) => new Map(names.map((n) => [n, { entitySetName: SETS[n] }])))
  const host = { mode: 'dataverse', clientUrl: 'https://org.crm.dynamics.com', insideModelDriven: false, appId: async () => undefined, client: { request, getAll, update, create }, metadata: { entities } } as unknown as Host
  return { host, request, getAll, update, create }
}

const atribuir: Proposta = { id: 'p1', execucaoId: 'e1', tipo: 'ServicoSemMotorista', titulo: 'OS-11', justificativa: '', prioridade: 'alta', entidadeAlvo: 'cr40f_reservadeveculos', idAlvo: RESERVA, acao: { tipo: 'AtribuirMotorista', campos: { motoristaId: MOTORISTA } }, decisao: 'pendente', motivoDescarte: '', decididoPor: '', decididoEm: null }
const pendencia: Proposta = { ...atribuir, id: 'p2', tipo: 'SemRecibo', acao: { tipo: 'CriarPendencia', campos: { titulo: 'Emitir recibo', descricao: '' } } }

describe('createSource (Dataverse) executarAcao', () => {
  it('recusa atribuir motorista quando o serviço já tem motorista', async () => {
    const f = fakeHost({ reserva: { _cr40f_motorista_value: 'outro', _cr40f_veiculo_value: null } })
    await expect(createSource(f.host).executarAcao(atribuir)).rejects.toThrow('Este serviço já tem motorista escalado.')
    expect(f.request).toHaveBeenCalledWith(`cr40f_reservadeveculoses(${RESERVA})?$select=_cr40f_motorista_value,_cr40f_veiculo_value`)
    expect(f.update).not.toHaveBeenCalled()
  })
  it('recusa atribuir veículo quando o serviço já tem veículo', async () => {
    const f = fakeHost({ reserva: { _cr40f_motorista_value: null, _cr40f_veiculo_value: 'outro' } })
    await expect(createSource(f.host).executarAcao({ ...atribuir, acao: { tipo: 'AtribuirVeiculo', campos: { veiculoId: MOTORISTA } } })).rejects.toThrow('Este serviço já tem veículo.')
    expect(f.update).not.toHaveBeenCalled()
  })
  it('atribui quando o campo está vazio', async () => {
    const f = fakeHost({ reserva: { _cr40f_motorista_value: null, _cr40f_veiculo_value: 'v' } })
    await createSource(f.host).executarAcao(atribuir)
    expect(f.update).toHaveBeenCalledWith('cr40f_reservadeveculoses', RESERVA, { 'cr40f_Motorista@odata.bind': `/cr40f_funcionarioses(${MOTORISTA})` })
  })
  it('não duplica a pendência da mesma proposta', async () => {
    const f = fakeHost({ pendencias: [{ cr40f_plannertarefaid: 'x' }] })
    await createSource(f.host).executarAcao(pendencia)
    expect(f.getAll).toHaveBeenCalledWith(`cr40f_plannertarefas?$select=cr40f_plannertarefaid&$filter=${encodeURIComponent("cr40f_codigoorigem eq 'agente:p2'")}&$top=1`)
    expect(f.create).not.toHaveBeenCalled()
  })
  it('cria a pendência quando ainda não existe', async () => {
    const f = fakeHost()
    await createSource(f.host).executarAcao(pendencia)
    expect(f.create).toHaveBeenCalledWith('cr40f_plannertarefas', expect.objectContaining({ cr40f_titulo: 'Emitir recibo', cr40f_codigoorigem: 'agente:p2' }))
  })
})
