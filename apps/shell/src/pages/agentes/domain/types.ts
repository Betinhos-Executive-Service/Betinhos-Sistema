export type Agente = 'financeiro' | 'logistica' | 'pessoas'
export type StatusExecucao = 'pendente' | 'processando' | 'concluida' | 'erro'
export type Prioridade = 'alta' | 'media' | 'baixa'
export type Decisao = 'pendente' | 'aprovada' | 'descartada'
export type TipoAcao = 'CriarPendencia' | 'AtribuirMotorista' | 'AtribuirVeiculo' | 'CriarComunicadoRascunho'

export type Execucao = {
  id: string; agente: Agente; origem: 'agendado' | 'manual'; pergunta: string; status: StatusExecucao; erro: string
  resumo: string; modelo: string; tokensEntrada: number; tokensSaida: number; criadaEm: Date | null
}
export type Proposta = {
  id: string; execucaoId: string; tipo: string; titulo: string; justificativa: string; prioridade: Prioridade
  entidadeAlvo: string; idAlvo: string; acao: { tipo: TipoAcao; campos: Record<string, string | number | null> } | null
  decisao: Decisao; motivoDescarte: string; decididoPor: string; decididoEm: Date | null
}
export type Gravacao = { kind: 'update'; entity: string; id: string; data: Record<string, unknown> } | { kind: 'create'; entity: string; data: Record<string, unknown> }
