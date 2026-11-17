// apps/shell/src/pages/frota/domain/transitions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { DataSource, FlowResult } from '../data/source'
import { EMPTY_DATA, FlowIncertoError } from '../data/source'
import { manutencaoFalsa } from '../testUtils'
import { acoesManutencao, applyTransition, bloqueio, buildPatch, desfechoDaAcao, executarAcaoManutencao, liberarFlows, rotuloAcao, StaleError, transitionsFor, validate, type RegistroStatus, type Transition } from './transitions'

const ctx = { now: new Date('2026-10-02T15:00:00Z'), dateBehaviors: { cr40f_prazo: 'DateOnly' } as const }
const ids = (kind: Parameters<typeof transitionsFor>[0], status: number | null) => transitionsFor(kind, status).map((item) => item.id)
const pick = (kind: Parameters<typeof transitionsFor>[0], status: number, id: string) => transitionsFor(kind, status).find((item) => item.id === id)!
const registro = (status: number | null, extra: Partial<RegistroStatus> = {}): RegistroStatus => ({ id: 'r1', status, temVeiculo: true, temMotorista: true, ...extra })

/** Só nos testes: nenhuma regra atual tem campos, mas `validate` e `buildPatch` continuam genéricos. */
const comCampos: Transition = {
  id: 'teste', to: MULTA.RECURSO, label: 'Teste', set: { new_recursopendente: true },
  fields: [
    { key: 'cr40f_prazo', label: 'Prazo', type: 'date', required: true },
    { key: 'cr40f_quando', label: 'Quando', type: 'datetime', required: false },
    { key: 'cr40f_valor', label: 'Valor', type: 'money', required: false },
    { key: 'cr40f_obs', label: 'Observação', type: 'text', required: false, maxLength: 5 },
  ],
}

function fakeSource(current: number | null) {
  return {
    mode: 'mock', envLabel: 'TEST',
    ...manutencaoFalsa(),
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: vi.fn(async () => current),
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    prepareFlow: vi.fn(async () => {}),
    runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: 'ok', shareUrl: null })),
    openForm: async () => {},
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
  } satisfies DataSource
}

describe('transitionsFor', () => {
  it('manutenção não passa pelo StatusPanel: as ações dela são as Custom APIs', () => {
    for (const status of [MANUT.SOLICITADO, MANUT.AGENDADO, MANUT.PROGRAMADO, MANUT.REALIZADO]) expect(ids('manutencao', status)).toEqual([])
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
    expect(pick('multa', MULTA.NOTIFICAR, 'notificado').flow).toBe('notificarCondutor')
    expect(pick('multa', MULTA.NOTIFICADO, 'indicar').flow).toBe('gerarContrato')
    expect(pick('multa', MULTA.INDICADA, 'recurso').flow).toBeUndefined()
    expect(pick('colisao', COLISAO.ENVIADO, 'analisar').flow).toBeUndefined()
  })
})

