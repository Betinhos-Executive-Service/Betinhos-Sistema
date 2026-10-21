import type { Row } from '@betinhos/dataverse'
import { normalize } from '../../infracoes/domain/filters'
import { parseValor } from '../../infracoes/domain/form'
import { STATUS } from './choices'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

/** Valores do formulário como texto; '' = vazio; status como string do número. */
export type EquipamentoForm = {
  descricao: string; tipoId: string; marcaModelo: string; numeroSerie: string
  status: string; responsavelId: string; dataCompra: string; valorCompra: string; observacoes: string
}
export type FormKey = keyof EquipamentoForm
export type FormErrors = Partial<Record<FormKey, string>>
/** O que mudou: colunas simples e, só quando mudaram, os lookups (`responsavelId: null` = limpar). */
export type Changes = { campos: Row; tipoId?: string; responsavelId?: string | null }

export const MAX_LENGTH = { descricao: 200, marcaModelo: 200, numeroSerie: 100, observacoes: 2000 } as const
/** MaxValue de cr40f_valorcompra em provision-equipamentos.ps1. */
export const MAX_VALOR = 1_000_000_000
const COLUMNS = {
  descricao: 'cr40f_name', marcaModelo: 'cr40f_marcamodelo', numeroSerie: 'cr40f_numeroserie', status: 'cr40f_status',
  dataCompra: 'cr40f_datacompra', valorCompra: 'cr40f_valorcompra', observacoes: 'cr40f_observacoes',
} as const
type ColumnKey = keyof typeof COLUMNS

const S = (v: number) => String(v)
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function emptyEquipamento(id: string): Equipamento {
  return { id, descricao: '', tipoId: null, tipoNome: '', marcaModelo: '', numeroSerie: '', status: STATUS.disponivel, responsavelId: null, responsavelNome: '', dataCompra: null, valorCompra: null, observacoes: '', modificadoEm: null }
}

export function emptyForm(): EquipamentoForm {
  return { descricao: '', tipoId: '', marcaModelo: '', numeroSerie: '', status: S(STATUS.disponivel), responsavelId: '', dataCompra: '', valorCompra: '', observacoes: '' }
}

export function toForm(e: Equipamento): EquipamentoForm {
  return {
    descricao: e.descricao, tipoId: e.tipoId ?? '', marcaModelo: e.marcaModelo, numeroSerie: e.numeroSerie,
    status: e.status == null ? '' : S(e.status), responsavelId: e.responsavelId ?? '', dataCompra: e.dataCompra ?? '',
    valorCompra: e.valorCompra == null ? '' : decimal.format(e.valorCompra), observacoes: e.observacoes,
  }
}

/** Spec 4.3: responsável em item Disponível sugere Em uso; sem responsável em item Em uso sugere Disponível. */
export function withResponsavel(f: EquipamentoForm, responsavelId: string): EquipamentoForm {
  let status = f.status
  if (responsavelId && status === S(STATUS.disponivel)) status = S(STATUS.emUso)
  if (!responsavelId && status === S(STATUS.emUso)) status = S(STATUS.disponivel)
  return { ...f, responsavelId, status }
}

/** Item baixado nunca fica com responsável. */
export function withStatus(f: EquipamentoForm, status: string): EquipamentoForm {
  return { ...f, status, responsavelId: status === S(STATUS.baixado) ? '' : f.responsavelId }
}

/** `aaaa-mm-dd` que existe no calendário (rejeita 2026-13-45, 2026-02-30). */
function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export function validateForm(f: EquipamentoForm): FormErrors {
  const e: FormErrors = {}
  if (!f.descricao.trim()) e.descricao = 'Informe a descrição.'
  if (!f.tipoId) e.tipoId = 'Escolha o tipo.'
  if (!f.status) e.status = 'Escolha o status.'
  else if (f.status === S(STATUS.baixado) && f.responsavelId) e.responsavelId = 'Item baixado não fica com responsável.'
  const valor = parseValor(f.valorCompra)
  if (Number.isNaN(valor)) e.valorCompra = 'Valor inválido. Use o formato 1.467,35.'
  else if (valor != null && valor > MAX_VALOR) e.valorCompra = 'No máximo R$ 1.000.000.000,00.'
  if (f.dataCompra && !dataValida(f.dataCompra)) e.dataCompra = 'Data inválida.'
  for (const [key, max] of Object.entries(MAX_LENGTH) as [keyof typeof MAX_LENGTH, number][]) {
    if (!e[key] && f[key].trim().length > max) e[key] = `No máximo ${max} caracteres.`
  }
  return e
}

