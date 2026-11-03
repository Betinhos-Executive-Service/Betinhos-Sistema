import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import {
  buildBind, buildClonePayload, buildLifecyclePayload, buildLocationPayload, buildPassengerLinkPayload, buildRegisterSwapRequest,
  buildSwapFailure, buildUpdateSwapPayload, changeDriverPayload, cleanId, customApiPath, extractDataverseErrorMessage,
  fnv1a, swapIdempotencyKey, userErrorMessage, windowParameters, WINDOW_MODE_BETWEEN, WINDOW_MODE_FIXED, SERVICE_STATUS_CONFIRMED,
} from './payloads'
import type { ScheduleSwapInput, Service } from './types'

describe('ids e vínculos', () => {
  it('cleanId tira chaves sem mudar maiúsculas', () => {
    expect(cleanId('{ABC-def}')).toBe('ABC-def')
    expect(cleanId(undefined as unknown as string)).toBe('')
  })
  it('buildBind monta o caminho do entity set', () => {
    expect(buildBind('contas', '{X1}')).toBe('/contas(X1)')
  })
  it('changeDriverPayload define ou retira o motorista', () => {
    const nav = CONFIG.nav.motorista[0]
    expect(changeDriverPayload('{M1}')).toEqual({ [`${nav}@odata.bind`]: `/${CONFIG.entitySets.funcionario}(M1)` })
    expect(changeDriverPayload(null)).toEqual({ [nav]: null })
  })
})

describe('buildClonePayload', () => {
  const original = {
    tipoServicoValue: 1, tipoVeiculoValue: 2, destino: 'GRU', enderecoSaida: 'Rua A', paxView: 'Ana', trajeto: 'T', perfilPassageiro: 'VIP',
    email: 'a@x.com', formaPagamentoValue: 3, cotacao: 99, cr: 'CR1', receberValue: null, clienteId: '{C1}', solicitanteId: null,
  } as unknown as Service

  it('nasce Confirmada, copia campos e liga cliente e motorista, sem solicitante vazio nem receber nulo', () => {
    const f = CONFIG.fields.reserva
    const payload = buildClonePayload({ originalId: 's', original, dataSaida: new Date('2026-10-05T12:00:00Z'), driverId: 'M9', obsOperacao: 'op', obsInterna: 'int', passengerLinks: [] })
    expect(payload[f.statusOperacao]).toBe(SERVICE_STATUS_CONFIRMED)
    expect(payload[f.dataSaida]).toBe('2026-10-05T12:00:00.000Z')
    expect(payload[f.cotacao]).toBe(99)
    expect(payload[`${CONFIG.nav.cliente[0]}@odata.bind`]).toBe(`/${CONFIG.entitySets.cliente}(C1)`)
    expect(payload[`${CONFIG.nav.motorista[0]}@odata.bind`]).toBe(`/${CONFIG.entitySets.funcionario}(M9)`)
    expect(payload).not.toHaveProperty(`${CONFIG.nav.solicitante[0]}@odata.bind`)
    expect(payload).not.toHaveProperty(f.receber)
    expect(payload).not.toHaveProperty(f.lookupVeiculo)
  })

  it('mantém receber=false (não confunde com ausente) e omite motorista vazio', () => {
    const payload = buildClonePayload({ originalId: 's', original: { ...original, receberValue: false }, dataSaida: new Date(0), driverId: '', obsOperacao: '', obsInterna: '', passengerLinks: [] })
    expect(payload[CONFIG.fields.reserva.receber]).toBe(false)
    expect(payload).not.toHaveProperty(`${CONFIG.nav.motorista[0]}@odata.bind`)
  })

  it('vínculo de passageiro leva ordem e os dois binds', () => {
    const payload = buildPassengerLinkPayload('{S1}', { order: 2, passengerId: 'P1' })
    expect(payload[CONFIG.fields.servicoPassageiro.ordem]).toBe(2)
    expect(payload[`${CONFIG.nav.servicoGeral[0]}@odata.bind`]).toBe(`/${CONFIG.entitySets.reserva}(S1)`)
    expect(payload[`${CONFIG.nav.servicoPassageiro[0]}@odata.bind`]).toBe(`/${CONFIG.entitySets.bancoDados}(P1)`)
  })
})

