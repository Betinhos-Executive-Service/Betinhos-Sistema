import type { MensagemApi } from '../resposta.ts'
import type { LeituraRapida } from './schema.ts'

export type ResultadoLeitura = { ok: true; leitura: LeituraRapida } | { ok: false; erro: string }

/** Travas técnicas da leitura rápida. As mesmas regras são replicadas no flow (provision-flow-despesas-leitura-rapida.ps1). */
export function interpretarLeitura(msg: MensagemApi): ResultadoLeitura {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  let l: LeituraRapida
  try { l = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '') } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  if (typeof l?.legivel !== 'boolean') return { ok: false, erro: 'Campo legivel ausente.' }
  if (l.valor !== null && !(typeof l.valor === 'number' && l.valor > 0)) return { ok: false, erro: `Valor inválido: ${l.valor}.` }
  if (l.data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return { ok: false, erro: `Data inválida: ${l.data}.` }
  if (l.legivel && (l.valor === null || l.data === null)) return { ok: true, leitura: { ...l, legivel: false, motivo_ilegivel: 'Valor ou data não identificados.' } }
  return { ok: true, leitura: l }
}
