import type { Row } from '@betinhos/dataverse'
import { STATUS } from './choices'
import { AVISO_SEM_PROVA, AVISO_SO_RENAN, erroDeStatus } from './regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from './types'

/** Tamanhos das colunas (migration). */
export const MAX_LENGTH = { nome: 200, area: 100, responsavel: 100, briefing: 100000, instrucoes: 100000, falta: 200 } as const

/** `aaaa-mm-dd` que existe no calendário (rejeita 2026-02-30). */
function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/**
 * Formulário único do projeto. `nome` a `instrucoes` vão para `cr40f_projeto`; `falta`, `status` e `prazo`
 * vão para a etapa única do projeto (`PRJ-n.1`).
 */
export type ProjetoForm = { nome: string; area: string; responsavel: string; briefing: string; instrucoes: string; falta: string; status: string; prazo: string }
export type ProjetoErrors = Partial<Record<keyof ProjetoForm, string>>

const PROJETO_COLUNAS = { nome: 'cr40f_name', area: 'cr40f_area', responsavel: 'cr40f_responsavel', briefing: 'cr40f_briefing', instrucoes: 'cr40f_instrucoes' } as const
const ETAPA_COLUNAS = { falta: 'cr40f_name', status: 'cr40f_status', prazo: 'cr40f_prazo' } as const

/** Projeto novo nasce em Ideia (quem cria não escolhe a situação). */
export const emptyProjetoForm = (): ProjetoForm => ({ nome: '', area: '', responsavel: '', briefing: '', instrucoes: '', falta: '', status: String(STATUS.ideia), prazo: '' })
export const toProjetoForm = (p: Projeto, e: Etapa | null): ProjetoForm => ({
  nome: p.nome, area: p.area, responsavel: p.responsavel, briefing: p.briefing, instrucoes: p.instrucoes,
  falta: e?.nome ?? '', status: String(e?.status ?? STATUS.ideia), prazo: e?.prazo ?? '',
})
export const projetoSujo = (a: ProjetoForm, b: ProjetoForm) => (Object.keys(a) as (keyof ProjetoForm)[]).some((k) => a[k] !== b[k])

type Ctx = { base: ProjetoForm | null; perfil: Perfil; etapa: Etapa | null; atualizacoes: Atualizacao[] }

/** Erros por campo; a troca de situação segue `erroDeStatus` (perfil e prova da própria etapa). */
export function validateProjeto(f: ProjetoForm, ctx: Ctx): ProjetoErrors {
  const e: ProjetoErrors = {}
  for (const k of Object.keys(MAX_LENGTH) as (keyof typeof MAX_LENGTH)[]) if (f[k].length > MAX_LENGTH[k]) e[k] = `No máximo ${MAX_LENGTH[k]} caracteres.`
  if (!f.nome.trim()) e.nome = 'Informe o nome do projeto.'
  if (f.prazo && !dataValida(f.prazo)) e.prazo = 'Data inválida.'
  const novo = Number(f.status)
  const atual = Number(ctx.base?.status ?? STATUS.ideia)
  if (ctx.etapa) {
    const aviso = erroDeStatus({ novo, atual, perfil: ctx.perfil, etapaId: ctx.etapa.id, atualizacoes: ctx.atualizacoes })
    if (aviso) e.status = aviso
  } else if (novo !== atual) {
    // Ainda sem etapa: não há prova, então Pronto não é possível.
    if (ctx.perfil !== 'renan') e.status = AVISO_SO_RENAN
    else if (novo === STATUS.concluida) e.status = AVISO_SEM_PROVA
  }
  return e
}

const pega = (f: ProjetoForm, k: keyof ProjetoForm) => (k === 'nome' || k === 'falta' ? f[k].trim() : f[k])

/** Colunas do projeto que mudaram (cadastro novo: as preenchidas). Vazio vira null para limpar a coluna. */
export function diffProjeto(base: ProjetoForm | null, f: ProjetoForm): Row {
  const out: Row = {}
  for (const k of Object.keys(PROJETO_COLUNAS) as (keyof typeof PROJETO_COLUNAS)[]) {
    if (base && base[k] === f[k]) continue
    const v = pega(f, k)
    if (v !== '') out[PROJETO_COLUNAS[k]] = v
    else if (base) out[PROJETO_COLUNAS[k]] = null
  }
  return out
}

/** Colunas da etapa única que mudaram (cadastro novo: "o que falta" e prazo preenchidos; o status Ideia o drawer já grava). */
export function diffEtapa(base: ProjetoForm | null, f: ProjetoForm): Row {
  const out: Row = {}
  for (const k of Object.keys(ETAPA_COLUNAS) as (keyof typeof ETAPA_COLUNAS)[]) {
    if (base && base[k] === f[k]) continue
    const v = pega(f, k)
    if (k === 'status') out[ETAPA_COLUNAS[k]] = Number(v)
    else if (v !== '') out[ETAPA_COLUNAS[k]] = v
    else if (base) out[ETAPA_COLUNAS[k]] = null
  }
  return out
}

export const applyProjeto = (p: Projeto, f: ProjetoForm): Projeto => ({
  ...p, nome: f.nome.trim(), area: f.area, responsavel: f.responsavel, briefing: f.briefing, instrucoes: f.instrucoes,
})
export const applyEtapa = (e: Etapa, f: ProjetoForm): Etapa => ({ ...e, nome: f.falta.trim(), status: Number(f.status), prazo: f.prazo || null })

export const hasChanges = (c: Row) => Object.keys(c).length > 0
