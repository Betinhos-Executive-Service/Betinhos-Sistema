import type { Host } from '../../../host'
import type { DadosCompartilhados, DadosVisao, Noticia, Visao } from '../domain/types'
import { createDataverseSource } from './dataverse'
import { createMockSource } from './mock'

/** Tudo que a Página Inicial lê do mundo externo. No Dataverse, toda IO passa por `host.client`. */
export type Source = {
  mock: boolean
  /** Id do systemuser logado (filtro "Minhas" do Planner). */
  usuarioId: () => Promise<string>
  /** Primeiro nome do apelido do funcionário ligado ao e-mail do usuário; vazio se não achar. */
  primeiroNome: () => Promise<string>
  /** Comunicado da Home vigente e tarefas abertas do Planner com responsáveis. */
  compartilhados: (now: Date) => Promise<DadosCompartilhados>
  /** Indicadores da visão; falha de uma consulta vira `erro` parcial, não exceção. */
  visao: (visao: Visao, now: Date) => Promise<DadosVisao>
  /** Radar Betinhos: notícias não ocultas e não expiradas, mais recentes primeiro. */
  noticias: (now: Date) => Promise<Noticia[]>
}

export function createSource(host: Host): Source {
  return host.mode === 'dataverse' ? createDataverseSource(host.client, host.metadata) : createMockSource()
}
