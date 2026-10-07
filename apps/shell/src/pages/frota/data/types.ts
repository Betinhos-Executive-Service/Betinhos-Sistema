export type Kind = 'manutencao' | 'multa' | 'colisao'
export type Ref = { id: string; label: string }

export type Veiculo = { id: string; placa: string; marca: string | null; modelo: string | null; cor: string | null; anoModelo: number | null; status: number | null; categoria: number | null; motorista: Ref | null }
export type Manutencao = { id: string; codigo: string; descricao: string; status: number | null; grau: number | null; tipo: number | null; agendarPara: string | null; dataManutencao: string | null; valor: number | null; estabelecimento: string | null; servicoRealizado: string | null; comentarioAprovador: string | null; km: number | null; veiculo: Ref | null; solicitante: Ref | null; criadoEm: string; servicos: number[]; categorias: number[]; origemClassificacao: number | null; confiancaIa: number | null }
export type Multa = { id: string; titulo: string; status: number | null; dataHora: string | null; local: string | null; dataParaIndicar: string | null; indicado: boolean; dataAviso: string | null; dataIndicacao: string | null; veiculo: Ref | null; motorista: Ref | null; infracaoId: string | null; criadoEm: string }
export type Infracao = { id: string; codigo: string; descricao: string | null; gravidade: number | null; pontos: number | null; valor: number | null }
export type Colisao = { id: string; titulo: string; status: number | null; tipo: number | null; dataHora: string | null; local: string | null; descricao: string | null; houveTerceiro: boolean; veiculo: Ref | null; motorista: Ref | null; criadoEm: string }
export type Posse = { id: string; inicio: string | null; fim: string | null; veiculo: Ref | null; motorista: Ref | null; localBase: Ref | null }

export type FrotaData = { veiculos: Veiculo[]; manutencoes: Manutencao[]; multas: Multa[]; infracoes: Infracao[]; colisoes: Colisao[]; posses: Posse[] }
export type TableKey = keyof FrotaData
