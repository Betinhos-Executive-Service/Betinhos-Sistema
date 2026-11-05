import type { MensagemApi } from '../resposta.ts'
import { TIPOS_SINAL, type RespostaConferencia } from './schema.ts'

export type ResultadoConferencia = { ok: true; conferencia: RespostaConferencia } | { ok: false; erro: string }

/** Travas técnicas da conferência; as mesmas regras estão no flow (provision-flow-despesas-conferencia-envio.ps1). */
export function interpretarConferencia(msg: MensagemApi): ResultadoConferencia {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  let r: RespostaConferencia
  try { r = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '') } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  if (r?.resultado !== 'sem_duvida' && r?.resultado !== 'duvida') return { ok: false, erro: 'Resultado inválido.' }
  if (r.resultado === 'sem_duvida') return { ok: true, conferencia: { resultado: 'sem_duvida', pergunta: null, motivos: [] } }
  const pergunta = typeof r.pergunta === 'string' ? r.pergunta.trim() : ''
  if (pergunta.length < 10) return { ok: false, erro: 'Dúvida sem pergunta.' }
  if (!Array.isArray(r.motivos) || r.motivos.some((m) => !(TIPOS_SINAL as readonly string[]).includes(m))) return { ok: false, erro: 'Motivos inválidos.' }
  return { ok: true, conferencia: { resultado: 'duvida', pergunta, motivos: r.motivos } }
}
