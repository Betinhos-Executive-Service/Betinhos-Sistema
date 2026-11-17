// apps/shell/src/pages/frota/domain/transitions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MANUT, MULTA } from '../data/schema'
import type { DataSource, FlowResult } from '../data/source'
import { EMPTY_DATA } from '../data/source'
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
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], passoMulta: async () => { throw new Error('não usado neste teste') }, dossieMulta: async () => { throw new Error('não usado neste teste') }, enviarArquivoMulta: async () => {}, urlArquivoMulta: () => 'about:blank', enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
  } satisfies DataSource
}

describe('transitionsFor', () => {
  it('manutenção não passa pelo StatusPanel: as ações dela são as Custom APIs', () => {
    for (const status of [MANUT.SOLICITADO, MANUT.AGENDADO, MANUT.PROGRAMADO, MANUT.REALIZADO]) expect(ids('manutencao', status)).toEqual([])
    expect(ids('manutencao', null)).toEqual([])
  })

  it('multa não tem transição de status: o passo a passo grava pela cr40f_PassoMulta', () => {
    for (const status of Object.values(MULTA)) expect(ids('multa', status)).toEqual([])
  })

  it('lista só as transições permitidas de colisão', () => {
    expect(ids('colisao', COLISAO.ENVIADO)).toEqual(['analisar', 'cancelar'])
    expect(ids('colisao', COLISAO.ANALISE)).toEqual(['resolver', 'cancelar'])
    expect(ids('colisao', COLISAO.RESOLVIDO)).toEqual([])
  })

  it('nenhuma transição chama Flow: a multa anda pelo passo a passo e a manutenção pelas Custom APIs', () => {
    for (const kind of ['manutencao', 'multa', 'colisao'] as const) {
      for (const status of [...Object.values(MANUT), ...Object.values(MULTA), ...Object.values(COLISAO)]) {
        for (const transition of transitionsFor(kind, status)) expect(transition.flow).toBeUndefined()
      }
    }
  })
})

describe('bloqueio', () => {
  it('exige veículo e motorista quando a transição declara o requisito', () => {
    const base: Transition = { id: 'teste', to: COLISAO.ANALISE, label: 'Teste', fields: [] }
    expect(bloqueio({ ...base, requires: 'veiculo' }, registro(COLISAO.ENVIADO, { temVeiculo: false }))).toBe('Informe o veículo no formulário antes desta ação')
    expect(bloqueio({ ...base, requires: 'motorista' }, registro(COLISAO.ENVIADO, { temMotorista: false }))).toBe('Informe o motorista no formulário antes desta ação')
  })

  it('não bloqueia quando o requisito existe nem transições sem requisito', () => {
    expect(bloqueio({ id: 'teste', to: COLISAO.ANALISE, label: 'Teste', fields: [], requires: 'motorista' }, registro(COLISAO.ENVIADO))).toBeNull()
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

  it('data em coluna UserLocal vira meia-noite de São Paulo em UTC', () => {
    expect(buildPatch('multa', comCampos, { cr40f_prazo: '2026-10-09' }, { now: ctx.now, dateBehaviors: { cr40f_prazo: 'UserLocal' } })).toMatchObject({ cr40f_prazo: '2026-10-09T03:00:00Z' })
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

  it('registro desatualizado: não grava, não resolve nem chama o Flow', async () => {
    const colisao = fakeSource(COLISAO.RESOLVIDO)
    await expect(applyTransition(colisao, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toBeInstanceOf(StaleError)
    expect(colisao.update).not.toHaveBeenCalled()
    expect(colisao.prepareFlow).not.toHaveBeenCalled()
    expect(colisao.runFlow).not.toHaveBeenCalled()
  })

  it('rejeita transição que não está disponível no status atual, inclusive qualquer uma em manutenção', async () => {
    const source = fakeSource(COLISAO.ENVIADO)
    await expect(applyTransition(source, 'colisao', registro(COLISAO.ENVIADO), pick('colisao', COLISAO.ANALISE, 'resolver'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    await expect(applyTransition(source, 'manutencao', registro(MANUT.SOLICITADO), pick('colisao', COLISAO.ENVIADO, 'cancelar'), {})).rejects.toThrow('Esta ação não está disponível para o status atual do registro')
    expect(source.currentStatus).not.toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
  })

})

describe('ações da manutenção (Custom APIs)', () => {
  const alvo = (status: number | null) => ({ id: 'm1', status })
  const fonte = (atual: number | null) => ({ currentStatus: vi.fn(async (_kind: string, _id: string) => atual) })

  it('oferece as ações do ciclo novo por status', () => {
    expect(acoesManutencao(MANUT.SOLICITADO)).toEqual(['encaixar', 'reprovar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.AGENDADO)).toEqual(['encaixar', 'programar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.PROGRAMADO)).toEqual(['encaixar', 'cancelar', 'concluir'])
    for (const status of [MANUT.REALIZADO, MANUT.REPROVADO, MANUT.CANCELADO, null]) expect(acoesManutencao(status)).toEqual([])
  })

  it('programar só em Agendado', () => {
    expect(acoesManutencao(MANUT.AGENDADO)).toEqual(['encaixar', 'programar', 'cancelar', 'concluir'])
    expect(acoesManutencao(MANUT.PROGRAMADO)).not.toContain('programar')
    expect(acoesManutencao(MANUT.SOLICITADO)).not.toContain('programar')
    expect(rotuloAcao('programar', MANUT.AGENDADO)).toBe('Programar')
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
