import { describe, expect, it } from 'vitest'
import { ESTADO, PUSH, emptyDraft, type Funcionario } from '../domain/treinamentos'
import { createSource } from './source'

const G = (n: number) => `00000000-0000-0000-0000-00000000000${n}`
const func = (n: number): Funcionario => ({ id: G(n), nome: `Motorista ${n}`, apelido: '', funcao: null, ativo: true })

function hostFalso(opts: { falhaNoTreinamento?: boolean; existentes?: Record<string, unknown>[] } = {}) {
  const chamadas: string[] = []
  let seq = 0
  const client = {
    getAll: async (url: string) => (url.startsWith('cr40f_treinamentoparticipacaos') ? opts.existentes ?? [] : []),
    create: async (set: string, data: Record<string, unknown>) => { chamadas.push(`create ${set} ${'cr40f_pushstatus' in data ? 'COM-PUSH' : 'sem-push'}`); return `p${(seq += 1)}` },
    update: async (set: string, id: string, data: Record<string, unknown>) => {
      if (set === 'cr40f_treinamentos' && opts.falhaNoTreinamento) throw new Error('falhou')
      chamadas.push(`update ${set} ${id} ${JSON.stringify(data.cr40f_pushstatus ?? data.cr40f_estado)}`)
    },
    remove: async () => undefined,
  }
  const entities = ['cr40f_treinamento', 'cr40f_treinamentoparticipacao', 'cr40f_funcionarios']
  const metadata = { entities: async () => new Map(entities.map((e) => [e, { entitySetName: `${e}s` }])) }
  return { chamadas, host: { mode: 'dataverse', clientUrl: 'https://org.crm2.dynamics.com', client, metadata, insideModelDriven: false, appId: async () => undefined } as never }
}

describe('publicar (Dataverse)', () => {
  const treinamento = { ...emptyDraft(), id: 't1', titulo: 'T', conteudo: 'x' }

  it('marca Pendente só depois do PATCH que publica', async () => {
    const { host, chamadas } = hostFalso()
    await createSource(host).publicar(treinamento, [func(1), func(2)])
    expect(chamadas).toEqual([
      'create cr40f_treinamentoparticipacaos sem-push', 'create cr40f_treinamentoparticipacaos sem-push',
      `update cr40f_treinamentos t1 ${ESTADO.publicado}`,
      `update cr40f_treinamentoparticipacaos p1 ${PUSH.pendente}`, `update cr40f_treinamentoparticipacaos p2 ${PUSH.pendente}`,
    ])
  })

  it('se o PATCH de publicação falha, nenhuma participação vira Pendente', async () => {
    const { host, chamadas } = hostFalso({ falhaNoTreinamento: true })
    await expect(createSource(host).publicar(treinamento, [func(1)])).rejects.toThrow('falhou')
    expect(chamadas.some((c) => c.includes(String(PUSH.pendente)))).toBe(false)
  })

  it('na nova tentativa, participação sem status de uma publicação interrompida entra na fila', async () => {
    const existente = { cr40f_treinamentoparticipacaoid: 'px', _cr40f_treinamento_value: 't1', _cr40f_funcionario_value: G(1) }
    const { host, chamadas } = hostFalso({ existentes: [existente] })
    await createSource(host).publicar(treinamento, [func(1)])
    expect(chamadas).toEqual([`update cr40f_treinamentos t1 ${ESTADO.publicado}`, `update cr40f_treinamentoparticipacaos px ${PUSH.pendente}`])
  })
})
