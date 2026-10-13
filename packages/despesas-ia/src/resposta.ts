import type { ContextoDespesa } from './contexto.ts'
import { DECISOES, RESPOSTA_SCHEMA, type RespostaIA } from './schema.ts'

export type MensagemApi = { stop_reason: string | null; model: string; content: { type: string; text?: string }[] }
export type Resultado = { ok: true; resposta: RespostaIA } | { ok: false; erro: string }

/** Travas técnicas da resposta. As mesmas regras são replicadas no flow de análise (Task 7). */
export function analisarMensagem(msg: MensagemApi, ctx: ContextoDespesa): Resultado {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  const texto = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let r: RespostaIA
  try { r = JSON.parse(texto) } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  const faltando = RESPOSTA_SCHEMA.required.filter((campo) => !(campo in (r as object)))
  if (faltando.length) return { ok: false, erro: `Campos ausentes: ${faltando.join(', ')}.` }
  if (!(DECISOES as readonly string[]).includes(r.decisao)) return { ok: false, erro: `Decisão inválida: ${r.decisao}.` }
  if (r.decisao === 'precisa_corrigir' && !r.motivos.length) return { ok: false, erro: 'Decisão "precisa_corrigir" sem motivos.' }
  if (typeof r.confianca !== 'number' || r.confianca < 0 || r.confianca > 1) return { ok: false, erro: `Confiança fora de 0–1: ${r.confianca}.` }
  if (r.reserva_id !== null && !ctx.reservas.some((os) => os.id === r.reserva_id)) return { ok: false, erro: `OS indicada fora do contexto: ${r.reserva_id}.` }
  return { ok: true, resposta: r }
}
