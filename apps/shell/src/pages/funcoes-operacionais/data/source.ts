import type { Host } from '../../../host'
import type { BaseLocation, CloneServiceInput, DashboardData, LocationInput, ScheduleSwapInput, Swap, SwapUpdateInput } from '../domain/types'
import { createDataverseSource } from './dataverse'
import { createMockSource } from './mock'

/** Tudo que a tela precisa do mundo externo. No Dataverse, toda IO passa por `host.client`. */
export type Source = {
  mock: boolean
  /** Funcionários, veículos, serviços (−7 a +7 dias), vínculos de passageiros, trocas ativas, posses e locais. */
  load: () => Promise<DashboardData>
  /** Define o motorista da reserva; `null` retira. */
  changeDriver: (serviceId: string, driverId: string | null) => Promise<void>
  /** Cria uma cópia da reserva (e dos vínculos de passageiros) e devolve o id novo. */
  cloneService: (input: CloneServiceInput) => Promise<string>
  createLocation: (input: LocationInput) => Promise<BaseLocation>
  /** new_RegistrarTrocaDeCarro; devolve o id da troca (ou a chave de idempotência). */
  scheduleSwap: (input: ScheduleSwapInput) => Promise<string>
  /** Troca com `rowVersion` (etag) para a edição. */
  loadSwap: (id: string) => Promise<Swap>
  updateSwap: (input: SwapUpdateInput) => Promise<void>
  cancelSwap: (id: string, reason?: string) => Promise<void>
  revertSwap: (id: string, reason?: string, effectiveAt?: Date) => Promise<void>
}

export function createSource(host: Host): Source {
  return host.mode === 'dataverse' ? createDataverseSource(host.client) : createMockSource()
}
