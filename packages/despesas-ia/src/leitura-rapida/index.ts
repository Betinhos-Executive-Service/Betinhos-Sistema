import { SYSTEM_PROMPT_LEITURA, TEXTO_USUARIO_LEITURA } from './prompt.ts'
import { EFFORT_LEITURA, LIMITE_BASE64_LEITURA, MAX_TOKENS_LEITURA, MODELO_LEITURA } from './requisicao.ts'

export * from './prompt.ts'
export * from './requisicao.ts'
export * from './resposta.ts'
export * from './schema.ts'

export function constantesDaLeituraRapida() {
  return { modelo: MODELO_LEITURA, maxTokens: MAX_TOKENS_LEITURA, effort: EFFORT_LEITURA, systemPrompt: SYSTEM_PROMPT_LEITURA, textoUsuario: TEXTO_USUARIO_LEITURA, limiteBase64: LIMITE_BASE64_LEITURA }
}
