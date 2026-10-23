import type { DateBehavior } from './dates'
import type { Acordo } from '../domain/termoMulta'
import type { FrotaData, Kind, ParcelaTermo, TableKey, TermoMulta } from './types'

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

export type ItemPlanoInput = { nome: string; servico: number; intervaloKm: number | null; intervaloMeses: number | null; avisoKm: number; avisoDias: number }

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
  /** Cria o item do plano preventivo (sem id) ou atualiza (com id). */
  salvarItemPlano(input: ItemPlanoInput, id?: string): Promise<void>
  /** Ativa (statecode 0 / statuscode 1) ou inativa (statecode 1 / statuscode 2) o item do plano. */
  inativarItemPlano(id: string, ativo: boolean): Promise<void>
  /** Upsert da última execução conhecida por (veículo, item). */
  salvarBaseline(veiculoId: string, itemId: string, km: number | null, data: string | null): Promise<void>
  /** Funcionário tem o aditivo de assinatura eletrônica (data em new_aditivoassinaturaem e PDF em new_aditivoassinatura). */
  temAditivo(funcionarioId: string): Promise<boolean>
  /** Termos da multa, do mais recente ao mais antigo. */
  listarTermos(multaId: string): Promise<TermoMulta[]>
  /** Custom API new_EnviarTermoMulta: cria o termo Pendente e devolve o id. */
  enviarTermoMulta(multaId: string, acordo: Acordo): Promise<string>
  /** Cancela o envio de um termo ainda Pendente. */
  cancelarTermoMulta(termoId: string): Promise<void>
  /** Custom API new_LembrarTermoMulta: reenvia o push ao motorista (1 por 24 h; a recusa vem com a mensagem do servidor). */
  lembrarTermoMulta(termoId: string): Promise<void>
  /** Custom API new_BaixarPdfTermoMulta: PDF do termo assinado (base64 do servidor convertido em Blob). */
  baixarPdfTermo(termoId: string): Promise<{ nome: string; blob: Blob }>
  /** Parcelas de desconto em folha do termo, na ordem. */
  listarParcelasTermo(termoId: string): Promise<ParcelaTermo[]>
}
