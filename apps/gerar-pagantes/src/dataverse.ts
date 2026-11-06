import { demoEditOperation, demoOperation } from './demo'
import { EMAIL_MAX_LENGTH, emailValid } from './domain'
import type { Guid, OperationData, Payer, Person, PersonSearchPage, SubmitRequest, SubmitResult } from './domain'

interface RetrieveResult { entities: Array<Record<string, unknown>>; nextLink?: string }

interface XrmApi {
  WebApi: {
    retrieveRecord: (entity: string, id: string, options?: string) => Promise<Record<string, unknown>>
    retrieveMultipleRecords: (entity: string, options?: string) => Promise<RetrieveResult>
    createRecord: (entity: string, data: Record<string, unknown>) => Promise<{ id: string }>
    updateRecord: (entity: string, id: string, data: Record<string, unknown>) => Promise<void>
    deleteRecord: (entity: string, id: string) => Promise<void>
    online?: { execute: (request: Record<string, unknown>) => Promise<{ ok?: boolean; json: () => Promise<Record<string, unknown>> }> }
  }
  Utility?: { getGlobalContext?: () => { userSettings?: { userId?: string; userName?: string } } }
}

declare global { interface Window { Xrm?: XrmApi } }

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function toLinkStatus(value: string): Payer['linkStatus'] {
  if (value === 'Pendente') return 'Pending'
  if (value === 'Concluido') return 'Generated'
  if (value === 'Erro') return 'Failed'
  return 'NotApplicable'
}

function toEmailStatus(value: string): Payer['emailStatus'] {
  if (value === 'Pendente') return 'Pending'
  if (value === 'Concluido') return 'Sent'
  if (value === 'Erro') return 'Failed'
  return 'NotApplicable'
}

function getXrm(): XrmApi | undefined {
  if (window.Xrm) return window.Xrm
  try { return window.parent !== window ? window.parent.Xrm : undefined }
  catch { return undefined }
}

function assertOperationEditable(finance: Record<string, unknown>): void {
  const stateCode = Number(finance.statecode ?? 0)
  const statusLabel = text(finance, 'statuscode@OData.Community.Display.V1.FormattedValue')
  if (stateCode === 1 || /cancel|encerr|fechad/i.test(statusLabel)) {
    throw new Error(`A OP está ${statusLabel || 'inativa'} e não pode gerar pagantes.`)
  }
}


export function normalizeGuid(value: string): Guid {
  const clean = value.replace(/[{}]/g, '').trim()
  if (!guidPattern.test(clean)) throw new Error('A OP informada não possui um GUID válido.')
  return clean
}

export function getRecordIdFromLocation(): Guid | null {
  const search = new URLSearchParams(window.location.search)
  const direct = search.get('recordId')
  const data = search.get('data')
  let candidate = direct
  if (!candidate && data) {
    try { candidate = JSON.parse(decodeURIComponent(data)).recordId as string }
    catch { throw new Error('Os dados recebidos para abrir a OP são inválidos.') }
  }
  return candidate ? normalizeGuid(candidate) : null
}

async function fetchAll(entity: string, options: string): Promise<Array<Record<string, unknown>>> {
  const api = getXrm()?.WebApi
  if (!api) return []
  const all: Array<Record<string, unknown>> = []
  let page: RetrieveResult | undefined = await api.retrieveMultipleRecords(entity, options)
  while (page) {
    all.push(...page.entities)
    page = page.nextLink ? await api.retrieveMultipleRecords(entity, page.nextLink) : undefined
  }
  return all
}

const text = (row: Record<string, unknown>, field: string) => String(row[field] ?? '')
const lookup = (row: Record<string, unknown>, field: string) => row[field] ? String(row[field]) : undefined
const moneyToCents = (value: unknown) => Math.round(Number(value ?? 0) * 100)

