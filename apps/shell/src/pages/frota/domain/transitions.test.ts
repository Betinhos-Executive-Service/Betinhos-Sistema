import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { DataSource, FlowResult } from '../data/source'
import { EMPTY_DATA, FlowIncertoError } from '../data/source'
import { applyTransition, bloqueio, buildPatch, liberarFlows, StaleError, transitionsFor, validate, type RegistroStatus } from './transitions'

const ctx = { now: new Date('2026-10-02T15:00:00Z'), dateBehaviors: { cr40f_agendarpara: 'DateOnly' } as const }
const ids = (kind: Parameters<typeof transitionsFor>[0], status: number | null) => transitionsFor(kind, status).map((item) => item.id)
const pick = (kind: Parameters<typeof transitionsFor>[0], status: number, id: string) => transitionsFor(kind, status).find((item) => item.id === id)!
const registro = (status: number | null, extra: Partial<RegistroStatus> = {}): RegistroStatus => ({ id: 'r1', status, temVeiculo: true, temMotorista: true, ...extra })

describe('transitionsFor', () => {
  it('lista só as transições permitidas de manutenção', () => {
    expect(ids('manutencao', MANUT.SOLICITADO)).toEqual(['aprovar', 'reprovar', 'cancelar'])
    expect(ids('manutencao', MANUT.APROVADO)).toEqual(['programar', 'concluir', 'cancelar'])
    expect(ids('manutencao', MANUT.PROGRAMADO)).toEqual(['concluir', 'cancelar'])
    expect(ids('manutencao', MANUT.REALIZADO)).toEqual([])
    expect(ids('manutencao', null)).toEqual([])
  })

  it('lista só as transições permitidas de multa', () => {
    expect(ids('multa', MULTA.NOTIFICAR)).toEqual(['notificado'])
    expect(ids('multa', MULTA.NOTIFICADO)).toEqual(['indicar', 'recurso', 'descontado', 'pago'])
    expect(ids('multa', MULTA.INDICADA)).toEqual(['recurso', 'descontado', 'pago'])
    expect(ids('multa', MULTA.PAGO)).toEqual(['finalizar'])
    expect(ids('multa', MULTA.RECURSO)).toEqual([])
  })

  it('lista só as transições permitidas de colisão', () => {
    expect(ids('colisao', COLISAO.ENVIADO)).toEqual(['analisar', 'cancelar'])
    expect(ids('colisao', COLISAO.ANALISE)).toEqual(['resolver', 'cancelar'])
    expect(ids('colisao', COLISAO.RESOLVIDO)).toEqual([])
  })

  it('marca quais transições chamam Flow', () => {
    expect(pick('manutencao', MANUT.SOLICITADO, 'aprovar').flow).toBe('aprovarManutencao')
    expect(pick('multa', MULTA.NOTIFICAR, 'notificado').flow).toBe('notificarCondutor')
    expect(pick('multa', MULTA.NOTIFICADO, 'indicar').flow).toBe('gerarContrato')
    expect(pick('manutencao', MANUT.SOLICITADO, 'reprovar').flow).toBeUndefined()
    expect(pick('manutencao', MANUT.APROVADO, 'programar').flow).toBeUndefined()
  })
})

