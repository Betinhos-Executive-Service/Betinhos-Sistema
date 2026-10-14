import type { DateBehavior } from './dates'
import type { FrotaData, Kind, TableKey } from './types'

export type LoadResult = { data: FrotaData; errors: Partial<Record<TableKey, string>> }

export const EMPTY_DATA: FrotaData = { veiculos: [], manutencoes: [], multas: [], infracoes: [], colisoes: [], posses: [], planoPreventivo: [], baselines: [], despesasCombustivel: [], telemetriaKm: [] }

/** Classificação atual da manutenção no servidor (para acompanhar o flow do JEV sem recarregar tudo). */
export type Classificacao = { servicos: number[]; categorias: number[]; origem: number | null; confianca: number | null }

export type FlowId = 'aprovarManutencao' | 'notificarCondutor' | 'gerarContrato'
export type FlowResult = { message: string | null; shareUrl: string | null }

/** O Flow pode ter rodado no servidor mesmo sem resposta (tempo esgotado ou falha de rede). */
export class FlowIncertoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowIncertoError'
  }
}

export interface DataSource {
  mode: 'xrm' | 'mock'
  envLabel: string
  /** Carrega todas as tabelas. Tabela que falhar vem vazia e com a mensagem em `errors`. */
  load(): Promise<LoadResult>
  /** Status atual do registro no servidor, para checar concorrência antes de gravar. */
  currentStatus(kind: Kind, id: string): Promise<number | null>
  /** Comportamento das colunas de data da tabela. Rejeita se a metadata não estiver disponível. */
  dateBehaviors(kind: Kind): Promise<Record<string, DateBehavior>>
  update(kind: Kind, id: string, patch: Record<string, unknown>): Promise<void>
  classificacao(id: string): Promise<Classificacao>
  /** Classifica agora pelo flow HTTP do JEV e devolve o resultado já gravado (síncrono, ~1-2 s). */
  classificarAgora(id: string): Promise<Classificacao>
  /** Abre o formulário nativo. Resolve quando o usuário fecha o formulário. */
  openForm(kind: Kind | 'veiculo', id?: string): Promise<void>
  /** Garante que o Flow pode ser chamado (URL configurada e legível). Não chama o Flow. */
  prepareFlow(flow: FlowId): Promise<void>
  /** Dispara um dos Flows existentes para o registro. O Flow grava o status; a tela recarrega depois. */
  runFlow(flow: FlowId, id: string): Promise<FlowResult>
  /** Foto principal do veículo no SharePoint (a mais recente da pasta). null = sem foto. */
  fotoVeiculo(id: string): Promise<Blob | null>
  /** Envia uma nova foto principal para o SharePoint. */
  enviarFotoVeiculo(id: string, file: File): Promise<void>
}
