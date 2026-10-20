import { ACOES_POR_AGENTE, PRIORIDADES, TIPOS_POR_AGENTE, type Agente, type RespostaIA } from './tipos.ts'

export type MensagemApi = { stop_reason: string | null; model: string; content: { type: string; text?: string }[] }
export type Resultado = { ok: true; resposta: RespostaIA } | { ok: false; erro: string }
export const MAX_PROPOSTAS = 20
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Travas técnicas da resposta. O flow replica as mesmas regras e mensagens (Task 7). */
/** `obrigatorios`: ids de registroAlvo que precisam ter proposta (Agente Frota: prioridade, reincidência e custo). */
export function analisarMensagem(msg: MensagemApi, agente: Agente, obrigatorios: string[] = []): Resultado {
  if (msg.stop_reason !== 'end_turn') return { ok: false, erro: `Resposta incompleta (stop_reason: ${msg.stop_reason}).` }
  const texto = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let r: RespostaIA
  try { r = JSON.parse(texto) } catch { return { ok: false, erro: 'Resposta não é JSON válido.' } }
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return { ok: false, erro: 'Resposta não é um objeto JSON.' }
  if (typeof r.resumo !== 'string' || !Array.isArray(r.propostas)) return { ok: false, erro: 'Campos ausentes: resumo, propostas.' }
  if (r.propostas.length > MAX_PROPOSTAS) return { ok: false, erro: `Mais de ${MAX_PROPOSTAS} propostas (${r.propostas.length}).` }
  const tipos: readonly string[] = TIPOS_POR_AGENTE[agente]
  const acoes: readonly string[] = ACOES_POR_AGENTE[agente]
  for (const p of r.propostas) {
    if (!tipos.includes(p.tipo)) return { ok: false, erro: `Tipo de proposta fora do agente ${agente}: ${p.tipo}.` }
    if (!(PRIORIDADES as readonly string[]).includes(p.prioridade)) return { ok: false, erro: `Prioridade inválida: ${p.prioridade}.` }
    if (!p.registroAlvo || !GUID.test(p.registroAlvo.id ?? '')) return { ok: false, erro: `registroAlvo.id não é GUID: ${p.registroAlvo?.id}.` }
    if (p.acao !== null && !acoes.includes(p.acao.tipo)) return { ok: false, erro: `Ação fora do agente ${agente}: ${p.acao.tipo}.` }
  }
  const alvos = new Set(r.propostas.map((p) => p.registroAlvo.id.toLowerCase()))
  const faltando = obrigatorios.filter((id) => !alvos.has(id.toLowerCase()))
  if (faltando.length) return { ok: false, erro: `Pendências obrigatórias sem proposta: ${faltando.join(', ')}.` }
  return { ok: true, resposta: r }
}
