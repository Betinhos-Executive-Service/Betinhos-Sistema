export type Kind = 'manutencao' | 'multa' | 'colisao'
export type Ref = { id: string; label: string }

export type Veiculo = { id: string; placa: string; marca: string | null; modelo: string | null; cor: string | null; anoModelo: number | null; status: number | null; categoria: number | null; motorista: Ref | null; hodometro: number | null; hodometroEm: string | null }
export type Manutencao = { id: string; codigo: string; descricao: string; status: number | null; grau: number | null; tipo: number | null; agendarPara: string | null; dataManutencao: string | null; valor: number | null; estabelecimento: string | null; servicoRealizado: string | null; comentarioAprovador: string | null; km: number | null; veiculo: Ref | null; solicitante: Ref | null; criadoEm: string; servicos: number[]; categorias: number[]; origemClassificacao: number | null; confiancaIa: number | null }
export type Multa = { id: string; titulo: string; status: number | null; dataHora: string | null; local: string | null; dataParaIndicar: string | null; indicado: boolean; dataAviso: string | null; dataIndicacao: string | null; veiculo: Ref | null; motorista: Ref | null; infracaoId: string | null; criadoEm: string; valorGuia: number | null; recursoPendente: boolean; termoVigente: Ref | null }
export type TermoStatus = 'pendente' | 'assinado' | 'contestado' | 'expirado' | 'cancelado'
export type TermoMulta = { id: string; status: TermoStatus | null; forma: 'guia' | 'folha' | null; parcelas: number | null; valorTotal: number | null; primeiraCompetencia: string | null; enviadoEm: string | null; assinadoEm: string | null; hashPdf: string | null; motivoContestacao: string | null; criadoEm: string }
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
