import type { Row } from '@betinhos/dataverse'
import { STATUS } from './choices'
import { erroDeStatus } from './regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from './types'

/** Tamanhos das colunas (migration). */
export const MAX_LENGTH = { nome: 200, area: 100, responsavel: 100, briefing: 100000, instrucoes: 100000, descricao: 20000, linkPr: 500 } as const

const mudou = <F extends Record<string, string>>(a: F, b: F) => (Object.keys(a) as (keyof F)[]).some((k) => a[k] !== b[k])
const maxLen = (e: Record<string, string | undefined>, f: Record<string, string>, chaves: (keyof typeof MAX_LENGTH)[]) => {
  for (const k of chaves) if ((f[k] ?? '').length > MAX_LENGTH[k]) e[k] = `No máximo ${MAX_LENGTH[k]} caracteres.`
}

/** `aaaa-mm-dd` que existe no calendário (rejeita 2026-02-30). */
function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** `https://…` ou `http://…` bem formado. */
export function urlValida(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false }
}

/* ---------- Projeto ---------- */

export type ProjetoForm = { nome: string; area: string; responsavel: string; briefing: string; instrucoes: string }
export type ProjetoErrors = Partial<Record<keyof ProjetoForm, string>>

const PROJETO_COLUNAS: Record<keyof ProjetoForm, string> = {
  nome: 'cr40f_name', area: 'cr40f_area', responsavel: 'cr40f_responsavel', briefing: 'cr40f_briefing', instrucoes: 'cr40f_instrucoes',
}

export const emptyProjetoForm = (): ProjetoForm => ({ nome: '', area: '', responsavel: '', briefing: '', instrucoes: '' })
export const toProjetoForm = (p: Projeto): ProjetoForm => ({ nome: p.nome, area: p.area, responsavel: p.responsavel, briefing: p.briefing, instrucoes: p.instrucoes })
export const projetoSujo = (a: ProjetoForm, b: ProjetoForm) => mudou(a, b)

export function validateProjeto(f: ProjetoForm): ProjetoErrors {
  const e: ProjetoErrors = {}
  maxLen(e, f, ['nome', 'area', 'responsavel', 'briefing', 'instrucoes'])
  if (!f.nome.trim()) e.nome = 'Informe o nome do projeto.'
  return e
}

/** Colunas que mudaram (cadastro novo: todas as preenchidas). Vazio vira null para limpar a coluna. */
export function diffProjeto(base: ProjetoForm | null, f: ProjetoForm): Row {
  const out: Row = {}
  for (const k of Object.keys(PROJETO_COLUNAS) as (keyof ProjetoForm)[]) {
    if (base && base[k] === f[k]) continue
    const v = k === 'nome' ? f[k].trim() : f[k]
    if (v !== '') out[PROJETO_COLUNAS[k]] = v
    else if (base) out[PROJETO_COLUNAS[k]] = null
  }
  return out
}

export const applyProjeto = (p: Projeto, f: ProjetoForm): Projeto => ({ ...p, ...f, nome: f.nome.trim() })

/* ---------- Etapa ---------- */

export type EtapaForm = { nome: string; status: string; descricao: string; prazo: string; andamento: string; linkPr: string }
export type EtapaErrors = Partial<Record<keyof EtapaForm, string>>

const ETAPA_COLUNAS: Record<keyof EtapaForm, string> = {
  nome: 'cr40f_name', status: 'cr40f_status', descricao: 'cr40f_descricao', prazo: 'cr40f_prazo', andamento: 'cr40f_andamento', linkPr: 'cr40f_linkpr',
}

/** Etapa nova nasce em Ideia (quem cria não escolhe status). */
export const emptyEtapaForm = (): EtapaForm => ({ nome: '', status: String(STATUS.ideia), descricao: '', prazo: '', andamento: '0', linkPr: '' })
export const toEtapaForm = (e: Etapa): EtapaForm => ({
  nome: e.nome, status: String(e.status), descricao: e.descricao, prazo: e.prazo ?? '', andamento: String(e.andamento), linkPr: e.linkPr,
})
export const etapaSuja = (a: EtapaForm, b: EtapaForm) => mudou(a, b)

/** Erros por campo; a troca de status segue `erroDeStatus` (perfil e prova da própria etapa). */
export function validateEtapa(f: EtapaForm, ctx: { base: EtapaForm | null; perfil: Perfil; etapaId: string | null; atualizacoes: Atualizacao[] }): EtapaErrors {
  const e: EtapaErrors = {}
  maxLen(e, f, ['nome', 'descricao', 'linkPr'])
  if (!f.nome.trim()) e.nome = 'Informe o nome da etapa.'
  const atual = Number(ctx.base?.status ?? STATUS.ideia)
  const aviso = ctx.etapaId
    ? erroDeStatus({ novo: Number(f.status), atual, perfil: ctx.perfil, etapaId: ctx.etapaId, atualizacoes: ctx.atualizacoes })
    : (Number(f.status) === STATUS.ideia ? null : 'Etapa nova nasce em Ideia.')
  if (aviso) e.status = aviso
  if (f.prazo && !dataValida(f.prazo)) e.prazo = 'Data inválida.'
  const pct = f.andamento.trim()
  if (!/^\d{1,3}$/.test(pct) || Number(pct) > 100) e.andamento = 'Informe um número de 0 a 100.'
  if (f.linkPr.trim() && !urlValida(f.linkPr.trim())) e.linkPr = 'Use um link completo, começando com https://.'
  return e
}

/** Colunas que mudaram; cadastro novo leva também projeto, número, código e status Ideia. */
export function diffEtapa(base: EtapaForm | null, f: EtapaForm): Row {
  const out: Row = {}
  for (const k of Object.keys(ETAPA_COLUNAS) as (keyof EtapaForm)[]) {
    if (base && base[k] === f[k]) continue
    const raw = k === 'nome' || k === 'linkPr' ? f[k].trim() : f[k]
    if (k === 'status' || k === 'andamento') out[ETAPA_COLUNAS[k]] = Number(raw)
    else if (raw !== '') out[ETAPA_COLUNAS[k]] = raw
    else if (base) out[ETAPA_COLUNAS[k]] = null
  }
  return out
}

export const applyEtapa = (e: Etapa, f: EtapaForm): Etapa => ({
  ...e, nome: f.nome.trim(), status: Number(f.status), descricao: f.descricao, prazo: f.prazo || null, andamento: Number(f.andamento), linkPr: f.linkPr.trim(),
})

export const hasChanges = (c: Row) => Object.keys(c).length > 0
