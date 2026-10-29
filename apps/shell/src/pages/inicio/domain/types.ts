/** Visões da Página Inicial (antes `?modulo=` do WebResource `cr40f_HomeBetinhos`). */
export type Visao = 'operacao' | 'financeiro' | 'ti_marketing' | 'gestao'

export const VISOES: Visao[] = ['operacao', 'financeiro', 'ti_marketing', 'gestao']
export const VISAO_LABEL: Record<Visao, string> = { operacao: 'Operação', financeiro: 'Financeiro', ti_marketing: 'TI', gestao: 'Gestão' }

export type Prioridade = 'Normal' | 'Alta' | 'Crítica'
export type Estado = 'Crítico' | 'Atenção' | 'Novo'
export type Tom = 'info' | 'success' | 'warning' | 'danger'

/** Para onde o clique leva: rota do shell (`#/geral`) ou lista nativa do model-driven (tabelas fora do menu). */
export type Destino = { rota: string } | { entidade: string }

export type Comunicado = { id: string; titulo: string; corpo: string; prioridade: 'info' | 'attention' | 'critical' }

export type Noticia = { id: string; titulo: string; resumo: string; url: string; fonte: string; tema: string; prioridade: Prioridade; publicadoEm: string }

export type Prazo = 'atrasada' | 'hoje' | 'outro'
export type Tarefa = { id: string; titulo: string; responsaveis: string[]; prioridade: Prioridade; estado: Estado; prazo: Prazo; prazoLabel: string }

export type Indicador = { id: string; label: string; valor: string; detalhe: string; tom: Tom; destino: Destino }

export type ServicoAReceber = { id: string; titulo: string; data: string; hora: string; saida: string; passageiro: string; rota: string }

export type DadosVisao = { visao: Visao; indicadores: Indicador[]; aReceber: ServicoAReceber[]; erro: string | null }

export type DadosCompartilhados = { comunicados: Comunicado[]; tarefas: Tarefa[]; erro: string | null }
