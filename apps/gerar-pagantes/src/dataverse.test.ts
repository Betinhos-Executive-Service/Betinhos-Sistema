// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubmitRequest, SubmitResult } from './domain'

const financeiroId = '10000000-0000-0000-0000-000000000001'
const paganteId = '20000000-0000-0000-0000-000000000001'
const pagantesRecordId = '30000000-0000-0000-0000-000000000001'

const request: SubmitRequest = {
  requestId: '40000000-0000-0000-0000-000000000001',
  expectedFinanceiroVersion: '10',
  financeiroDisplayId: 'OP-123',
  totalCents: 12500,
  allowTotalMismatch: false,
  serviceStartDate: '2026-07-23',
  serviceEndDate: '2026-07-23',
  pagantes: [{
    paganteId,
    name: 'Pagante',
    email: '',
    recipientId: paganteId,
    recipientName: 'Pagante',
    recipientEmail: '',
    receiptToRecipient: false,
    amountCents: 12500,
    paymentMethod: 202410000,
    generateLink: false,
    sendEmail: false
  }]
}

afterEach(() => {
  delete window.Xrm
  vi.restoreAllMocks()
})

describe('submitOperation', () => {
  it('normaliza e-mail vazio e delega toda a gravação para a Custom API', async () => {
    const result: SubmitResult = {
      success: true,
      requestId: request.requestId,
      financeiroId,
      totalCents: request.totalCents,
      results: [{ paganteId, pagantesRecordId, linkStatus: 'NotApplicable', emailStatus: 'NotApplicable' }],
      errors: []
    }
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ cr40f_ResponseJson: JSON.stringify(result) })
    })
    const createRecord = vi.fn()
    const updateRecord = vi.fn()
    const deleteRecord = vi.fn()
    const retrieveMultipleRecords = vi.fn()
      .mockResolvedValueOnce({ entities: [{ cr40f_reservadeveculosid: '50000000-0000-0000-0000-000000000001' }] })
      .mockResolvedValueOnce({ entities: [{ new_valortotal: 125 }] })
    window.Xrm = {
      WebApi: {
        retrieveRecord: vi.fn().mockResolvedValue({ versionnumber: '10', statecode: 0, statuscode: 1 }),
        retrieveMultipleRecords,
        createRecord,
        updateRecord,
        deleteRecord,
        online: { execute }
      }
    }
    const { submitOperation } = await import('./dataverse')

    await expect(submitOperation(financeiroId, request)).resolves.toEqual(result)
    expect(execute).toHaveBeenCalledOnce()
    expect(window.Xrm?.WebApi.retrieveRecord).not.toHaveBeenCalled()
    expect(retrieveMultipleRecords).not.toHaveBeenCalled()
    expect(createRecord).not.toHaveBeenCalled()
    expect(updateRecord).not.toHaveBeenCalled()
    expect(deleteRecord).not.toHaveBeenCalled()
    const apiRequest = execute.mock.calls[0][0]
    const expectedRequest = {
      ...request,
      pagantes: [{ ...request.pagantes[0], email: null }]
    }
    expect(apiRequest).toMatchObject({
      entity: { entityType: 'cr40f_financeiro', id: financeiroId },
      cr40f_RequestJson: JSON.stringify(expectedRequest)
    })
    expect(apiRequest.Target).toBeUndefined()
    expect(apiRequest.getMetadata()).toEqual(expect.objectContaining({
      boundParameter: 'entity',
      operationName: 'cr40f_GerarPagantes'
    }))
  })
})

