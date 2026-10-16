import type { Comprovante, ContextoDespesa } from './contexto.ts'
import { montarTextoUsuario, SYSTEM_PROMPT } from './prompt.ts'
import { RESPOSTA_SCHEMA } from './schema.ts'

export const MODELO = 'claude-opus-5-5'
export const MAX_TOKENS = 8000
export const EFFORT = 'medium'
export const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024
const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type Bloco =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'text'; text: string }

export type RequisicaoMensagem = {
  model: string
  max_tokens: number
  system: string
  output_config: { effort: string; format: { type: 'json_schema'; schema: typeof RESPOSTA_SCHEMA } }
  messages: [{ role: 'user'; content: Bloco[] }]
}

function bloco(c: Comprovante): Bloco {
  if (Math.floor((c.base64.length * 3) / 4) > LIMITE_BYTES_IMAGEM) throw new Error('Arquivo acima de 5 MB.')
  if (c.mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.base64 } }
  if (!IMAGENS.includes(c.mime)) throw new Error(`Tipo de comprovante não suportado: ${c.mime}`)
  return { type: 'image', source: { type: 'base64', media_type: c.mime, data: c.base64 } }
}

export function montarRequisicao(ctx: ContextoDespesa, comprovantes: Comprovante[]): RequisicaoMensagem {
  if (!comprovantes.length) throw new Error('Despesa sem comprovante.')
  return {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: RESPOSTA_SCHEMA } },
    messages: [{ role: 'user', content: [...comprovantes.slice(0, 3).map(bloco), { type: 'text', text: montarTextoUsuario(ctx) }] }],
  }
}
