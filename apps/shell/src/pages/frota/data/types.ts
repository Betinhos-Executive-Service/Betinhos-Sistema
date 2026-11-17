export type Kind = 'manutencao' | 'multa' | 'colisao'
export type Ref = { id: string; label: string }

export type Veiculo = { id: string; placa: string; marca: string | null; modelo: string | null; cor: string | null; anoModelo: number | null; status: number | null; categoria: number | null; motorista: Ref | null; hodometro: number | null; hodometroEm: string | null }
/** `agendarPara` (cr40f_agendarpara) é só leitura: histórico de antes das manutenções v2. A janela (início e fim, `YYYY-MM-DD`) é a do encaixe; `dataAprovacao` é o dia do primeiro encaixe; `kmRealizado`, o km de quem concluiu. */
export type Manutencao = { id: string; codigo: string; descricao: string; status: number | null; grau: number | null; tipo: number | null; agendarPara: string | null; janelaInicio: string | null; janelaFim: string | null; dataAprovacao: string | null; kmRealizado: number | null; dataManutencao: string | null; valor: number | null; estabelecimento: string | null; servicoRealizado: string | null; comentarioAprovador: string | null; km: number | null; veiculo: Ref | null; solicitante: Ref | null; criadoEm: string; servicos: number[]; categorias: number[]; origemClassificacao: number | null; confiancaIa: number | null }
/** Manutenção aberta na gaveta: a linha da lista mais o que só a gaveta mostra (lido do servidor quando ela abre). */
export type ProgramacaoManutencao = { geralId: string; motorista: Ref | null; saida: string | null /* ISO UTC */ }
export type DespesaDaManutencao = { id: string; statusOperacional: number | null; statusAnexo: number | null }
export type DetalheManutencao = Manutencao & {
  comentarioAoMotorista: string | null; comentarioColaborador: string | null; pagamento: number | null; realizadoPor: Ref | null
  fotosPedido: string[]; linkNotaFiscal: string | null; fotosFinais: string[]
  /** Linha ativa da Geral; null = não há; undefined = não foi possível ler. */
  programacao?: ProgramacaoManutencao | null
  /** Despesa ligada; null = não há; undefined = não foi possível ler. */
  despesa?: DespesaDaManutencao | null
}
export type ArquivosMulta = { autuacao: string | null; penalidade: string | null; comprovante: string | null }
/** Campos novos da fase 1 são opcionais: fixtures antigos continuam válidos e o mapper sempre os preenche. */
export type Multa = { id: string; /** cr40f_id_multa (ex.: NT-1073), o código citado no resumo diário. */ codigo: string | null; titulo: string; status: number | null; dataHora: string | null; local: string | null; dataParaIndicar: string | null; indicado: boolean; dataAviso: string | null; dataIndicacao: string | null; veiculo: Ref | null; motorista: Ref | null; infracaoId: string | null; criadoEm: string; valorGuia: number | null; recursoPendente: boolean; termoVigente: Ref | null; /** undefined = resumo dos termos não carregou; null = sem termo. */ termo?: ResumoTermo | null
  responsavel?: number | null; motivoEmpresa?: number | null; canal?: number | null; aceiteEm?: string | null; vencimento?: string | null
  valorComDesconto?: number | null; valorPago?: number | null; pagaEm?: string | null; competencia?: string | null; acertoEm?: string | null
  encerradaEm?: string | null; canceladaEm?: string | null; motivoCancelamento?: string | null; arquivos?: ArquivosMulta
}
/** Retorno da Custom API new_DossieMulta (plugin DossieMultaPlugin). */
export type DossieServico = { id: string; codigo: string | null; cliente: string | null; saida: string; retorno: string | null; motorista: string | null; status: string | null; noHorario: boolean }
export type DossieViagem = { inicio: string; fim: string; motoristaInfleet: string | null; motorista?: string | null }
export type Dossie = {
  multa: { id: string; auto: string | null; placa: string | null; dataHora: string | null; local: string | null; orgao: string | null; dataParaIndicar: string | null; infracao: { codigo: string | null; descricao: string | null; valor: number | null } | null }
  servicos: DossieServico[]
  infleet: { veiculoId?: string; viagens?: DossieViagem[]; erro?: string }
}
export type TermoStatus = 'pendente' | 'assinado' | 'contestado' | 'expirado' | 'cancelado'
/** Último termo da multa, para a coluna Termo da lista. */
export type ResumoTermo = { status: TermoStatus; enviadoEm: string | null }
export type ParcelaTermo = { numero: number; competencia: string; valor: number | null; status: string | null }
export type TermoMulta = { id: string; status: TermoStatus | null; forma: 'guia' | 'folha' | null; parcelas: number | null; valorTotal: number | null; primeiraCompetencia: string | null; enviadoEm: string | null; assinadoEm: string | null; hashPdf: string | null; motivoContestacao: string | null; ultimoLembreteEm: string | null; criadoEm: string }
export type Infracao = { id: string; codigo: string; descricao: string | null; gravidade: number | null; pontos: number | null; valor: number | null }
export type Colisao = { id: string; titulo: string; status: number | null; tipo: number | null; dataHora: string | null; local: string | null; descricao: string | null; houveTerceiro: boolean; veiculo: Ref | null; motorista: Ref | null; criadoEm: string }
export type Posse = { id: string; inicio: string | null; fim: string | null; veiculo: Ref | null; motorista: Ref | null; localBase: Ref | null }

export type ItemPlano = { id: string; nome: string; servico: number | null; intervaloKm: number | null; intervaloMeses: number | null; avisoKm: number; avisoDias: number; ativo: boolean }
export type Baseline = { id: string; veiculo: Ref | null; item: Ref | null; km: number | null; data: string | null }
/** Despesa operacional de combustível ou de manutenção (esta só para o aviso de dupla contagem). */
export type DespesaCombustivel = { id: string; dia: string | null; valor: number | null; veiculo: Ref | null; manutencao: Ref | null; categoria: 'combustivel' | 'manutencao' }
export type TelemetriaKm = { dia: string; veiculoId: string; km: number }

export type FrotaData = { veiculos: Veiculo[]; manutencoes: Manutencao[]; multas: Multa[]; infracoes: Infracao[]; colisoes: Colisao[]; posses: Posse[]; planoPreventivo: ItemPlano[]; baselines: Baseline[]; despesasCombustivel: DespesaCombustivel[]; telemetriaKm: TelemetriaKm[] }
export type TableKey = keyof FrotaData
