import { PREFIXO_USUARIO } from './comum.ts'
import { SYSTEM_FINANCEIRO } from './financeiro.ts'
import { SYSTEM_FROTA } from './frota.ts'
import { SYSTEM_LOGISTICA } from './logistica.ts'
import { SYSTEM_PESSOAS } from './pessoas.ts'
import { RESPOSTA_SCHEMA } from './schema.ts'
import { ACOES_POR_AGENTE, TIPOS_POR_AGENTE, TODOS_OS_TIPOS } from './tipos.ts'

export const MODELO = 'claude-opus-5-5'
export const MAX_TOKENS = 8000
export const EFFORT = 'medium'

export function constantesDoFlow() {
  return {
    modelo: MODELO, maxTokens: MAX_TOKENS, effort: EFFORT, prefixoUsuario: PREFIXO_USUARIO, schema: RESPOSTA_SCHEMA,
    /** Ordem dos valores do choice cr40f_tipo (100000000 + índice); o flow grava a proposta por ela. */
    tiposOrdem: [...TODOS_OS_TIPOS],
    agentes: {
      financeiro: { systemPrompt: SYSTEM_FINANCEIRO, tipos: [...TIPOS_POR_AGENTE.financeiro], acoes: [...ACOES_POR_AGENTE.financeiro] },
      logistica: { systemPrompt: SYSTEM_LOGISTICA, tipos: [...TIPOS_POR_AGENTE.logistica], acoes: [...ACOES_POR_AGENTE.logistica] },
      pessoas: { systemPrompt: SYSTEM_PESSOAS, tipos: [...TIPOS_POR_AGENTE.pessoas], acoes: [...ACOES_POR_AGENTE.pessoas] },
      frota: { systemPrompt: SYSTEM_FROTA, tipos: [...TIPOS_POR_AGENTE.frota], acoes: [...ACOES_POR_AGENTE.frota] },
    },
  }
}
