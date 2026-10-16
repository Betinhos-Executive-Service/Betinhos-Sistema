import type { Agente } from './types'

export type AgenteInfo = { id: Agente; label: string; grupo: string; descricao: string; valor: number; rodaAoAbrirAposMin: number | null }
/** `valor` é o código do choice cr40f_agente. `rodaAoAbrirAposMin`: cria execução ao abrir a tela se a última for mais velha que isso. */
export const AGENTES: AgenteInfo[] = [
  { id: 'financeiro', label: 'Assistente Financeiro', grupo: 'Financeiro', descricao: 'OS sem recibo ou cobrança, OPs pendentes antigas e repasses aguardando.', valor: 100000000, rodaAoAbrirAposMin: null },
  { id: 'logistica', label: 'Assistente de Logística', grupo: 'Operacional', descricao: 'Serviços sem motorista ou veículo e conflitos de horário nos próximos dias.', valor: 100000001, rodaAoAbrirAposMin: 30 },
  { id: 'pessoas', label: 'Assistente de Pessoas', grupo: 'Cadastros', descricao: 'CNH, ASO e documentos vencendo, multas sem condutor e aniversários.', valor: 100000002, rodaAoAbrirAposMin: null },
]
export const agentePorId = (id: string) => AGENTES.find((a) => a.id === id) ?? null
export const agentePorValor = (valor: number | null) => AGENTES.find((a) => a.valor === valor)?.id ?? 'financeiro'
