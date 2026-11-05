import { SYSTEM_PROMPT_CONFERENCIA, TEXTO_USUARIO_CONFERENCIA } from './prompt.ts'
import { EFFORT_CONFERENCIA, LIMITE_CORPO_CONFERENCIA, MAX_TOKENS_CONFERENCIA, MODELO_CONFERENCIA, THINKING_CONFERENCIA } from './requisicao.ts'
import { schemaConferencia } from './schema.ts'

export * from './prompt.ts'
export * from './requisicao.ts'
export * from './resposta.ts'
export * from './schema.ts'

export function constantesDaConferencia() {
  return { modelo: MODELO_CONFERENCIA, maxTokens: MAX_TOKENS_CONFERENCIA, effort: EFFORT_CONFERENCIA, thinking: THINKING_CONFERENCIA, systemPrompt: SYSTEM_PROMPT_CONFERENCIA, textoUsuario: TEXTO_USUARIO_CONFERENCIA, limiteCorpo: LIMITE_CORPO_CONFERENCIA, schema: schemaConferencia() }
}
