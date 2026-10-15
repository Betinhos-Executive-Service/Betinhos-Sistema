import { SYSTEM_PROMPT_LEITURA, TEXTO_USUARIO_LEITURA } from './prompt.ts'
import { schemaLeituraRapida } from './schema.ts'

export const MODELO_LEITURA = 'claude-haiku-5-5'
export const MAX_TOKENS_LEITURA = 1024
export const EFFORT_LEITURA = 'low'
export const LIMITE_BASE64_LEITURA = 2_800_000
const MIMES = ['image/jpeg', 'image/png', 'image/webp']

export type EntradaLeitura = { imagemBase64: string; mime: string; categorias: string[]; formasPagamento: string[] }

export function montarRequisicaoLeitura(e: EntradaLeitura) {
  if (!MIMES.includes(e.mime)) throw new Error(`Tipo de imagem não suportado: ${e.mime}`)
  if (e.imagemBase64.length > LIMITE_BASE64_LEITURA) throw new Error('Imagem acima do limite da leitura rápida.')
  return {
    model: MODELO_LEITURA,
    max_tokens: MAX_TOKENS_LEITURA,
    system: SYSTEM_PROMPT_LEITURA,
    output_config: {
      effort: EFFORT_LEITURA,
      format: { type: 'json_schema' as const, schema: schemaLeituraRapida(e.categorias, e.formasPagamento) },
    },
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: e.mime, data: e.imagemBase64 } },
        { type: 'text' as const, text: TEXTO_USUARIO_LEITURA },
      ],
    }],
  }
}
