import { createMetadata, getHostXrm, type ChoiceOption } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { OperacionalData } from '../domain/types'
import { MOCK_STATUS, createMockData } from './mock'
import { ENTITIES, loadOperacional, type EntitySets } from './queries'
import { motoristaPatch, statusPatch } from './mutations'

/** Tudo que a tela precisa do mundo externo; dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: (key: string) => Promise<OperacionalData>
  statusOptions: () => Promise<ChoiceOption[]>
  setStatus: (reservaId: string, value: number) => Promise<void>
  setMotorista: (reservaId: string, motoristaId: string | null) => Promise<void>
  openReserva: (reservaId: string) => void
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let data: OperacionalData | null = null
  return {
    mock: true,
    async load() {
      await wait(350)
      data ??= createMockData(new Date())
      return structuredClone(data)
    },
    statusOptions: async () => MOCK_STATUS,
    async setStatus(reservaId, value) {
      await wait(400)
      const r = data?.reservas.find((item) => item.id === reservaId)
      if (r) Object.assign(r, { statusValue: value, status: MOCK_STATUS.find((s) => s.value === value)?.label ?? r.status })
    },
    async setMotorista(reservaId, motoristaId) {
      await wait(400)
      const r = data?.reservas.find((item) => item.id === reservaId)
      const m = data?.motoristas.find((item) => item.id === motoristaId)
      if (r) Object.assign(r, { motoristaId: m?.id ?? null, motorista: m?.nome ?? '' })
    },
    openReserva() { /* fora do Dataverse não há formulário para abrir */ },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const metadata = createMetadata(host.client)
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= metadata.entities(Object.values(ENTITIES)).then((info) => {
    const set = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { reserva: set(ENTITIES.reserva), funcionario: set(ENTITIES.funcionario), passageiro: set(ENTITIES.passageiro) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async (key) => loadOperacional(host.client, await entitySets(), key),
    statusOptions: () => metadata.choices(ENTITIES.reserva, 'cr40f_status'),
    setStatus: async (reservaId, value) => host.client.update((await entitySets()).reserva, reservaId, statusPatch(value)),
    setMotorista: async (reservaId, motoristaId) => {
      const s = await entitySets()
      await host.client.update(s.reserva, reservaId, motoristaPatch(s.funcionario, motoristaId))
    },
    openReserva(reservaId) {
      // XrmHost.Navigation é Record<string, unknown>: o cast para openForm continua necessário.
      const navigation = getHostXrm()?.Navigation as { openForm?: (options: { entityName: string; entityId: string }) => unknown } | undefined
      if (host.insideModelDriven && navigation?.openForm) navigation.openForm({ entityName: ENTITIES.reserva, entityId: reservaId })
      else window.open(`${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${ENTITIES.reserva}&id=${reservaId}`, '_blank', 'noopener')
    },
  }
}
