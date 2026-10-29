import type { DataverseClient, Row } from '@betinhos/dataverse'
import { CONFIG } from '../domain/config'
import {
  applyDriverDisplayLabels, normalizeDriver, normalizeEmail, normalizeLocation, normalizePassengerLink, normalizePossession,
  normalizeService, normalizeSwap, normalizeVehicle, valueString,
} from '../domain/normalizers'
import {
  OPERATION_CANCEL, OPERATION_REGISTER, OPERATION_REVERT, OPERATION_UPDATE, buildClonePayload, buildLifecyclePayload, buildLocationPayload,
  buildPassengerLinkPayload, buildRegisterSwapRequest, buildSwapFailure, buildUpdateSwapPayload, changeDriverPayload, cleanId, customApiPath,
} from '../domain/payloads'
import {
  driversPath, locationsPath, passengerLinksPath, possessionsPath, servicesPath, swapPath, swapsPath, systemUsersPath, vehiclesPath,
} from '../domain/queries'
import type { Driver, PassengerLink } from '../domain/types'
import { chunk } from '../domain/utils'
import type { Source } from './source'

const MAX_PAGES = 100

/** Segue o @odata.nextLink com o mesmo limite do WebResource (100 páginas). */
export async function getAllPaged(client: DataverseClient, path: string): Promise<Row[]> {
  const rows: Row[] = []
  let next: string | undefined = path
  let page = 0
  while (next) {
    const result: { value: Row[]; '@odata.nextLink'?: string } = await client.request(next)
    rows.push(...result.value)
    page += 1
    next = result['@odata.nextLink']
    if (next && page >= MAX_PAGES) throw new Error(`[PAGINATION_LIMIT] Consulta excedeu 100 páginas em ${path.split('?')[0]}.`)
  }
  return rows
}

/** POST de Custom API; a resposta (ou `{}` em 204) volta como objeto. */
async function postCustomApi(client: DataverseClient, path: string, payload: Row): Promise<Row> {
  const body = await client.request<Row | undefined>(path, { method: 'POST', body: JSON.stringify(payload) })
  return body && typeof body === 'object' ? body : {}
}

async function loadActiveSystemUserEmails(client: DataverseClient, emails: string[]): Promise<Set<string>> {
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
  const found = new Set<string>()
  for (const batch of chunk(normalized, 12)) {
    for (const item of await getAllPaged(client, systemUsersPath(batch))) {
      const email = normalizeEmail(item.internalemailaddress)
      if (email) found.add(email)
    }
  }
  return found
}

async function loadDrivers(client: DataverseClient): Promise<Driver[]> {
  const drivers = (await getAllPaged(client, driversPath())).map(normalizeDriver)
  const active = await loadActiveSystemUserEmails(client, drivers.map((driver) => driver.microsoftEmail || ''))
  return drivers
    .map((driver) => {
      const email = normalizeEmail(driver.microsoftEmail)
      return { ...driver, hasActiveSystemUser: email ? active.has(email) : null }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
}

async function loadPassengerLinks(client: DataverseClient, serviceIds: string[]): Promise<PassengerLink[]> {
  const output: PassengerLink[] = []
  for (const batch of chunk(serviceIds, 10)) output.push(...(await getAllPaged(client, passengerLinksPath(batch))).map(normalizePassengerLink))
  return output.sort((left, right) => left.order - right.order)
}

export function createDataverseSource(client: DataverseClient, now: () => Date = () => new Date()): Source {
  const loadSwap = async (id: string) => normalizeSwap(await client.request<Row>(swapPath(id)))
  const lifecycle = async (id: string, operation: string, reason: string, effectiveAt?: Date) => {
    // O etag atual vai como new_VersaoEsperada (concorrência otimista no servidor).
    const current = await loadSwap(id)
    await postCustomApi(client, customApiPath(operation, id), buildLifecyclePayload(reason, current.rowVersion || '', effectiveAt))
  }

  return {
    mock: false,
    async load() {
      const at = now()
      const [drivers, vehicles, services, swaps, possessions, locations] = await Promise.all([
        loadDrivers(client),
        getAllPaged(client, vehiclesPath()).then((rows) => rows.map(normalizeVehicle).sort((l, r) => l.label.localeCompare(r.label, 'pt-BR'))),
        getAllPaged(client, servicesPath(at)).then((rows) => rows.map(normalizeService)),
        getAllPaged(client, swapsPath()).then((rows) => rows.map(normalizeSwap)),
        getAllPaged(client, possessionsPath(at)).then((rows) => rows.map(normalizePossession)),
        getAllPaged(client, locationsPath()).then((rows) => rows.map(normalizeLocation)),
      ])
      const passengerLinks = await loadPassengerLinks(client, services.map((service) => service.id))
      return { drivers, vehicles, services: applyDriverDisplayLabels(services, drivers), passengerLinks, swaps, possessions, locations }
    },
    changeDriver: (serviceId, driverId) => client.update(CONFIG.entitySets.reserva, serviceId, changeDriverPayload(driverId)),
    async cloneService(input) {
      const id = await client.create(CONFIG.entitySets.reserva, buildClonePayload(input))
      for (const link of input.passengerLinks) await client.create(CONFIG.entitySets.servicoPassageiro, buildPassengerLinkPayload(id, link))
      return id
    },
    async createLocation(input) {
      const name = input.name.trim()
      if (!name) throw new Error('Informe o nome do local.')
      const id = await client.create(CONFIG.entitySets.localBase, buildLocationPayload(input))
      return { id: valueString(id).replace(/[{}]/g, '').toLowerCase(), name, address: input.address.trim(), mapUrl: input.mapUrl.trim() }
    },
    async scheduleSwap(input) {
      const request = buildRegisterSwapRequest(input)
      try {
        const body = await postCustomApi(client, customApiPath(OPERATION_REGISTER), request)
        return valueString(body.new_TrocaId || request.new_IdempotencyKey)
      } catch (error) {
        throw buildSwapFailure(error, { operation: OPERATION_REGISTER })
      }
    },
    loadSwap,
    async updateSwap(input) {
      await postCustomApi(client, customApiPath(OPERATION_UPDATE, input.id), buildUpdateSwapPayload(input))
    },
    cancelSwap: (id, reason = 'Cancelamento operacional da troca.') => lifecycle(cleanId(id), OPERATION_CANCEL, reason),
    revertSwap: (id, reason = 'Reversão operacional da troca.', effectiveAt) => lifecycle(cleanId(id), OPERATION_REVERT, reason, effectiveAt),
  }
}
