// Acesso ao Dataverse dos Checklists de Veículos sobre o cliente do shell (`host.client`), no mesmo contrato
// que a tela original (tela-gestao-checklists) tinha sobre o Xrm.WebApi. As falhas da Web API já vão para o log
// pelo `reportingFetch` do host; as Custom APIs seguem por `window.Xrm.WebApi.online` (domain/checklists.ts),
// que o shell instala (Xrm do model-driven ou o shim de @betinhos/dataverse).
import type { DataverseClient, XrmHost } from '@betinhos/dataverse'
import { logFalhaDataverse } from '../../../../app/errorLog'

type RecordData = Record<string, unknown>

export const DATAVERSE = {
  funcionarios: 'cr40f_funcionarioses',
  veiculos: 'cr40f_veiculoses',
  systemusers: 'systemusers',
  checklistModelos: 'new_checklistmodelos',
  checklistModeloItens: 'new_checklistmodeloitems',
  checklistVeiculos: 'new_checklistveiculos',
  variaveisValor: 'environmentvariablevalues',
  variaveisDefinicao: 'environmentvariabledefinitions',
} as const

const ENTITY_NAMES: Record<string, string> = {
  [DATAVERSE.funcionarios]: 'cr40f_funcionarios',
  [DATAVERSE.veiculos]: 'cr40f_veiculos',
  [DATAVERSE.systemusers]: 'systemuser',
  [DATAVERSE.checklistModelos]: 'new_checklistmodelo',
  [DATAVERSE.checklistModeloItens]: 'new_checklistmodeloitem',
  [DATAVERSE.checklistVeiculos]: 'new_checklistveiculo',
  [DATAVERSE.variaveisValor]: 'environmentvariablevalue',
  [DATAVERSE.variaveisDefinicao]: 'environmentvariabledefinition',
}

let client: DataverseClient | null = null
/** A aba Checklists liga o cliente do host antes da primeira consulta. */
export function configurarDataverse(next: DataverseClient | null) { client = next }

function getClient() {
  if (!client) throw new Error('Abra o Sistema Betinhos pelo Dataverse para ver os checklists.')
  return client
}

export function entityName(entitySet: string) {
  const name = ENTITY_NAMES[entitySet]
  if (!name) throw new Error(`Tabela Dataverse desconhecida: ${entitySet}`)
  return name
}

const withQuestion = (query: string) => (!query || query.startsWith('?') ? query : `?${query}`)

/** GET de metadata (EntityDefinitions) pela Web API. */
export function retrieveMetadata<T>(path: string) {
  return getClient().request<T>(path)
}

export async function retrieveMultiple(entitySet: string, query: string) {
  const page = await getClient().request<{ value: RecordData[]; '@odata.nextLink'?: string }>(`${entitySet}${withQuestion(query)}`)
  return { entities: page.value, nextLink: page['@odata.nextLink'] }
}

export function retrieveOne(entitySet: string, id: string, query = '') {
  return getClient().request<RecordData>(`${entitySet}(${id})${withQuestion(query)}`)
}

export async function createOne(entitySet: string, data: RecordData) {
  return { id: await getClient().create(entitySet, data) }
}

export function updateOne(entitySet: string, id: string, data: RecordData) {
  return getClient().update(entitySet, id, data)
}

export function deleteOne(entitySet: string, id: string) {
  return getClient().remove(entitySet, id)
}

/** Update dentro de um changeset do executeMultiple (operationType 2 = CRUD). */
export type ChangesetUpdate = { entitySet: string; id: string; data: RecordData }

/** Monta o changeset: o array dentro do array faz o Dataverse executar tudo de forma atômica. */
export function montarChangeset(updates: ChangesetUpdate[]) {
  return [updates.map((update) => ({
    etn: entityName(update.entitySet),
    id: update.id,
    payload: update.data,
    getMetadata: () => ({ boundParameter: null, parameterTypes: {}, operationType: 2, operationName: 'Update' }),
  }))]
}

/** Executa os updates numa única transação; se um falhar, nenhum é gravado. */
export async function executeChangeset(updates: ChangesetUpdate[]) {
  const online = (window as Window & { Xrm?: XrmHost }).Xrm?.WebApi?.online
  if (!online?.executeMultiple) throw new Error('Este Dynamics não oferece Xrm.WebApi.online.executeMultiple; a troca do padrão precisa dele para ser atômica.')
  try {
    return await online.executeMultiple(montarChangeset(updates) as unknown as Parameters<typeof online.executeMultiple>[0])
  } catch (error) {
    logFalhaDataverse({ method: 'POST', path: '$batch (changeset)', error })
    throw error
  }
}