function toBrazilDateOnly(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function toPerson(row: Record<string, unknown>, role: Person['role']): Person {
  return {
    id: text(row, 'cr40f_bancodedadosid'),
    name: text(row, 'cr40f_nomedopassageiro'),
    email: text(row, 'cr40f_email'),
    phone: text(row, 'cr40f_telefone'),
    role
  }
}

export async function searchDirectoryPeople(query: string, nextLink?: string): Promise<PersonSearchPage> {
  const normalized = query.trim()
  if (normalized.length < 2) return { people: [] }
  const api = getXrm()?.WebApi
  if (!api) {
    const needle = normalized.toLocaleLowerCase('pt-BR')
    return {
      people: demoOperation.directory
        .filter((person) => `${person.name} ${person.email}`.toLocaleLowerCase('pt-BR').includes(needle))
        .slice(0, 20)
        .map((person) => ({ ...person, role: 'Adicionado' }))
    }
  }
  const escaped = encodeURIComponent(normalized.replace(/'/g, "''")).replace(/'/g, '%27')
  const filter = `(contains(cr40f_nomedopassageiro,'${escaped}') or contains(cr40f_email,'${escaped}'))`
  const options = nextLink ?? `?$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_email,cr40f_telefone&$filter=${filter}&$orderby=cr40f_nomedopassageiro asc&$top=20`
  const page = await api.retrieveMultipleRecords('cr40f_bancodedados', options)
  return { people: page.entities.map((row) => toPerson(row, 'Adicionado')), nextLink: page.nextLink }
}

export async function updatePersonEmail(personId: Guid, email: string): Promise<string> {
  const value = email.trim()
  if (!emailValid(value) || value.length > EMAIL_MAX_LENGTH) throw new Error('Informe um e-mail válido.')
  const id = normalizeGuid(personId)
  const api = getXrm()?.WebApi
  if (!api) return value
  await api.updateRecord('cr40f_bancodedados', id, { cr40f_email: value })
  const saved = await api.retrieveRecord('cr40f_bancodedados', id, '?$select=cr40f_email')
  return text(saved, 'cr40f_email').trim()
}

function toPayer(row: Record<string, unknown>, people: Map<Guid, Person>): Payer | null {
  const personId = lookup(row, '_cr40f_bancodedados_value')
  const person = personId ? people.get(personId) : undefined
  if (!person) return null
  const emailStatusValue = text(row, 'cr40f_statusenvioemail')
  return {
    ...person,
    existingPayerId: text(row, 'cr40f_pagantesid'),
    paymentStatus: text(row, 'cr40f_status@OData.Community.Display.V1.FormattedValue'),
    amountCents: moneyToCents(row.cr40f_valor),
    paymentMethod: Number(row.cr40f_formadepagamento ?? 202410000) as Payer['paymentMethod'],
    generateLink: Boolean(text(row, 'cr40f_linkdepagamento')),
    sendEmail: emailStatusValue ? emailStatusValue !== '202410000' : false,
    paymentUrl: text(row, 'cr40f_linkdepagamento') || undefined,
    linkStatus: toLinkStatus(text(row, 'cr40f_statusgeracaolink@OData.Community.Display.V1.FormattedValue')),
    emailStatus: toEmailStatus(text(row, 'cr40f_statusenvioemail@OData.Community.Display.V1.FormattedValue')),
    linkError: text(row, 'cr40f_errogeracaolink') || undefined,
    emailError: text(row, 'cr40f_erroenvioemail') || undefined
  }
}

async function fetchExistingPayers(recordId: Guid): Promise<Array<Record<string, unknown>>> {
  const baseSelect = 'cr40f_pagantesid,_cr40f_financeiro_value,_cr40f_bancodedados_value,cr40f_valor,cr40f_formadepagamento,cr40f_status,cr40f_statusgeracaolink,cr40f_statusenvioemail,cr40f_errogeracaolink,cr40f_erroenvioemail,cr40f_linkdepagamento,cr40f_cielolinkid,cr40f_cieloordernumber'
  const filter = `$filter=_cr40f_financeiro_value eq ${recordId}`
  return fetchAll('cr40f_pagantes', `?$select=${baseSelect}&${filter}`)
}

export async function loadOperation(recordId: Guid): Promise<OperationData> {
  const xrm = getXrm()
  if (!xrm?.WebApi) return new URLSearchParams(window.location.search).get('demo') === 'edit' ? demoEditOperation : demoOperation
  const api = xrm.WebApi
  const [finance, services] = await Promise.all([
    api.retrieveRecord('cr40f_financeiro', recordId, '?$select=cr40f_idfinanceiro,versionnumber,statecode,statuscode,_ownerid_value'),
    fetchAll('cr40f_reservadeveculos', `?$select=cr40f_reservadeveculosid,cr40f_dataehorriodesada,_cr40f_solicitante_value&$filter=_cr40f_financeiro_value eq ${recordId}`)
  ])
  assertOperationEditable(finance)
  const serviceIds = services.map((service) => text(service, 'cr40f_reservadeveculosid')).filter(Boolean)
  if (!serviceIds.length) throw new Error('Esta OP não possui serviços vinculados.')
  const serviceFilter = serviceIds.map((id) => `_cr40f_servicorelacionadogeral_value eq ${id}`).join(' or ')
  const passengerFilter = serviceIds.map((id) => `_cr40f_geral_value eq ${id}`).join(' or ')
  const [compositions, servicePassengers, existingRows] = await Promise.all([
    fetchAll('cr40f_composicaodeprecos', `?$select=new_valortotal&$filter=${serviceFilter}`),
    fetchAll('cr40f_servicosporpassageiro', `?$select=_cr40f_bancodedados_value&$filter=${passengerFilter}`),
    fetchExistingPayers(recordId)
  ])
  const totalCents = Math.round(compositions.reduce((sum, row) => sum + Number(row.new_valortotal ?? 0), 0) * 100)
  const serviceDates = services.map((service) => ({ timestamp: Date.parse(text(service, 'cr40f_dataehorriodesada')), date: toBrazilDateOnly(service.cr40f_dataehorriodesada) })).filter((service): service is { timestamp: number; date: string } => Boolean(service.date) && !Number.isNaN(service.timestamp)).sort((left, right) => left.timestamp - right.timestamp)
  const requesterIds = services.map((service) => lookup(service, '_cr40f_solicitante_value')).filter((id): id is string => Boolean(id))
  const passengerIds = servicePassengers.map((row) => lookup(row, '_cr40f_bancodedados_value')).filter((id): id is string => Boolean(id))
  const involvedIds = new Set([...requesterIds, ...passengerIds])
  const payerIds = existingRows.map((row) => lookup(row, '_cr40f_bancodedados_value')).filter((id): id is string => Boolean(id))
  const requiredPersonIds = [...new Set([...involvedIds, ...payerIds])]
  const personFilter = requiredPersonIds.map((id) => `cr40f_bancodedadosid eq ${id}`).join(' or ')
  const directoryRows = requiredPersonIds.length
    ? await fetchAll('cr40f_bancodedados', `?$select=cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_email,cr40f_telefone&$filter=statecode eq 0 and (${personFilter})&$orderby=cr40f_nomedopassageiro asc`)
    : []
  const requesterSet = new Set(requesterIds)
  const directory = directoryRows.map((row) => toPerson(row, requesterSet.has(text(row, 'cr40f_bancodedadosid')) ? 'Solicitante' : involvedIds.has(text(row, 'cr40f_bancodedadosid')) ? 'Passageiro' : 'Adicionado'))
  const people = directory.filter((person) => involvedIds.has(person.id))
  const personMap = new Map(directory.map((person) => [person.id, person]))
  const payers = existingRows.map((row) => toPayer(row, personMap)).filter((payer): payer is Payer => Boolean(payer))
  return {
    id: recordId,
    displayId: text(finance, 'cr40f_idfinanceiro') || recordId,
    version: text(finance, 'versionnumber'),
    serviceCount: services.length,
    serviceStartDate: serviceDates[0]?.date ?? null,
    serviceEndDate: serviceDates.at(-1)?.date ?? null,
    totalCents,
    statusLabel: text(finance, 'statuscode@OData.Community.Display.V1.FormattedValue'),
    stateCode: Number(finance.statecode ?? 0),
    ownerId: lookup(finance, '_ownerid_value'),
    people,
    directory,
    payers
  }
}

export async function submitOperation(financeiroId: Guid, request: SubmitRequest): Promise<SubmitResult> {
  const api = getXrm()?.WebApi
  const totalCents = request.pagantes.reduce((sum, payer) => sum + payer.amountCents, 0)
  if (!api) return { success: true, requestId: request.requestId, financeiroId, totalCents, results: request.pagantes.map((payer) => ({ paganteId: payer.paganteId, pagantesRecordId: payer.existingPaganteId ?? payer.paganteId, linkStatus: payer.generateLink ? 'Generated' : 'NotApplicable', emailStatus: payer.sendEmail ? 'Sent' : 'NotApplicable' })), errors: [] }
  const online = api.online
  if (!online?.execute) throw new Error('A Custom API cr40f_GerarPagantes não está publicada neste ambiente.')
  const apiPayload = {
    ...request,
    pagantes: request.pagantes.map((payer) => ({
      ...payer,
      email: payer.email.trim() || null
    }))
  }
  const customApiRequest = {
    entity: { entityType: 'cr40f_financeiro', id: financeiroId },
    cr40f_RequestJson: JSON.stringify(apiPayload),
    getMetadata: () => ({
      boundParameter: 'entity',
      parameterTypes: {
        entity: { typeName: 'Microsoft.Dynamics.CRM.cr40f_financeiro', structuralProperty: 5 },
        cr40f_RequestJson: { typeName: 'Edm.String', structuralProperty: 1 }
      },
      operationType: 0,
      operationName: 'cr40f_GerarPagantes'
    })
  }
  const response = await online.execute(customApiRequest)
  if (response.ok === false) throw new Error('A Custom API recusou a geração dos pagantes.')
  const body = await response.json()
  const raw = String(body.cr40f_ResponseJson ?? '')
  const result = raw ? JSON.parse(raw) as SubmitResult : null
  const validLinkStatuses = new Set(['NotApplicable', 'Generated', 'Pending', 'Failed', 'Indeterminate'])
  const validEmailStatuses = new Set(['NotApplicable', 'Sent', 'Pending', 'Failed'])
  const requestedIds = new Set(request.pagantes.map((payer) => payer.paganteId))
  if (!result || result.requestId !== request.requestId || result.financeiroId !== financeiroId || !Array.isArray(result.results) || !Array.isArray(result.errors)) throw new Error('A Custom API retornou uma confirmação inválida.')
  if (result.results.length !== requestedIds.size || result.results.some((item) => !requestedIds.has(item.paganteId) || !guidPattern.test(item.pagantesRecordId) || !validLinkStatuses.has(item.linkStatus) || !validEmailStatuses.has(item.emailStatus))) throw new Error('A Custom API não confirmou todos os pagantes individualmente.')
  return result
}
