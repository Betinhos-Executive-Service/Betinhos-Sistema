import { PREFIXO_USUARIO, SYSTEM_PROMPT } from './prompt.ts'
import { EFFORT, MAX_TOKENS, MODELO } from './requisicao.ts'
import { RESPOSTA_SCHEMA } from './schema.ts'

export function constantesDoFlow() {
  return { modelo: MODELO, maxTokens: MAX_TOKENS, effort: EFFORT, systemPrompt: SYSTEM_PROMPT, prefixoUsuario: PREFIXO_USUARIO, schema: RESPOSTA_SCHEMA }
}
