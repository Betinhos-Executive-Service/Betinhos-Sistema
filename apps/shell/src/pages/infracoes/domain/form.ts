import type { Row } from '@betinhos/dataverse'
import { PONTOS_POR_GRAVIDADE, RESPONSABILIDADE } from './choices'
import type { Infracao } from './types'

/** Valores do formulário como texto; choices como string do número; '' = vazio. */
export type InfracaoForm = {
  codigo: string; descricao: string; enquadramento: string
  gravidade: string; pontos: string; valor: string
  competencia: string[]; responsabilidade: string
}
export type FormKey = keyof InfracaoForm
export type FormErrors = Partial<Record<FormKey, string>>

export const COLUMNS: Record<FormKey, string> = {
  codigo: 'cr40f_codigodainfracao', descricao: 'cr40f_descricaodainfracao', enquadramento: 'cr40f_enquadramentonoctb',
  gravidade: 'cr40f_gravidadedainfracao', pontos: 'cr40f_pontosnacnh', valor: 'cr40f_valordamulta',
  competencia: 'cr40f_competencia', responsabilidade: 'cr40f_responsabilidade',
}
export const MAX_LENGTH = { codigo: 850, descricao: 4000, enquadramento: 4000 } as const

const s = (v: number | null) => (v == null ? '' : String(v))
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function emptyForm(): InfracaoForm {
  return { codigo: '', descricao: '', enquadramento: '', gravidade: '', pontos: '', valor: '', competencia: [], responsabilidade: String(RESPONSABILIDADE[0].value) }
}

export function toForm(i: Infracao): InfracaoForm {
  return {
    codigo: i.codigo, descricao: i.descricao, enquadramento: i.enquadramento, gravidade: s(i.gravidade), pontos: s(i.pontos),
    valor: i.valor == null ? '' : decimal.format(i.valor), competencia: i.competencia.map(String), responsabilidade: s(i.responsabilidade),
  }
}

/** "1.467,35", "1467,35", "1467.35" e "R$ 88" viram número; texto inválido vira NaN. */
export function parseValor(raw: string): number | null {
  let t = raw.replace(/R\$|\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN
  return Number(t)
}

const codeKey = (codigo: string) => codigo.trim().toLowerCase()

/** Gravidade escolhida com pontos vazios sugere os pontos do CTB. */
export function withGravidade(f: InfracaoForm, gravidade: string): InfracaoForm {
  const sugestao = gravidade ? PONTOS_POR_GRAVIDADE[Number(gravidade)] : undefined
  return { ...f, gravidade, pontos: (f.pontos || sugestao == null) ? f.pontos : String(sugestao) }
}

/**
 * Valida o formulário. Código repetido é checado contra a lista inteira (ativas e inativas).
 * Descrição só é exigida quando mudou: registro antigo sem descrição não impede outra correção.
 */
export function validateForm(f: InfracaoForm, others: Infracao[], selfId: string | null, base: InfracaoForm | null = null): FormErrors {
  const e: FormErrors = {}
  const changed = (k: FormKey) => !base || base[k] !== f[k]
  const code = codeKey(f.codigo)
  if (!code) e.codigo = 'Informe o código.'
  else if (others.some((o) => o.id !== selfId && codeKey(o.codigo) === code)) e.codigo = `Já existe a infração ${f.codigo.trim()}.`
  if (changed('descricao') && !f.descricao.trim()) e.descricao = 'Informe a descrição.'
  if (f.pontos.trim()) {
    const n = Number(f.pontos)
    if (!Number.isInteger(n) || n < 0 || n > 21) e.pontos = 'Pontos entre 0 e 21.'
  }
  if (Number.isNaN(parseValor(f.valor))) e.valor = 'Valor inválido. Use o formato 1.467,35.'
  if (!f.competencia.length) e.competencia = 'Escolha ao menos uma competência.'
  if (!f.responsabilidade) e.responsabilidade = 'Escolha o responsável.'
  for (const [key, max] of Object.entries(MAX_LENGTH) as [keyof typeof MAX_LENGTH, number][]) if (!e[key] && f[key].length > max) e[key] = `No máximo ${max} caracteres.`
  return e
}

const clean = (v: string) => { const t = v.trim(); return t ? t : null }
const int = (v: string) => (v.trim() ? Number(v) : null)
const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Valores como a Web API espera: multi-choice vai como "v1,v2". */
function columnValue(k: FormKey, f: InfracaoForm): unknown {
  if (k === 'competencia') return f.competencia.length ? [...f.competencia].sort().join(',') : null
  if (k === 'valor') return parseValor(f.valor)
  if (k === 'gravidade' || k === 'pontos' || k === 'responsabilidade') return int(f[k])
  return clean(f[k])
}

/** Payload só com o que mudou (edição) ou com tudo preenchido (cadastro). */
export function buildPayload(base: InfracaoForm | null, f: InfracaoForm): Row {
  const p: Row = {}
  for (const k of Object.keys(COLUMNS) as FormKey[]) {
    if (base && (k === 'competencia' ? sameList(base.competencia, f.competencia) : base[k] === f[k])) continue
    const v = columnValue(k, f)
    if (base || v != null) p[COLUMNS[k]] = v
  }
  return p
}

export const isDirty = (a: InfracaoForm, b: InfracaoForm) => (Object.keys(a) as FormKey[]).some((k) => (k === 'competencia' ? !sameList(a.competencia, b.competencia) : a[k] !== b[k]))

/** Aplica o formulário salvo ao item da lista (UI sem recarregar). */
export function applyForm(i: Infracao, f: InfracaoForm): Infracao {
  return {
    ...i, codigo: f.codigo.trim(), descricao: f.descricao.trim(), enquadramento: f.enquadramento.trim(),
    gravidade: int(f.gravidade), pontos: int(f.pontos), valor: parseValor(f.valor),
    competencia: f.competencia.map(Number).sort((a, b) => a - b), responsabilidade: int(f.responsabilidade), modificadoEm: new Date(),
  }
}