describe('searchDirectoryPeople', () => {
  it('consulta o Dataverse por nome ou e-mail sem carregar o diretório inteiro', async () => {
    const retrieveMultipleRecords = vi.fn().mockResolvedValue({
      entities: [{
        cr40f_bancodedadosid: paganteId,
        cr40f_nomedopassageiro: 'Pessoa Encontrada',
        cr40f_email: 'pessoa@example.com',
        cr40f_telefone: '11999999999'
      }],
      nextLink: 'next-page'
    })
    window.Xrm = {
      WebApi: {
        retrieveRecord: vi.fn(),
        retrieveMultipleRecords,
        createRecord: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn()
      }
    }
    const { searchDirectoryPeople } = await import('./dataverse')

    await expect(searchDirectoryPeople('Pessoa')).resolves.toEqual({
      people: [{ id: paganteId, name: 'Pessoa Encontrada', email: 'pessoa@example.com', phone: '11999999999', role: 'Adicionado' }],
      nextLink: 'next-page'
    })
    expect(retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_bancodedados', expect.stringContaining("contains(cr40f_nomedopassageiro,'Pessoa')"))
    expect(retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_bancodedados', expect.stringContaining("contains(cr40f_email,'Pessoa')"))
    expect(retrieveMultipleRecords).toHaveBeenCalledWith('cr40f_bancodedados', expect.stringContaining('$top=20'))
    expect(retrieveMultipleRecords.mock.calls[0][1]).not.toContain('statecode')
    await searchDirectoryPeople('Pessoa', 'next-page')
    expect(retrieveMultipleRecords).toHaveBeenLastCalledWith('cr40f_bancodedados', 'next-page')
  })
})

describe('loadOperation', () => {
  it('carrega somente pessoas vinculadas à OP em vez do cadastro inteiro', async () => {
    const serviceId = '50000000-0000-0000-0000-000000000001'
    const retrieveMultipleRecords = vi.fn()
      .mockResolvedValueOnce({ entities: [{ cr40f_reservadeveculosid: serviceId, _cr40f_solicitante_value: paganteId, cr40f_dataehorriodesada: '2026-07-23T12:00:00Z' }] })
      .mockResolvedValueOnce({ entities: [{ new_valortotal: 125 }] })
      .mockResolvedValueOnce({ entities: [] })
      .mockResolvedValueOnce({ entities: [] })
      .mockResolvedValueOnce({ entities: [{ cr40f_bancodedadosid: paganteId, cr40f_nomedopassageiro: 'Pagante', cr40f_email: 'pagante@example.com', cr40f_telefone: '' }] })
    window.Xrm = {
      WebApi: {
        retrieveRecord: vi.fn().mockResolvedValue({ cr40f_idfinanceiro: 'OP-123', versionnumber: '10', statecode: 0, statuscode: 1 }),
        retrieveMultipleRecords,
        createRecord: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn()
      }
    }
    const { loadOperation } = await import('./dataverse')

    const operation = await loadOperation(financeiroId)
    expect(retrieveMultipleRecords.mock.calls[0][0]).toMatch(/^cr40f_reserva/)
    expect(retrieveMultipleRecords.mock.calls[1][0]).toBe('cr40f_composicaodeprecos')
    expect(operation.people).toHaveLength(1)
    const directoryCall = retrieveMultipleRecords.mock.calls.find(([entity]) => entity === 'cr40f_bancodedados')
    expect(directoryCall?.[1]).toContain(`cr40f_bancodedadosid eq ${paganteId}`)
    expect(directoryCall?.[1]).toContain('statecode eq 0')
  })
})

describe('updatePersonEmail', () => {
  it('grava o e-mail aparado no cadastro e devolve o valor persistido', async () => {
    const updateRecord = vi.fn().mockResolvedValue(undefined)
    const retrieveRecord = vi.fn().mockResolvedValue({ cr40f_email: 'ana.silva@empresa.com.br' })
    window.Xrm = { WebApi: { updateRecord, retrieveRecord, retrieveMultipleRecords: vi.fn(), createRecord: vi.fn(), deleteRecord: vi.fn() } }
    const { updatePersonEmail } = await import('./dataverse')
    await expect(updatePersonEmail(`{${paganteId}}`, '  ana.silva@empresa.com.br ')).resolves.toBe('ana.silva@empresa.com.br')
    expect(updateRecord).toHaveBeenCalledWith('cr40f_bancodedados', paganteId, { cr40f_email: 'ana.silva@empresa.com.br' })
    expect(retrieveRecord).toHaveBeenCalledWith('cr40f_bancodedados', paganteId, '?$select=cr40f_email')
  })

  it('recusa e-mail inválido sem chamar o Dataverse', async () => {
    const updateRecord = vi.fn()
    window.Xrm = { WebApi: { updateRecord, retrieveRecord: vi.fn(), retrieveMultipleRecords: vi.fn(), createRecord: vi.fn(), deleteRecord: vi.fn() } }
    const { updatePersonEmail } = await import('./dataverse')
    await expect(updatePersonEmail(paganteId, 'ana.silva')).rejects.toThrow('Informe um e-mail válido.')
    expect(updateRecord).not.toHaveBeenCalled()
  })
})