describe('buildLocationPayload', () => {
  it('apara e omite endereço e mapa em branco', () => {
    expect(buildLocationPayload({ name: '  Base  ', address: '  ', mapUrl: '' })).toEqual({ [CONFIG.fields.localBase.nome]: 'Base' })
    const full = buildLocationPayload({ name: 'B', address: ' R ', mapUrl: ' http://m ' })
    expect(full[CONFIG.fields.localBase.endereco]).toBe('R')
    expect(full[CONFIG.fields.localBase.linkMapa]).toBe('http://m')
  })
})

describe('windowParameters', () => {
  it('modo fixo ignora âncoras', () => {
    expect(windowParameters({ driver1AfterId: 'a' })).toEqual({ new_ModoJanela: WINDOW_MODE_FIXED })
  })
  it('modo entre serviços envia só as âncoras preenchidas, como referência', () => {
    const params = windowParameters({ windowMode: 'between', driver1AfterId: '{A}', driver2BeforeId: 'B' })
    expect(params.new_ModoJanela).toBe(WINDOW_MODE_BETWEEN)
    expect(params.new_M1DepoisDe).toEqual({ '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_reservadeveculos', cr40f_reservadeveculosid: 'A' })
    expect(params.new_M2AntesDe).toMatchObject({ cr40f_reservadeveculosid: 'B' })
    expect(params).not.toHaveProperty('new_M1AntesDe')
  })
  it('local em branco só limpa o campo quando pedido', () => {
    expect(windowParameters({ location: '  ' })).not.toHaveProperty('new_Local')
    expect(windowParameters({ location: '  ' }, true).new_Local).toBe('')
    expect(windowParameters({ location: ' Base ' }).new_Local).toBe('Base')
  })
})

