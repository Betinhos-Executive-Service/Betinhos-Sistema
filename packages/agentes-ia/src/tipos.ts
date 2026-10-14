export const AGENTES = ['financeiro', 'logistica', 'pessoas'] as const
export type Agente = (typeof AGENTES)[number]

export const TIPOS_POR_AGENTE = {
  financeiro: ['SemRecibo', 'OPPendenteAntiga', 'RepasseAguardando', 'MargemNegativa', 'OSSemCobranca'],
  logistica: ['ServicoSemMotorista', 'ServicoSemVeiculo', 'ConflitoHorario', 'MotoristaSemVeiculoAtual'],
  pessoas: ['CNHVencendo', 'ASOVencendo', 'DocumentoVencido', 'Aniversario', 'MultaSemMotorista', 'ComunicadoSugerido'],
} as const
export type TipoProposta = (typeof TIPOS_POR_AGENTE)[Agente][number]

export const ACOES_POR_AGENTE = {
  financeiro: ['CriarPendencia'],
  logistica: ['AtribuirMotorista', 'AtribuirVeiculo'],
  pessoas: ['CriarPendencia', 'CriarComunicadoRascunho'],
} as const
export type TipoAcao = (typeof ACOES_POR_AGENTE)[Agente][number]

export const PRIORIDADES = ['alta', 'media', 'baixa'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

/** Ordem fixa: é a ordem dos valores do choice cr40f_tipo (100000000 + índice). */
export const TODOS_OS_TIPOS: readonly TipoProposta[] = [...TIPOS_POR_AGENTE.financeiro, ...TIPOS_POR_AGENTE.logistica, ...TIPOS_POR_AGENTE.pessoas]
export const TODAS_AS_ACOES: readonly TipoAcao[] = ['CriarPendencia', 'AtribuirMotorista', 'AtribuirVeiculo', 'CriarComunicadoRascunho']

export type Proposta = {
  tipo: TipoProposta
  titulo: string
  justificativa: string
  prioridade: Prioridade
  registroAlvo: { entidade: string; id: string }
  acao: { tipo: TipoAcao; campos: Record<string, string | number | null> } | null
}
export type RespostaIA = { resumo: string; propostas: Proposta[] }
