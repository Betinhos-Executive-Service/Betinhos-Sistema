/** `ao_abrir`: a tela de Logística disparou sozinha (última execução antiga). Gravada como Manual, com "(ao abrir)" no nome. */
export type Origem = 'agendado' | 'manual' | 'ao_abrir'
export const ORIGEM_ROTULO: Record<Origem, string> = { agendado: 'Agendado', manual: 'Manual', ao_abrir: 'Ao abrir' }

export type Agente = 'financeiro' | 'logistica' | 'pessoas' | 'frota'
export type StatusExecucao = 'pendente' | 'processando' | 'concluida' | 'erro'
export type Prioridade = 'alta' | 'media' | 'baixa'
export type Decisao = 'pendente' | 'aprovada' | 'descartada'
export type TipoAcao = 'CriarPendencia' | 'AtribuirMotorista' | 'AtribuirVeiculo' | 'CriarComunicadoRascunho'

export type Execucao = {
  id: string; agente: Agente; origem: Origem; pergunta: string; status: StatusExecucao; erro: string
  resumo: string; modelo: string; tokensEntrada: number; tokensSaida: number; criadaEm: Date | null
}
export type Proposta = {
  id: string; execucaoId: string; tipo: string; titulo: string; justificativa: string; prioridade: Prioridade
  entidadeAlvo: string; idAlvo: string; acao: { tipo: TipoAcao; campos: Record<string, string | number | null> } | null
  decisao: Decisao; motivoDescarte: string; decididoPor: string; decididoEm: Date | null
}
export type Gravacao = { kind: 'update'; entity: string; id: string; data: Record<string, unknown> } | { kind: 'create'; entity: string; data: Record<string, unknown> }