describe('troca de carro', () => {
  const input = (over: Partial<ScheduleSwapInput> = {}): ScheduleSwapInput => ({
    preview: { driver1Id: 'D1', driver2Id: '', vehicle1Id: 'V1', vehicle2Id: '', locationId: '' } as ScheduleSwapInput['preview'],
    start: new Date('2026-10-05T10:00:00Z'), end: new Date('2026-10-05T11:00:00Z'), typeValue: 7, obs: ' ', summary: '',
    programAutomatically: true, effectiveAt: null, ...over,
  })

  it('chave de idempotência é estável e muda com qualquer campo relevante', () => {
    expect(swapIdempotencyKey(input())).toBe(swapIdempotencyKey(input()))
    expect(swapIdempotencyKey(input())).toMatch(/^exchange-[0-9a-f]+-[0-9a-z]+$/)
    expect(swapIdempotencyKey(input({ typeValue: 8 }))).not.toBe(swapIdempotencyKey(input()))
    expect(swapIdempotencyKey(input({ obs: 'x' }))).not.toBe(swapIdempotencyKey(input()))
  })

  it('fnv1a da string vazia é a semente', () => {
    expect(fnv1a('')).toBe((2166136261).toString(16))
  })

  it('registro: motivo padrão, sem parâmetros opcionais vazios', () => {
    const req = buildRegisterSwapRequest(input())
    expect(req.new_Motivo).toBe('Registro operacional da troca.')
    expect(req.new_ConcluirImediatamente).toBe(false)
    expect(req).not.toHaveProperty('new_Motorista2')
    expect(req).not.toHaveProperty('new_Veiculo2')
    expect(req).not.toHaveProperty('new_LocalDeBase')
    expect(req).not.toHaveProperty('new_DataEfetiva')
    expect(req.new_Motorista1).toEqual({ '@odata.type': 'Microsoft.Dynamics.CRM.cr40f_funcionarios', cr40f_funcionariosid: 'D1' })
    expect(req.new_Inicio).toBe('2026-10-05T10:00:00.000Z')
  })

  it('registro com data efetiva conclui imediatamente', () => {
    const req = buildRegisterSwapRequest(input({ effectiveAt: new Date('2026-10-05T10:30:00Z'), obs: ' motivo ' }))
    expect(req.new_ConcluirImediatamente).toBe(true)
    expect(req.new_DataEfetiva).toBe('2026-10-05T10:30:00.000Z')
    expect(req.new_Motivo).toBe('motivo')
  })

  it('atualização só inclui parâmetros de janela quando há modo', () => {
    const base = { id: 't', rowVersion: '9', start: new Date(0), end: new Date(1000), obs: '' }
    const sem = buildUpdateSwapPayload(base)
    expect(sem.new_Motivo).toBe('Atualização operacional da troca.')
    expect(sem.new_VersaoEsperada).toBe('9')
    expect(sem).not.toHaveProperty('new_ModoJanela')
    expect(buildUpdateSwapPayload({ ...base, windowMode: 'fixed' })).toMatchObject({ new_ModoJanela: WINDOW_MODE_FIXED, new_Local: '' })
  })

  it('cancelar/reverter: data efetiva só quando informada', () => {
    expect(buildLifecyclePayload('x')).toEqual({ new_Motivo: 'x', new_VersaoEsperada: '' })
    expect(buildLifecyclePayload('x', 'v', new Date(0))).toEqual({ new_Motivo: 'x', new_VersaoEsperada: 'v', new_DataEfetiva: '1970-01-01T00:00:00.000Z' })
  })

  it('customApiPath: unbound ou bound na troca', () => {
    expect(customApiPath('new_X')).toBe('new_X')
    expect(customApiPath('new_X', '{T1}')).toBe(`${CONFIG.entitySets.trocaCarro}(T1)/Microsoft.Dynamics.CRM.new_X`)
  })
})

describe('mensagens de erro', () => {
  it('extractDataverseErrorMessage procura em chaves e aninhados', () => {
    expect(extractDataverseErrorMessage('  oi ')).toBe('oi')
    expect(extractDataverseErrorMessage(new Error(' falhou '))).toBe('falhou')
    expect(extractDataverseErrorMessage({ error: { message: 'aninhado' } })).toBe('aninhado')
    expect(extractDataverseErrorMessage({ detail: 'd' })).toBe('d')
    expect(extractDataverseErrorMessage({ _responseText: JSON.stringify({ error: { message: 'do corpo' } }) })).toBe('do corpo')
    expect(extractDataverseErrorMessage({ _responseText: 'não é json' })).toBe('')
    expect(extractDataverseErrorMessage(null)).toBe('')
    expect(extractDataverseErrorMessage(42)).toBe('')
  })

  it('não entra em laço com objetos circulares', () => {
    const a: Record<string, unknown> = {}
    a.error = a
    expect(extractDataverseErrorMessage(a)).toBe('')
  })

  it('buildSwapFailure guarda a causa e o payload', () => {
    const payload = { a: 1 }
    const err = buildSwapFailure({ message: 'boom' }, payload) as Error & { swapPayload: unknown }
    expect(err.message).toBe('Falha ao registrar a troca no Dataverse: boom')
    expect(err.swapPayload).toBe(payload)
    expect(buildSwapFailure({}, payload).message).toBe('Falha ao registrar a troca no Dataverse.')
  })

  it('userErrorMessage usa fallback quando nada é útil', () => {
    expect(userErrorMessage(' x ', 'fb')).toBe('x')
    expect(userErrorMessage(new Error(''), 'fb')).toBe('fb')
    expect(userErrorMessage({ error: { message: 'm' } }, 'fb')).toBe('m')
    expect(userErrorMessage(undefined, 'fb')).toBe('fb')
  })
})