describe('bloqueio', () => {
  it('exige veículo para aprovar e motorista para notificar e gerar contrato', () => {
    expect(bloqueio(pick('manutencao', MANUT.SOLICITADO, 'aprovar'), registro(MANUT.SOLICITADO, { temVeiculo: false }))).toBe('Informe o veículo no formulário antes desta ação')
    expect(bloqueio(pick('multa', MULTA.NOTIFICAR, 'notificado'), registro(MULTA.NOTIFICAR, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
    expect(bloqueio(pick('multa', MULTA.NOTIFICADO, 'indicar'), registro(MULTA.NOTIFICADO, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
  })

  it('não bloqueia quando o requisito existe nem transições sem requisito', () => {
    expect(bloqueio(pick('manutencao', MANUT.SOLICITADO, 'aprovar'), registro(MANUT.SOLICITADO))).toBeNull()
    expect(bloqueio(pick('manutencao', MANUT.SOLICITADO, 'reprovar'), registro(MANUT.SOLICITADO, { temVeiculo: false, temMotorista: false }))).toBeNull()
  })
})

describe('validate', () => {
  it('exige a data ao aprovar e o comentário ao reprovar', () => {
    expect(validate(pick('manutencao', MANUT.SOLICITADO, 'aprovar'), {})).toEqual({ cr40f_agendarpara: 'Obrigatório' })
    expect(validate(pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).toEqual({})
    expect(validate(pick('manutencao', MANUT.SOLICITADO, 'reprovar'), {})).toEqual({ cr40f_comentariosdoaprovador: 'Obrigatório' })
  })

  it('exige os quatro campos ao concluir e recusa valor inválido', () => {
    const concluir = pick('manutencao', MANUT.APROVADO, 'concluir')
    expect(Object.keys(validate(concluir, {}))).toEqual(['cr40f_datamanutencao', 'cr40f_valor', 'cr40f_estabelecimento', 'cr40f_servicorealizado'])
    expect(validate(concluir, { cr40f_datamanutencao: '2026-10-02T10:00', cr40f_valor: '-1', cr40f_estabelecimento: 'Oficina', cr40f_servicorealizado: 'Óleo' })).toEqual({ cr40f_valor: 'Informe um valor válido' })
  })

  it('respeita o tamanho máximo do campo', () => {
    const aprovar = pick('manutencao', MANUT.SOLICITADO, 'aprovar')
    expect(validate(aprovar, { cr40f_agendarpara: '2026-10-09', cr40f_comentariosdoaprovador: 'x'.repeat(101) })).toEqual({ cr40f_comentariosdoaprovador: 'Máximo de 100 caracteres' })
  })

  it('não exige campo nas transições de multa feitas por Flow', () => {
    expect(validate(pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).toEqual({})
    expect(validate(pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).toEqual({})
  })
})

describe('buildPatch', () => {
  it('aprovar grava data e comentário, mas não o status nem a data da aprovação (o Flow grava o status)', () => {
    expect(buildPatch('manutencao', pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09', cr40f_comentariosdoaprovador: ' ok ' }, ctx)).toEqual({
      cr40f_agendarpara: '2026-10-09', cr40f_comentariosdoaprovador: 'ok',
    })
  })

  it('reprovar grava status e comentário, sem a data da aprovação (a regra de negócio "Aprovado" troca o status quando essa data é gravada)', () => {
    expect(buildPatch('manutencao', pick('manutencao', MANUT.SOLICITADO, 'reprovar'), { cr40f_comentariosdoaprovador: 'Sem verba' }, ctx)).toEqual({
      cr40f_status: MANUT.REPROVADO, cr40f_comentariosdoaprovador: 'Sem verba',
    })
  })

  it('nenhuma transição de manutenção grava a data da aprovação', () => {
    for (const status of [MANUT.SOLICITADO, MANUT.APROVADO, MANUT.PROGRAMADO]) {
      for (const transition of transitionsFor('manutencao', status)) {
        const values = Object.fromEntries(transition.fields.map((field) => [field.key, field.type === 'date' ? '2026-10-09' : field.type === 'datetime' ? '2026-10-02T10:00' : field.type === 'money' ? '10' : 'x']))
        const patch = buildPatch('manutencao', transition, values, { now: ctx.now, dateBehaviors: { cr40f_agendarpara: 'DateOnly' } })
        expect(patch).not.toHaveProperty('cr40f_datadaaprovacao')
      }
    }
  })

  it('programar grava a data conforme o comportamento da coluna', () => {
    expect(buildPatch('manutencao', pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' }, ctx)).toEqual({ cr40f_status: MANUT.PROGRAMADO, cr40f_agendarpara: '2026-10-09' })
    expect(buildPatch('multa', pick('multa', MULTA.INDICADA, 'recurso'), {}, ctx)).toEqual({ cr40f_status: MULTA.RECURSO, new_recursopendente: true })
    expect(buildPatch('manutencao', pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' }, { now: ctx.now, dateBehaviors: { cr40f_agendarpara: 'UserLocal' } })).toEqual({ cr40f_status: MANUT.PROGRAMADO, cr40f_agendarpara: '2026-10-09T03:00:00Z' })
  })

  it('concluir converte data e hora de São Paulo para UTC e valor para número', () => {
    const patch = buildPatch('manutencao', pick('manutencao', MANUT.PROGRAMADO, 'concluir'), { cr40f_datamanutencao: '2026-10-02T10:00', cr40f_valor: '350.5', cr40f_estabelecimento: 'Oficina', cr40f_servicorealizado: 'Óleo' }, ctx)
    expect(patch).toEqual({ cr40f_status: MANUT.REALIZADO, cr40f_datamanutencao: '2026-10-02T13:00:00.000Z', cr40f_valor: 350.5, cr40f_estabelecimento: 'Oficina', cr40f_servicorealizado: 'Óleo' })
  })

  it('transições de multa por Flow não gravam nada pela tela', () => {
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICAR, 'notificado'), {}, ctx)).toEqual({})
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICADO, 'indicar'), {}, ctx)).toEqual({})
  })

  it('colisão grava no campo de status operacional', () => {
    expect(buildPatch('colisao', pick('colisao', COLISAO.ENVIADO, 'analisar'), {}, ctx)).toEqual({ cr40f_statusoperacional: COLISAO.ANALISE })
  })

  it('recusa gravar data sem o comportamento da coluna', () => {
    expect(() => buildPatch('manutencao', pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' }, { now: ctx.now, dateBehaviors: {} })).toThrow('Metadata de data indisponível para cr40f_agendarpara')
  })
})

describe('applyTransition', () => {
  function fakeSource(current: number | null) {
    return {
      mode: 'mock', envLabel: 'TEST',
      load: async () => ({ data: EMPTY_DATA, errors: {} }),
      currentStatus: vi.fn(async () => current),
      dateBehaviors: async () => ({ cr40f_agendarpara: 'DateOnly' }),
      update: vi.fn(async () => {}),
      prepareFlow: vi.fn(async () => {}),
      runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: 'OM reservada.', shareUrl: null })),
      openForm: async () => {},
      classificacao: async () => ({ servicos: [], categorias: [], origem: null, confianca: null }), classificarAgora: async () => { throw new Error("indisponível") }, fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => {},
    } satisfies DataSource
  }

  beforeEach(() => liberarFlows())

  it('transição direta grava o status e não chama Flow', async () => {
    const source = fakeSource(MANUT.APROVADO)
    const result = await applyTransition(source, 'manutencao', registro(MANUT.APROVADO), pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' })
    expect(result).toBeNull()
    expect(source.update).toHaveBeenCalledWith('manutencao', 'r1', { cr40f_status: MANUT.PROGRAMADO, cr40f_agendarpara: '2026-10-09' })
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('aprovar resolve o Flow, grava os campos sem o status e só depois chama o Flow', async () => {
    const source = fakeSource(MANUT.SOLICITADO)
    const result = await applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' }, new Date('2026-10-02T15:00:00Z'))
    expect(source.update).toHaveBeenCalledWith('manutencao', 'r1', { cr40f_agendarpara: '2026-10-09' })
    expect(source.prepareFlow).toHaveBeenCalledWith('aprovarManutencao')
    expect(source.runFlow).toHaveBeenCalledWith('aprovarManutencao', 'r1')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.prepareFlow.mock.invocationCallOrder[0]).toBeLessThan(source.update.mock.invocationCallOrder[0])
    expect(source.update.mock.invocationCallOrder[0]).toBeLessThan(source.runFlow.mock.invocationCallOrder[0])
    expect(result).toEqual({ message: 'OM reservada.', shareUrl: null })
  })

  it('transição direta não resolve o Flow', async () => {
    const source = fakeSource(MANUT.APROVADO)
    await applyTransition(source, 'manutencao', registro(MANUT.APROVADO), pick('manutencao', MANUT.APROVADO, 'programar'), { cr40f_agendarpara: '2026-10-09' })
    expect(source.prepareFlow).not.toHaveBeenCalled()
  })

  it('não grava nem chama o Flow quando a URL do Flow não está disponível', async () => {
    const source = fakeSource(MANUT.SOLICITADO)
    source.prepareFlow.mockRejectedValueOnce(new Error('URL do Flow "Agendar manutenção" não configurada (variável new_FlowUrlManutencao)'))
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toThrow('URL do Flow "Agendar manutenção" não configurada (variável new_FlowUrlManutencao)')
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('não resolve o Flow quando o registro está desatualizado', async () => {
    const source = fakeSource(MANUT.CANCELADO)
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toBeInstanceOf(StaleError)
    expect(source.prepareFlow).not.toHaveBeenCalled()
  })

  it('notificar condutor só chama o Flow, sem gravar pela tela', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'r1')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })

  it('não grava nem chama Flow quando outra pessoa mudou o status', async () => {
    const source = fakeSource(MANUT.CANCELADO)
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toBeInstanceOf(StaleError)
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('não consulta nem chama nada quando falta o requisito', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR, { temMotorista: false }), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('Informe o motorista no formulário antes desta ação')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('não chama o Flow se a gravação dos campos falhar', async () => {
    const source = fakeSource(MANUT.SOLICITADO)
    source.update.mockRejectedValueOnce(new Error('Sem privilégio de escrita'))
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toThrow('Sem privilégio de escrita')
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita aprovar com campos vazios antes de consultar o servidor', async () => {
    const source = fakeSource(MANUT.SOLICITADO)
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), {})).rejects.toThrow('Preencha os campos obrigatórios antes de confirmar')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita transição que não está disponível no status atual', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita Flow se a chamada falhar', async () => {
    const source = fakeSource(MANUT.SOLICITADO)
    source.runFlow.mockRejectedValueOnce(new Error('O Flow não respondeu'))
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), { cr40f_agendarpara: '2026-10-09' })).rejects.toThrow('O Flow não respondeu')
    expect(source.update).toHaveBeenCalledTimes(1)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})

describe('Flow já em andamento', () => {
  const MENSAGEM = 'Já há uma ação em andamento para este registro. Aguarde e recarregue a tela'
  const dados = { cr40f_agendarpara: '2026-10-09' }

  function fakeSource() {
    return {
      mode: 'mock', envLabel: 'TEST',
      load: async () => ({ data: EMPTY_DATA, errors: {} }),
      currentStatus: vi.fn(async () => MANUT.SOLICITADO as number | null),
      dateBehaviors: async () => ({ cr40f_agendarpara: 'DateOnly' }),
      update: vi.fn(async () => {}),
      prepareFlow: vi.fn(async () => {}),
      runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: null, shareUrl: null })),
      openForm: async () => {},
      classificacao: async () => ({ servicos: [], categorias: [], origem: null, confianca: null }), classificarAgora: async () => { throw new Error("indisponível") }, fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => {},
    } satisfies DataSource
  }
  const aprovar = (source: DataSource, id = 'r1') => applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO, { id }), pick('manutencao', MANUT.SOLICITADO, 'aprovar'), dados)

  beforeEach(() => liberarFlows())

  it('duas chamadas sobrepostas para o mesmo registro disparam o Flow uma única vez', async () => {
    const source = fakeSource()
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = aprovar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    await expect(aprovar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.update).toHaveBeenCalledTimes(1)
    terminar({ message: 'ok', shareUrl: null })
    await expect(primeira).resolves.toEqual({ message: 'ok', shareUrl: null })
  })

  it('depois do sucesso o registro pode ser tentado de novo', async () => {
    const source = fakeSource()
    await aprovar(source)
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('resultado incerto mantém o bloqueio até liberarFlows()', async () => {
    const source = fakeSource()
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('O Flow "Agendar manutenção" não respondeu em 60 s. Confira o registro antes de tentar de novo'))
    await expect(aprovar(source)).rejects.toBeInstanceOf(FlowIncertoError)
    await expect(aprovar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    liberarFlows()
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('erro definitivo libera o registro na hora', async () => {
    const source = fakeSource()
    source.runFlow.mockRejectedValueOnce(new Error('O Flow "Agendar manutenção" respondeu 500. Confira o registro antes de tentar de novo'))
    await expect(aprovar(source)).rejects.toThrow('respondeu 500')
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('outro registro não é bloqueado', async () => {
    const source = fakeSource()
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('timeout'))
    await expect(aprovar(source, 'r1')).rejects.toBeInstanceOf(FlowIncertoError)
    await aprovar(source, 'r2')
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('duas chamadas no mesmo instante, com currentStatus lento, disparam o Flow uma única vez', async () => {
    const source = fakeSource()
    source.currentStatus.mockImplementation(() => new Promise<number | null>((resolve) => { setTimeout(() => resolve(MANUT.SOLICITADO), 10) }))
    const resultados = await Promise.allSettled([aprovar(source), aprovar(source)])
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.update.mock.calls.length).toBeLessThanOrEqual(1)
    expect(resultados.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    const recusada = resultados.find((item) => item.status === 'rejected') as PromiseRejectedResult
    expect((recusada.reason as Error).message).toBe(MENSAGEM)
  })

  it('liberarFlows() não libera uma chamada que ainda está em execução', async () => {
    const source = fakeSource()
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = aprovar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    liberarFlows()
    await expect(aprovar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    terminar({ message: null, shareUrl: null })
    await primeira
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('o fim da primeira chamada libera a chave e o Flow nunca roda em paralelo', async () => {
    const source = fakeSource()
    let ativos = 0
    let maximo = 0
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementation(() => {
      ativos += 1
      maximo = Math.max(maximo, ativos)
      return new Promise<FlowResult>((resolve) => { terminar = (value) => { ativos -= 1; resolve(value) } })
    })
    const primeira = aprovar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    await expect(aprovar(source)).rejects.toThrow(MENSAGEM)
    terminar({ message: null, shareUrl: null })
    await primeira
    const terceira = aprovar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(2))
    terminar({ message: null, shareUrl: null })
    await terceira
    expect(maximo).toBe(1)
  })

  it('registro desatualizado não deixa o registro bloqueado', async () => {
    const source = fakeSource()
    source.currentStatus.mockResolvedValueOnce(MANUT.CANCELADO)
    await expect(aprovar(source)).rejects.toBeInstanceOf(StaleError)
    await aprovar(source)
    expect(source.currentStatus).toHaveBeenCalledTimes(2)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })

  it('falha ao gravar os campos não deixa o registro bloqueado', async () => {
    const source = fakeSource()
    source.update.mockRejectedValueOnce(new Error('Sem privilégio de escrita'))
    await expect(aprovar(source)).rejects.toThrow('Sem privilégio de escrita')
    expect(source.runFlow).not.toHaveBeenCalled()
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })

  it('falha antes do Flow (prepareFlow) não deixa o registro bloqueado', async () => {
    const source = fakeSource()
    source.prepareFlow.mockRejectedValueOnce(new Error('sem permissão'))
    await expect(aprovar(source)).rejects.toThrow('sem permissão')
    await aprovar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})
