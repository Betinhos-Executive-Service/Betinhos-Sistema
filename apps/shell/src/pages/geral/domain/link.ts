import type { Row } from '@betinhos/dataverse'
import { CANCELADOS } from './linkCadastro'

const SOLICITADO = 202410004

export type LinkResult = { ok: boolean; link?: string; expiraEm?: string; erro?: string }

export const LINK_FALHA = 'Não foi possível gerar o link agora.'

/** Motivo pelo qual "Gerar link" não vale para a seleção; `null` quando pode gerar. */
export function gerarLinkBlock(rows: Row[], selectedCount: number): string | null {
  if (selectedCount !== 1 || rows.length !== 1) return 'Selecione exatamente um serviço.'
  const status = Number(rows[0].cr40f_status)
  if (status === SOLICITADO || CANCELADOS.includes(status)) return 'Serviço solicitado ou cancelado não tem link de acompanhamento.'
  return null
}

/** Interpreta o `new_LinkJson` da Custom API; vazio ou inválido vira falha genérica. */
export function parseLinkJson(raw: unknown): LinkResult {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, erro: LINK_FALHA }
  try {
    const parsed = JSON.parse(raw) as LinkResult
    return parsed && typeof parsed === 'object' && typeof parsed.ok === 'boolean' ? parsed : { ok: false, erro: LINK_FALHA }
  } catch { return { ok: false, erro: LINK_FALHA } }
}
