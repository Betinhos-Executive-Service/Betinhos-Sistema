import { describe, expect, it } from 'vitest'
import { CONFIG } from './config'
import {
  applyDriverDisplayLabels, normalizeDriver, normalizeEmail, normalizePassengerLink, normalizePossession,
  normalizeService, normalizeSwap, normalizeVehicle, valueBoolean, valueNumber, valueString,
} from './normalizers'

const FV = '@OData.Community.Display.V1.FormattedValue'

describe('valores primitivos', () => {
  it('valueString converte nulos em texto vazio', () => {
    expect(valueString(null)).toBe('')
    expect(valueString(undefined)).toBe('')
    expect(valueString(0)).toBe('0')
    expect(valueString(false)).toBe('false')
  })

  it('valueNumber devolve null para vazio ou não numérico', () => {
    expect(valueNumber(null)).toBeNull()
    expect(valueNumber('')).toBeNull()
    expect(valueNumber('abc')).toBeNull()
    expect(valueNumber(Infinity)).toBeNull()
    expect(valueNumber('202410001')).toBe(202410001)
    expect(valueNumber(0)).toBe(0)
  })

  it('valueBoolean aceita booleano, número e textos sim/não', () => {
    expect(valueBoolean(true)).toBe(true)
    expect(valueBoolean(0)).toBe(false)
    expect(valueBoolean(2)).toBe(true)
    expect(valueBoolean(' SIM ')).toBe(true)
    expect(valueBoolean('Não')).toBe(false)
    expect(valueBoolean('nao')).toBe(false)
    expect(valueBoolean('talvez')).toBeNull()
    expect(valueBoolean('   ')).toBeNull()
    expect(valueBoolean('')).toBeNull()
    expect(valueBoolean(undefined)).toBeNull()
  })

  it('normalizeEmail apara e usa minúsculas', () => {
    expect(normalizeEmail('  Ana@Betinhos.COM ')).toBe('ana@betinhos.com')
    expect(normalizeEmail(null)).toBe('')
  })
})

describe('normalizeDriver', () => {
  const f = CONFIG.fields.funcionario

  it('lê o registro cru e usa o rótulo formatado do vínculo', () => {
    const driver = normalizeDriver({
      [f.id]: 'd1', [f.nome]: 'Ana Souza', [f.apelido]: 'Ana', [f.emailMicrosoft]: 'ana@x.com',
      [f.tipoVinculo]: 1, [`${f.tipoVinculo}${FV}`]: 'Terceirizado',
    })
    expect(driver).toMatchObject({ id: 'd1', name: 'Ana Souza', nickname: 'Ana', microsoftEmail: 'ana@x.com', employmentTypeValue: 1, employmentTypeLabel: 'Terceirizado', hasActiveSystemUser: null })
  })

  it('deduz o rótulo do vínculo (0 Colaborador, 1 Terceiro) sem anotação', () => {
    expect(normalizeDriver({ [f.tipoVinculo]: 0 }).employmentTypeLabel).toBe('Colaborador')
    expect(normalizeDriver({ [f.tipoVinculo]: 1 }).employmentTypeLabel).toBe('Terceiro')
    expect(normalizeDriver({}).employmentTypeLabel).toBe('')
  })

  it('aceita o formato já normalizado (mock) e só respeita hasActiveSystemUser booleano', () => {
    expect(normalizeDriver({ id: 'm1', name: 'Mock', employmentTypeValue: 1, hasActiveSystemUser: true })).toMatchObject({ id: 'm1', name: 'Mock', employmentTypeValue: 1, hasActiveSystemUser: true })
    expect(normalizeDriver({ hasActiveSystemUser: 'true' }).hasActiveSystemUser).toBeNull()
  })
})

describe('normalizeVehicle', () => {
  const f = CONFIG.fields.veiculo

  it('monta o rótulo "modelo • placa" e converte blindado', () => {
    const v = normalizeVehicle({ [f.id]: 'v1', [f.modelo]: 'Corolla', [f.placa]: 'ABC1D23', [f.blindado]: 1, [f.propriedade]: 1 })
    expect(v).toMatchObject({ id: 'v1', label: 'Corolla • ABC1D23', armored: true, ownershipValue: 1, rentalEnd: null })
  })

  it('usa fallbacks quando faltam modelo e placa', () => {
    expect(normalizeVehicle({}).label).toBe('Veículo • —')
    expect(normalizeVehicle({}).armored).toBe(false)
  })

  it('prefere a anotação formatada para a propriedade e cai no config', () => {
    expect(normalizeVehicle({ [f.propriedade]: 5, [`${f.propriedade}${FV}`]: 'Locado' }).ownershipLabel).toBe('Locado')
    const value = Number(Object.keys(CONFIG.choices.propriedadeVeiculo)[0])
    expect(normalizeVehicle({ [f.propriedade]: value }).ownershipLabel).toBe(CONFIG.choices.propriedadeVeiculo[value])
  })

  it('mantém o rótulo explícito do mock', () => {
    expect(normalizeVehicle({ id: 'x', label: 'Meu carro', model: 'Y', plate: 'Z' }).label).toBe('Meu carro')
  })
})

