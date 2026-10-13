import type { Row } from '@betinhos/dataverse'
import { PROGRAMADO } from './commands'

export type LinkResult = { ok: boolean; link?: string; expiraEm?: string; erro?: string }

export const LINK_FALHA = 'Não foi possível gerar o link agora.'

/** Motivo pelo qual "Gerar link" não vale para a seleção; `null` quando pode gerar. */
export function gerarLinkBlock(rows: Row[], selectedCount: number): string | null {
  if (selectedCount !== 1 || rows.length !== 1) return 'Selecione exatamente um serviço.'
  const [row] = rows
  if (Number(row.cr40f_status) !== PROGRAMADO) return 'O serviço precisa estar Programado.'
  if (!row._cr40f_motorista_value && !row.cr40f_motorista) return 'O serviço precisa ter motorista.'
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
