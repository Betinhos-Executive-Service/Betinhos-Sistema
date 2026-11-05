import { SYSTEM_PROMPT_CONFERENCIA, TEXTO_USUARIO_CONFERENCIA } from './prompt.ts'
import { schemaConferencia, TIPOS_SINAL } from './schema.ts'

export const MODELO_CONFERENCIA = 'claude-haiku-5-5'
export const MAX_TOKENS_CONFERENCIA = 512
export const EFFORT_CONFERENCIA = 'low'
export const THINKING_CONFERENCIA = { type: 'disabled' as const }
/** Corpo do app acima disso é recusado pela condição do gatilho do flow. */
export const LIMITE_CORPO_CONFERENCIA = 20_000

export type EntradaConferencia = { sinais: { tipo: string; detalhe: string }[] } & Record<string, unknown>

export function montarRequisicaoConferencia(e: EntradaConferencia) {
  if (!Array.isArray(e.sinais) || e.sinais.length === 0) throw new Error('Sem sinais: o app não deveria chamar a conferência.')
  if (e.sinais.some((s) => !(TIPOS_SINAL as readonly string[]).includes(s.tipo))) throw new Error('Tipo de sinal desconhecido.')
  const json = JSON.stringify(e)
  if (json.length > LIMITE_CORPO_CONFERENCIA) throw new Error('Contexto acima do limite da conferência.')
  return {
    model: MODELO_CONFERENCIA,
    max_tokens: MAX_TOKENS_CONFERENCIA,
    system: SYSTEM_PROMPT_CONFERENCIA,
    thinking: THINKING_CONFERENCIA,
    output_config: { effort: EFFORT_CONFERENCIA, format: { type: 'json_schema' as const, schema: schemaConferencia() } },
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: `${TEXTO_USUARIO_CONFERENCIA}\n${json}` }] }],
  }
}