describe('normalizeService', () => {
  const f = CONFIG.fields.reserva
  const statusValue = Number(Object.keys(CONFIG.choices.statusOperacao).find((k) => CONFIG.choices.statusOperacao[Number(k)] === 'Confirmado'))

  it('converte o registro cru, com rótulos do config e lookups nulos quando vazios', () => {
    const s = normalizeService({
      [f.id]: 's1', [f.readableId]: 'R-1', [f.dataSaida]: '2026-10-01T10:00:00Z', [f.statusOperacao]: statusValue,
      [f.lookupMotorista]: 'm1', [`${f.lookupMotorista}${FV}`]: 'Ana', [f.cotacao]: 150.5, [f.receber]: true,
    })
    expect(s).toMatchObject({
      id: 's1', readableId: 'R-1', statusValue, statusLabel: 'Confirmado', motoristaId: 'm1', motoristaLabel: 'Ana',
      clienteId: null, veiculoId: null, previsaoRetorno: null, cotacao: 150.5, receberValue: true,
    })
  })

  it('status zerado ou ausente vira null, com rótulo vazio', () => {
    const s = normalizeService({ [f.statusOperacao]: 0 })
    expect(s.statusValue).toBeNull()
    expect(s.statusLabel).toBe('')
    expect(normalizeService({}).cotacao).toBe(0)
    expect(normalizeService({}).receberValue).toBeNull()
  })

  it('aceita o formato já normalizado', () => {
    const s = normalizeService({ id: 'x', statusValue, motoristaId: 'm', motoristaLabel: 'Bia', cotacao: 10 })
    expect(s).toMatchObject({ id: 'x', statusValue, motoristaId: 'm', motoristaLabel: 'Bia', cotacao: 10 })
  })
})

describe('applyDriverDisplayLabels', () => {
  const drivers = [
    { id: 'a', name: 'Ana Souza', nickname: 'Ana' },
    { id: 'b', name: 'Bruno Lima', nickname: '' },
  ] as Parameters<typeof applyDriverDisplayLabels>[1]

  it('troca o rótulo pelo apelido ou nome e mantém itens sem motorista', () => {
    const out = applyDriverDisplayLabels([
      { motoristaId: 'a', motoristaLabel: 'x' },
      { motoristaId: 'b', motoristaLabel: 'y' },
      { motoristaId: 'z', motoristaLabel: 'orig' },
      { motoristaId: null, motoristaLabel: 'sem' },
    ], drivers)
    expect(out.map((i) => i.motoristaLabel)).toEqual(['Ana', 'Bruno Lima', 'orig', 'sem'])
  })

  it('não altera os objetos originais', () => {
    const item = { motoristaId: 'a', motoristaLabel: 'x' }
    applyDriverDisplayLabels([item], drivers)
    expect(item.motoristaLabel).toBe('x')
  })
})

describe('normalizePassengerLink / normalizeSwap / normalizePossession', () => {
  it('vínculo de passageiro usa ordem numérica', () => {
    const f = CONFIG.fields.servicoPassageiro
    expect(normalizePassengerLink({ [f.id]: 'l1', [f.lookupGeral]: 's1', [f.lookupPassageiro]: 'p1', [f.ordem]: 2 })).toMatchObject({ id: 'l1', serviceId: 's1', passengerId: 'p1', order: 2 })
    expect(normalizePassengerLink({}).order).toBe(0)
  })

  it('troca: tira o prefixo W/"..." do etag e deixa lookups vazios nulos', () => {
    const swap = normalizeSwap({ id: 't1', '@odata.etag': 'W/"123456"' })
    expect(swap.rowVersion).toBe('123456')
    expect(swap).toMatchObject({ driver1Id: null, vehicle2Id: null, locationId: null, typeValue: null, windowModeValue: null })
  })

  it('troca: rótulo de status vem da anotação ou do config', () => {
    const f = CONFIG.fields.trocaCarro
    expect(normalizeSwap({ [f.status]: 202410000 }).statusLabel).toBe(CONFIG.choices.statusTroca[202410000])
    expect(normalizeSwap({ [f.status]: 202410000, [`${f.status}${FV}`]: 'Anotado' }).statusLabel).toBe('Anotado')
  })

  it('posse aberta tem fim nulo', () => {
    const f = CONFIG.fields.posseVeiculo
    expect(normalizePossession({ [f.id]: 'p1', [f.inicio]: '2026-01-01T00:00:00Z' })).toMatchObject({ id: 'p1', end: null, driverId: null, vehicleId: null })
  })
})
