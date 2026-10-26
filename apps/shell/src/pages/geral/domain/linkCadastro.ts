import type { Row } from '@betinhos/dataverse'
import { TZ } from './format'

export type PassageiroCadastro = { id: string; nome: string; foto?: string | null; telefone?: string | null; email?: string | null }
export type LinkCadastroResult = { ok: boolean; link?: string; expiraEm?: string; passageiros?: PassageiroCadastro[]; erro?: string }

export const LINK_CADASTRO_FALHA = 'Não foi possível gerar o link de cadastro agora.'
/** Cancelado e Cancelado com Ressalvas. */
export const CANCELADOS = [202410002, 202410010]

/** Motivo pelo qual "Link de cadastro" não vale para a seleção; `null` quando pode gerar. */
export function linkCadastroBlock(rows: Row[], selectedCount: number): string | null {
  if (selectedCount !== 1 || rows.length !== 1) return 'Selecione exatamente um serviço.'
  if (CANCELADOS.includes(Number(rows[0].cr40f_status))) return 'O serviço está cancelado.'
  return null
}

/** Interpreta o `new_LinkJson` de `new_GerarLinkCadastro`; vazio ou inválido vira falha genérica. */
export function parseLinkCadastroJson(raw: unknown): LinkCadastroResult {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, erro: LINK_CADASTRO_FALHA }
  try {
    const p = JSON.parse(raw) as LinkCadastroResult
    if (!p || typeof p !== 'object' || typeof p.ok !== 'boolean') return { ok: false, erro: LINK_CADASTRO_FALHA }
    if (!p.ok) return { ok: false, erro: p.erro || LINK_CADASTRO_FALHA }
    if (typeof p.link !== 'string' || !p.link) return { ok: false, erro: LINK_CADASTRO_FALHA }
    return { ...p, passageiros: Array.isArray(p.passageiros) ? p.passageiros : [] }
  } catch { return { ok: false, erro: LINK_CADASTRO_FALHA } }
}

/** Pedido que pré-carrega no Worker a lista e as fotos do link recém-gerado, para a 1ª abertura não esperar o flow.
 * `null` quando o link não é do Worker de cadastro ou não traz token. */
export function pedidoAquecer(link: string): { url: string; init: RequestInit } | null {
  const m = /^(https:\/\/[^/#]+)\/#t=([A-Za-z0-9_-]{43})$/.exec(link)
  if (!m) return null
  // no-cors + text/plain: sem preflight; a resposta não importa (o Worker responde 202 e segue em segundo plano).
  return { url: `${m[1]}/api/aquecer`, init: { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: m[2] }) } }
}

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** "vale até dd/mm HH:mm" no fuso de São Paulo; `null` sem data válida. */
export function validadeTexto(iso?: string | null): string | null {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return null
  return `vale até ${fmt.format(d).replace(',', '')}`
}

export const temDadosCadastrados = (ps: PassageiroCadastro[]) => ps.some((p) => !!(p.foto || p.telefone || p.email))

export function mensagemWhatsapp(link: string, validade: string | null) {
  return `Olá! Para agilizar o seu atendimento na Betinhos, confirme os dados dos passageiros neste link: ${link}${validade ? ` (${validade})` : ''}`
}
export const whatsappCadastroHref = (link: string, validade: string | null) => `https://wa.me/?text=${encodeURIComponent(mensagemWhatsapp(link, validade))}`