describe('bloqueio', () => {
  it('exige motorista para notificar e gerar contrato', () => {
    expect(bloqueio(pick('multa', MULTA.NOTIFICAR, 'notificado'), registro(MULTA.NOTIFICAR, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
    expect(bloqueio(pick('multa', MULTA.NOTIFICADO, 'indicar'), registro(MULTA.NOTIFICADO, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
  })

  it('não bloqueia quando o requisito existe nem transições sem requisito', () => {
    expect(bloqueio(pick('multa', MULTA.NOTIFICAR, 'notificado'), registro(MULTA.NOTIFICAR))).toBeNull()
    expect(bloqueio(pick('colisao', COLISAO.ENVIADO, 'analisar'), registro(COLISAO.ENVIADO, { temVeiculo: false, temMotorista: false }))).toBeNull()
  })
})

describe('validate', () => {
  it('exige os campos obrigatórios', () => {
    expect(validate(comCampos, {})).toEqual({ cr40f_prazo: 'Obrigatório' })
    expect(validate(comCampos, { cr40f_prazo: '2026-10-09' })).toEqual({})
  })

  it('recusa valor negativo, data e hora inválida e texto acima do tamanho', () => {
    expect(validate(comCampos, { cr40f_prazo: '2026-10-09', cr40f_valor: '-1', cr40f_quando: '2026-13-45T10:00', cr40f_obs: 'abcdef' })).toEqual({ cr40f_valor: 'Informe um valor válido', cr40f_quando: 'Data inválida', cr40f_obs: 'Máximo de 5 caracteres' })
  })

  it('não exige campo nas transições de multa feitas por Flow', () => {
    expect(validate(pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).toEqual({})
    expect(validate(pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).toEqual({})
  })
})

describe('buildPatch', () => {
  it('grava status e campos fixos, e converte data, data e hora (São Paulo para UTC) e valor', () => {
    expect(buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09', cr40f_quando: '2026-10-02T10:00', cr40f_valor: '350.5', cr40f_obs: ' ok ' }, ctx)).toEqual({
      cr40f_status: MULTA.RECURSO, new_recursopendente: true, cr40f_prazo: '2026-10-09', cr40f_quando: '2026-10-02T13:00:00.000Z', cr40f_valor: 350.5, cr40f_obs: 'ok',
    })
  })

  it('data em coluna UserLocal vira meia-noite de São Paulo em UTC', () => {
    expect(buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09' }, { now: ctx.now, dateBehaviors: { cr40f_prazo: 'UserLocal' } })).toMatchObject({ cr40f_prazo: '2026-10-09T03:00:00Z' })
  })

  it('recurso grava o campo fixo; transições de multa por Flow não gravam nada pela tela', () => {
    expect(buildPatch('multa', pick('multa', MULTA.INDICADA, 'recurso'), {}, ctx)).toEqual({ cr40f_status: MULTA.RECURSO, new_recursopendente: true })
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICAR, 'notificado'), {}, ctx)).toEqual({})
    expect(buildPatch('multa', pick('multa', MULTA.NOTIFICADO, 'indicar'), {}, ctx)).toEqual({})
  })

  it('colisão grava no campo de status operacional', () => {
    expect(buildPatch('colisao', pick('colisao', COLISAO.ENVIADO, 'analisar'), {}, ctx)).toEqual({ cr40f_statusoperacional: COLISAO.ANALISE })
  })

  it('recusa gravar data sem o comportamento da coluna', () => {
    expect(() => buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09' }, { now: ctx.now, dateBehaviors: {} })).toThrow('Metadata de data indisponível para cr40f_prazo')
  })
})

describe('applyTransition', () => {
  beforeEach(() => liberarFlows())

  it('transição direta relê o status, grava e não chama Flow', async () => {
    const source = fakeSource(COLISAO.ENVIADO)
    const result = await applyTransition(source, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ENVIADO, 'analisar'), {})
    expect(result).toBeNull()
    expect(source.update).toHaveBeenCalledWith('colisao', 'r1', { cr40f_statusoperacional: COLISAO.ANALISE })
    expect(source.prepareFlow).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('transição com Flow resolve a URL antes e chama o Flow uma vez, sem gravar pela tela', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    const result = await applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})
    expect(source.prepareFlow).toHaveBeenCalledWith('notificarCondutor')
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'r1')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.prepareFlow.mock.invocationCallOrder[0]).toBeLessThan(source.runFlow.mock.invocationCallOrder[0])
    expect(source.update).not.toHaveBeenCalled()
    expect(result).toEqual({ message: 'ok', shareUrl: null })
  })

  it('não chama o Flow quando a URL do Flow não está disponível', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.prepareFlow.mockRejectedValueOnce(new Error('URL do Flow "Notificar condutor" não configurada (variável new_FlowUrlNotificarMotoristaMultas)'))
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('não configurada')
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('registro desatualizado: não grava, não resolve nem chama o Flow', async () => {
    const colisao = fakeSource(COLISAO.RESOLVIDO)
    await expect(applyTransition(colisao, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toBeInstanceOf(StaleError)
    expect(colisao.update).not.toHaveBeenCalled()
    const multa = fakeSource(MULTA.NOTIFICADO)
    await expect(applyTransition(multa, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toBeInstanceOf(StaleError)
    expect(multa.prepareFlow).not.toHaveBeenCalled()
    expect(multa.runFlow).not.toHaveBeenCalled()
  })

  it('não consulta nem chama nada quando falta o requisito', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR, { temMotorista: false }), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('Informe o motorista no formulário antes desta ação')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita transição que não está disponível no status atual, inclusive qualquer uma em manutenção', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICADO, 'indicar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
  })

  it('rejeita se a chamada do Flow falhar', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new Error('O Flow não respondeu'))
    await expect(applyTransition(source, 'multa', registro(MULTA.NOTIFICAR), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})).rejects.toThrow('O Flow não respondeu')
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})

describe('Flow já em andamento', () => {
  const MENSAGEM = 'Já há uma ação em andamento para este registro. Aguarde e recarregue a tela'
  const notificar = (source: DataSource, id = 'r1') => applyTransition(source, 'multa', registro(MULTA.NOTIFICAR, { id }), pick('multa', MULTA.NOTIFICAR, 'notificado'), {})

  beforeEach(() => liberarFlows())

  it('duas chamadas sobrepostas para o mesmo registro disparam o Flow uma única vez', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = notificar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    terminar({ message: 'ok', shareUrl: null })
    await expect(primeira).resolves.toEqual({ message: 'ok', shareUrl: null })
  })

  it('depois do sucesso o registro pode ser tentado de novo', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    await notificar(source)
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('resultado incerto mantém o bloqueio até liberarFlows()', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('O Flow "Notificar condutor" não respondeu em 30 s. Confira o registro antes de tentar de novo'))
    await expect(notificar(source)).rejects.toBeInstanceOf(FlowIncertoError)
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    liberarFlows()
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('erro definitivo libera o registro na hora', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new Error('O Flow "Notificar condutor" respondeu 500. Confira o registro antes de tentar de novo'))
    await expect(notificar(source)).rejects.toThrow('respondeu 500')
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('outro registro não é bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.runFlow.mockRejectedValueOnce(new FlowIncertoError('timeout'))
    await expect(notificar(source, 'r1')).rejects.toBeInstanceOf(FlowIncertoError)
    await notificar(source, 'r2')
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('duas chamadas no mesmo instante, com currentStatus lento, disparam o Flow uma única vez', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.currentStatus.mockImplementation(() => new Promise<number | null>((resolve) => { setTimeout(() => resolve(MULTA.NOTIFICAR), 10) }))
    const resultados = await Promise.allSettled([notificar(source), notificar(source)])
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(resultados.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    const recusada = resultados.find((item) => item.status === 'rejected') as PromiseRejectedResult
    expect((recusada.reason as Error).message).toBe(MENSAGEM)
  })

  it('liberarFlows() não libera uma chamada que ainda está em execução', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    let terminar: (value: FlowResult) => void = () => {}
    source.runFlow.mockImplementationOnce(() => new Promise<FlowResult>((resolve) => { terminar = resolve }))
    const primeira = notificar(source)
    await vi.waitFor(() => expect(source.runFlow).toHaveBeenCalledTimes(1))
    liberarFlows()
    await expect(notificar(source)).rejects.toThrow(MENSAGEM)
    terminar({ message: null, shareUrl: null })
    await primeira
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(2)
  })

  it('registro desatualizado não deixa o registro bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.currentStatus.mockResolvedValueOnce(MULTA.NOTIFICADO)
    await expect(notificar(source)).rejects.toBeInstanceOf(StaleError)
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })

  it('falha antes do Flow (prepareFlow) não deixa o registro bloqueado', async () => {
    const source = fakeSource(MULTA.NOTIFICAR)
    source.prepareFlow.mockRejectedValueOnce(new Error('sem permissão'))
    await expect(notificar(source)).rejects.toThrow('sem permissão')
    await notificar(source)
    expect(source.runFlow).toHaveBeenCalledTimes(1)
  })
})

describe('ações da manutenção (Custom APIs)', () => {
  const alvo = (status: number | null) => ({ id: 'm1', status })
  const fonte = (atual: number | null) => ({ currentStatus: vi.fn(async (_kind: string, _id: string) => atual) })

  it('oferece as ações do ciclo novo por status', () => {
    expect(acoesManutencao(MANUT.SOLICITADO)).toEqual(['encaixar', 'reprovar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.AGENDADO)).toEqual(['encaixar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.PROGRAMADO)).toEqual(['encaixar', 'cancelar', 'concluir'])
    for (const status of [MANUT.REALIZADO, MANUT.REPROVADO, MANUT.CANCELADO, null]) expect(acoesManutencao(status)).toEqual([])
  })

  it('encaixar vira Reagendar depois do encaixe', () => {
    expect(rotuloAcao('encaixar', MANUT.SOLICITADO)).toBe('Encaixar')
    expect(rotuloAcao('encaixar', MANUT.PROGRAMADO)).toBe('Reagendar')
    expect(rotuloAcao('cancelar', MANUT.AGENDADO)).toBe('Cancelar manutenção')
    expect(rotuloAcao('concluir', MANUT.AGENDADO)).toBe('Concluir')
  })

  it('relê o status e só então executa', async () => {
    const source = fonte(MANUT.SOLICITADO)
    const executar = vi.fn(async () => 'feito')
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', executar)).resolves.toBe('feito')
    expect(source.currentStatus).toHaveBeenCalledWith('manutencao', 'm1')
    expect(source.currentStatus.mock.invocationCallOrder[0]).toBeLessThan(executar.mock.invocationCallOrder[0])
  })

  it('outra pessoa mudou o status: StaleError e nada é executado', async () => {
    const source = fonte(MANUT.CANCELADO)
    const executar = vi.fn(async () => undefined)
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'reprovar', executar)).rejects.toBeInstanceOf(StaleError)
    expect(executar).not.toHaveBeenCalled()
  })

  it('ação fora do status é recusada antes de ler o servidor', async () => {
    const source = fonte(MANUT.AGENDADO)
    await expect(executarAcaoManutencao(source, alvo(MANUT.AGENDADO), 'reprovar', async () => undefined)).rejects.toThrow('Esta ação não está disponível para o status atual da manutenção')
    expect(source.currentStatus).not.toHaveBeenCalled()
  })

  it('uma ação por vez na mesma manutenção; falha libera a vez', async () => {
    const source = fonte(MANUT.SOLICITADO)
    let terminar: () => void = () => {}
    const longa = vi.fn(() => new Promise<void>((resolve) => { terminar = resolve }))
    const primeira = executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', longa)
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'cancelar', async () => undefined)).rejects.toThrow('Já há uma ação em andamento para esta manutenção. Aguarde')
    await vi.waitFor(() => expect(longa).toHaveBeenCalledTimes(1))
    terminar()
    await primeira
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', async () => { throw new Error('falhou') })).rejects.toThrow('falhou')
    await expect(executarAcaoManutencao(source, alvo(MANUT.SOLICITADO), 'encaixar', async () => 'de novo')).resolves.toBe('de novo')
  })
})

describe('desfechoDaAcao (um só lugar para o que as gavetas fazem com o resultado)', () => {
  it('feito devolve o valor; StaleError vira desatualizada; outro erro vira falha com a mensagem do servidor', async () => {
    expect(await desfechoDaAcao(async () => 'ok')).toEqual({ tipo: 'feito', valor: 'ok' })
    expect(await desfechoDaAcao(async () => { throw new StaleError() })).toEqual({ tipo: 'desatualizada' })
    expect(await desfechoDaAcao(async () => { throw new Error('A janela precisa ser um dia ou uma semana de segunda a domingo.') })).toEqual({ tipo: 'falha', mensagem: 'A janela precisa ser um dia ou uma semana de segunda a domingo.' })
  })
})
