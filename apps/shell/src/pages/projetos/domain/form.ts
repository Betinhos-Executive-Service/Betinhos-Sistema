import type { Row } from '@betinhos/dataverse'
import { STATUS } from './choices'
import { erroDeStatus } from './regras'
import type { Atualizacao, Projeto } from './types'

/** Valores do formulário como texto; '' = vazio; status como string do número. */
export type ProjetoForm = { nome: string; area: string; status: string; responsavel: string; prazo: string; andamento: string; linkPr: string; instrucoes: string }
export type FormKey = keyof ProjetoForm
export type FormErrors = Partial<Record<FormKey, string>>

/** Tamanhos das colunas (migration). */
export const MAX_LENGTH = { nome: 200, area: 100, responsavel: 100, linkPr: 500, instrucoes: 100000 } as const

const COLUMNS = {
  nome: 'cr40f_name', area: 'cr40f_area', status: 'cr40f_status', responsavel: 'cr40f_responsavel',
  prazo: 'cr40f_prazo', andamento: 'cr40f_andamento', linkPr: 'cr40f_linkpr', instrucoes: 'cr40f_instrucoes',
} as const

export const emptyProjeto = (id: string): Projeto => ({ id, nome: '', area: '', status: STATUS.ideia, responsavel: '', prazo: null, andamento: 0, linkPr: '', instrucoes: '' })
export const emptyForm = (): ProjetoForm => ({ nome: '', area: '', status: String(STATUS.ideia), responsavel: '', prazo: '', andamento: '0', linkPr: '', instrucoes: '' })

export const toForm = (p: Projeto): ProjetoForm => ({
  nome: p.nome, area: p.area, status: p.status == null ? '' : String(p.status), responsavel: p.responsavel,
  prazo: p.prazo ?? '', andamento: String(p.andamento), linkPr: p.linkPr, instrucoes: p.instrucoes,
})

export const isDirty = (a: ProjetoForm, b: ProjetoForm) => (Object.keys(a) as FormKey[]).some((k) => a[k] !== b[k])

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

/** Erros por campo; a regra do Concluído usa as atualizações do projeto (cadastro novo não tem nenhuma). */
export function validateForm(f: ProjetoForm, atualizacoes: Atualizacao[]): FormErrors {
  const e: FormErrors = {}
  if (!f.nome.trim()) e.nome = 'Informe o nome do projeto.'
  else if (f.nome.length > MAX_LENGTH.nome) e.nome = `No máximo ${MAX_LENGTH.nome} caracteres.`
  if (f.area.length > MAX_LENGTH.area) e.area = `No máximo ${MAX_LENGTH.area} caracteres.`
  if (f.responsavel.length > MAX_LENGTH.responsavel) e.responsavel = `No máximo ${MAX_LENGTH.responsavel} caracteres.`
  if (!f.status) e.status = 'Escolha o status.'
  else { const aviso = erroDeStatus(Number(f.status), atualizacoes); if (aviso) e.status = aviso }
  if (f.prazo && !dataValida(f.prazo)) e.prazo = 'Data inválida.'
  const pct = f.andamento.trim()
  if (!/^\d{1,3}$/.test(pct) || Number(pct) > 100) e.andamento = 'Informe um número de 0 a 100.'
  if (f.linkPr.trim() && !urlValida(f.linkPr.trim())) e.linkPr = 'Use um link completo, começando com https://.'
  else if (f.linkPr.length > MAX_LENGTH.linkPr) e.linkPr = `No máximo ${MAX_LENGTH.linkPr} caracteres.`
  if (f.instrucoes.length > MAX_LENGTH.instrucoes) e.instrucoes = `No máximo ${MAX_LENGTH.instrucoes} caracteres.`
  return e
}

/** Colunas que mudaram (cadastro novo: todas as preenchidas). Vazio vira null para limpar a coluna. */
export function diffForm(base: ProjetoForm | null, f: ProjetoForm): Row {
  const out: Row = {}
  for (const key of Object.keys(COLUMNS) as FormKey[]) {
    if (base && base[key] === f[key]) continue
    const raw = key === 'nome' ? f[key].trim() : f[key]
    if (key === 'status') out[COLUMNS[key]] = Number(raw)
    else if (key === 'andamento') out[COLUMNS[key]] = Number(raw)
    else if (key === 'linkPr') out[COLUMNS[key]] = raw.trim() || null
    else out[COLUMNS[key]] = raw === '' ? (base ? null : undefined) : raw
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

export const hasChanges = (c: Row) => Object.keys(c).length > 0

export const applyForm = (p: Projeto, f: ProjetoForm): Projeto => ({
  ...p, nome: f.nome.trim(), area: f.area, status: f.status ? Number(f.status) : null, responsavel: f.responsavel,
  prazo: f.prazo || null, andamento: Number(f.andamento), linkPr: f.linkPr.trim(), instrucoes: f.instrucoes,
})