const serieKey = (s: string) => normalize(s).replace(/[\s.\-/]/g, '')

/**
 * Outro item com o mesmo número de série (aviso; não bloqueia).
 * Compara ignorando caixa, acento, espaço, traço, ponto e barra (`DL5440-001` = `dl5440.001`).
 */
export function serieRepetida(f: EquipamentoForm, list: Equipamento[], selfId: string | null): Equipamento | null {
  const key = serieKey(f.numeroSerie)
  if (!key) return null
  return list.find((o) => o.id !== selfId && serieKey(o.numeroSerie) === key) ?? null
}

const clean = (v: string) => { const t = v.trim(); return t ? t : null }

function columnValue(k: ColumnKey, f: EquipamentoForm): unknown {
  if (k === 'status') return f.status ? Number(f.status) : null
  if (k === 'valorCompra') return parseValor(f.valorCompra)
  if (k === 'dataCompra') return f.dataCompra || null
  return clean(f[k])
}

/** Diferença entre o formulário salvo (`base`, null no cadastro) e o atual. */
export function diffForm(base: EquipamentoForm | null, f: EquipamentoForm): Changes {
  const campos: Row = {}
  for (const k of Object.keys(COLUMNS) as ColumnKey[]) {
    const v = columnValue(k, f)
    // Compara o valor que vai para a coluna, não o texto cru: '3.499,90' e '3499,9' não geram PATCH.
    if (base && Object.is(columnValue(k, base), v)) continue
    if (base || v != null) campos[COLUMNS[k]] = v
  }
  const out: Changes = { campos }
  if (!base || base.tipoId !== f.tipoId) out.tipoId = f.tipoId
  if (base ? base.responsavelId !== f.responsavelId : Boolean(f.responsavelId)) out.responsavelId = f.responsavelId || null
  return out
}

export const hasChanges = (c: Changes) => Object.keys(c.campos).length > 0 || c.tipoId !== undefined || c.responsavelId !== undefined

export const isDirty = (a: EquipamentoForm, b: EquipamentoForm) => (Object.keys(a) as FormKey[]).some((k) => a[k] !== b[k])

/** Nome do lookup: da lista; se o id não mudou e não está na lista, mantém o nome que o item já tinha. */
function nomeLookup(id: string, list: { id: string; nome: string }[], atualId: string | null, atualNome: string): string {
  if (!id) return ''
  return list.find((x) => x.id === id)?.nome ?? (id === atualId ? atualNome : '')
}

/** Aplica o formulário salvo ao item da lista (UI sem recarregar). */
export function applyForm(e: Equipamento, f: EquipamentoForm, tipos: TipoEquipamento[], pessoas: Pessoa[]): Equipamento {
  return {
    ...e,
    descricao: f.descricao.trim(), tipoId: f.tipoId || null, tipoNome: nomeLookup(f.tipoId, tipos, e.tipoId, e.tipoNome),
    marcaModelo: f.marcaModelo.trim(), numeroSerie: f.numeroSerie.trim(), status: f.status ? Number(f.status) : null,
    responsavelId: f.responsavelId || null, responsavelNome: nomeLookup(f.responsavelId, pessoas, e.responsavelId, e.responsavelNome),
    dataCompra: f.dataCompra || null, valorCompra: parseValor(f.valorCompra), observacoes: f.observacoes.trim(), modificadoEm: new Date(),
  }
}
