import type { DateBehavior } from './dates'
import type { Acordo } from '../domain/termoMulta'
import type { DadosPasso, Passo, Situacao } from '../domain/multaEtapas'
import type { DetalheManutencao, Dossie, FrotaData, Kind, ParcelaTermo, TableKey, TermoMulta, Veiculo } from './types'

export type LoadResult = { data: FrotaData; errors: Partial<Record<TableKey, string>> }

export const EMPTY_DATA: FrotaData = { veiculos: [], manutencoes: [], multas: [], infracoes: [], colisoes: [], posses: [], planoPreventivo: [], baselines: [], despesasCombustivel: [], telemetriaKm: [] }

/** Classificação da manutenção, aplicada na tela sem recarregar tudo. */
export type Classificacao = { servicos: number[]; categorias: number[]; origem: number | null; confianca: number | null }

/** Colunas de arquivo livres da multa que a tela grava. */
export type ArquivoMulta = 'cr40f_comprovantepagamento' | 'cr40f_pdfpenalidade'
/** Colunas de arquivo da multa que a tela baixa (inclui o PDF da autuação, que só o SNE grava). */
export type ColunaArquivoMulta = ArquivoMulta | 'cr40f_autodainfracao'

export type ItemPlanoInput = { nome: string; servico: number; intervaloKm: number | null; intervaloMeses: number | null; avisoKm: number; avisoDias: number }

/** Pedidos e respostas das Custom APIs cr40f_Manutencao* (packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs). */
export type PedidoAgendar = { manutencaoId: string; inicio: string; fim: string; comentario: string | null; grau?: number }
export type PedidoProgramar = { manutencaoId: string; geralId: string; motoristaId: string; saida: string /* ISO UTC */ }
export type PedidoConclusao = {
  manutencaoId: string; servicos: number[]; km: number
  /** ISO 8601 com fuso (`2026-11-17T10:00:00-03:00`). */
  data: string
  valor: number; pagamento: number; estabelecimento: string; cidadeId: string; realizadoPorId: string
  servicoRealizado: string | null; comentario: string | null
  linkNotaFiscal: string | null; linkFotoFinal1: string | null; linkFotoFinal2: string | null; linkFotoFinal3: string | null
}
/** `statusAnexo` 100000001 (ANEXO_DESPESA.PENDENTE): quem chamou ainda sobe a nota fiscal na despesa. */
export type RespostaConclusao = { despesaId: string; statusAnexo: number; geralId: string | null }
export type NovaManutencao = { veiculoId: string; descricao: string; grau: number; tipo: number | null; km: number; solicitanteId: string | null }

/** Ações da manutenção pela gaveta (Custom APIs, no contexto de quem chama) e o detalhe que ela mostra. */
export interface ComandosManutencao {
  /** Detalhe atual no servidor; null = a manutenção não existe mais. */
  detalheManutencao(id: string): Promise<DetalheManutencao | null>
  /** Cria a manutenção Solicitada e devolve o id. */
  criarManutencao(input: NovaManutencao): Promise<string>
  /** cr40f_ManutencaoAgendar: encaixa ou reagenda (cria ou reabre a linha da Geral). */
  agendarManutencao(pedido: PedidoAgendar): Promise<void>
  /** Grava motorista e saída na linha da Geral e marca Programado (mesmo patch do Disparar); o espelho leva a manutenção a Programado. */
  programarManutencao(pedido: PedidoProgramar): Promise<void>
  /** cr40f_ManutencaoReprovar: só Solicitado, comentário obrigatório. */
  reprovarManutencao(id: string, comentario: string): Promise<void>
  /** cr40f_ManutencaoCancelar: qualquer estado antes de Realizado. */
  cancelarManutencao(id: string, comentario: string | null): Promise<void>
  /** cr40f_ManutencaoConcluir: manutenção, despesa e linha da Geral numa transação; repetir é seguro. */
  concluirManutencao(pedido: PedidoConclusao): Promise<RespostaConclusao>
}

/** Origem do arquivo em new_fotomanutencao (mesmos valores do App). */
export type OrigemArquivo = 'NOTA_FISCAL' | 'POS_MANUTENCAO'
export type ArquivoEnviado = { link: string; nomeArquivo: string; caminho: string }
export type OpcaoBusca = { id: string; nome: string }
/** O que o envio precisa saber da manutenção para montar a pasta do App. */
export type AlvoArquivo = Pick<DetalheManutencao, 'id' | 'codigo' | 'veiculo'>

/** Arquivos da conclusão (mesmo flow e pastas do App) e as buscas da gaveta. */
export interface ArquivosManutencao {
  /** Sobe na pasta da manutenção e registra o vínculo em new_fotomanutencao; devolve o link de compartilhamento. */
  enviarArquivoManutencao(alvo: AlvoArquivo, arquivo: File, origem: OrigemArquivo, ordem: number): Promise<ArquivoEnviado>
  /** Sobe a nota na pasta da despesa, cria os anexos e grava cr40f_statusanexo (enviado; em falha, falhou). */
  anexarNotaFiscalDespesa(despesaId: string, arquivos: File[], enviadoPorId: string): Promise<void>
  /** Funcionários ativos pelo nome (até 50). Texto vazio = os primeiros por ordem alfabética. */
  buscarFuncionarios(texto: string): Promise<OpcaoBusca[]>
  /** Cidades ativas pelo nome (até 50), como "São José dos Campos - SP". */
  buscarCidades(texto: string): Promise<OpcaoBusca[]>
  /** Veículos não vendidos pela placa ou pelo modelo (até 50), como "ABC1D23 · Hilux". */
  buscarVeiculos(texto: string): Promise<OpcaoBusca[]>
}

export interface DataSource extends ComandosManutencao, ArquivosManutencao {
  mode: 'xrm' | 'mock'
  envLabel: string
  /** Carrega todas as tabelas. Tabela que falhar vem vazia e com a mensagem em `errors`. */
  load(): Promise<LoadResult>
  /** Um veículo pelo ID, mesmo inativo (a carga só traz os ativos): a ficha aberta por cima de outra lista o usa. */
  veiculo?(id: string): Promise<Veiculo | null>
  /** Status atual do registro no servidor, para checar concorrência antes de gravar. */
  currentStatus(kind: Kind, id: string): Promise<number | null>
  /** Comportamento das colunas de data da tabela. Rejeita se a metadata não estiver disponível. */
  dateBehaviors(kind: Kind): Promise<Record<string, DateBehavior>>
  update(kind: Kind, id: string, patch: Record<string, unknown>): Promise<void>
  /** Abre o formulário nativo. Resolve quando o usuário fecha o formulário. */
  openForm(kind: Kind | 'veiculo', id?: string): Promise<void>
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
  /** Custom API cr40f_PassoMulta: valida e grava o passo no servidor; a recusa vem com a mensagem do servidor. */
  passoMulta(multaId: string, passo: Passo, dados: DadosPasso): Promise<Situacao>
  /** Custom API new_DossieMulta: serviço da agenda, viagens do InFleet e dados da notificação, para a mensagem do WhatsApp. */
  dossieMulta(multaId: string): Promise<Dossie>
  /** Grava um arquivo numa coluna livre da multa (comprovante de pagamento ou PDF da penalidade). */
  enviarArquivoMulta(multaId: string, coluna: ArquivoMulta, file: File): Promise<void>
  /** Endereço que baixa o arquivo de uma coluna de arquivo da multa (Dataverse: GET .../coluna/$value; no mock, um link inofensivo). */
  urlArquivoMulta(multaId: string, coluna: ColunaArquivoMulta): string
}
