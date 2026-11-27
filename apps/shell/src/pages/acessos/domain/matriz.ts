import { AREAS, NIVEL_LABEL, type Area } from '../../../app/acessos'
import { hrefFor } from '../../../nav/useHashRoute'
import type { Encerrado, Pessoa } from './types'

export type ChipMatriz = 'todos' | 'amplo' | 'base' | 'encerrados'
export const CHIPS_MATRIZ: { key: ChipMatriz; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'amplo', label: 'Ainda com o amplo' },
  { key: 'base', label: 'Só o Base' },
  { key: 'encerrados', label: 'Encerrados' },
]
export const ehChip = (v: string | null): v is ChipMatriz => CHIPS_MATRIZ.some((c) => c.key === v)

export type LinhaMatriz = {
  id: string
  nome: string
  email: string
  areas: Record<Area, string>
  adminAcessos: boolean
  amplo: boolean
  /** Só o Base: sem perfil de área, sem Administrador de acessos e sem Administrador do Sistema. */
  soBase: boolean
  fichaId: string | null
}

/** Uma linha por pessoa ativa com conta. Administrador do Sistema vale como Gestor em tudo e como Admin de acessos. */
export function linhasDaMatriz(pessoas: Pessoa[]): LinhaMatriz[] {
  return pessoas.map((p) => {
    const areas = Object.fromEntries(AREAS.map((a) => [a, p.admin ? NIVEL_LABEL.gestor : p.perfis.areas[a] ? NIVEL_LABEL[p.perfis.areas[a]] : '—'])) as Record<Area, string>
    const soBase = !p.admin && !p.perfis.acessos && AREAS.every((a) => !p.perfis.areas[a])
    return { id: p.id, nome: p.nome, email: p.email, areas, adminAcessos: p.admin || p.perfis.acessos, amplo: p.amplo, soBase, fichaId: p.fichaId ?? null }
  })
}

export function contagens(linhas: LinhaMatriz[], encerrados: Encerrado[]): Record<ChipMatriz, number> {
  return { todos: linhas.length, amplo: linhas.filter((l) => l.amplo).length, base: linhas.filter((l) => l.soBase).length, encerrados: encerrados.length }
}

const norm = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Todas as palavras da busca precisam aparecer no nome ou no e-mail. */
export function bate(texto: { nome: string; email: string }, busca: string) {
  const palavras = norm(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return true
  const alvo = norm(`${texto.nome} ${texto.email}`)
  return palavras.every((p) => alvo.includes(p))
}

export function filtrarLinhas(linhas: LinhaMatriz[], chip: ChipMatriz, busca: string): LinhaMatriz[] {
  const porChip = chip === 'amplo' ? linhas.filter((l) => l.amplo) : chip === 'base' ? linhas.filter((l) => l.soBase) : linhas
  return porChip.filter((l) => bate(l, busca))
}
export const filtrarEncerrados = (lista: Encerrado[], busca: string) => lista.filter((e) => bate(e, busca))

/** Ficha do funcionário na aba Acesso; sem ficha, a gaveta da pessoa em `#/acessos`. */
export const hrefDaFicha = (fichaId: string) => hrefFor('funcionarios', { ficha: fichaId, secao: 'acesso' })
export const hrefDaGaveta = (id: string) => hrefFor('acessos', { ver: id })
export const destinoDaLinha = (l: Pick<LinhaMatriz, 'id' | 'fichaId'>) => (l.fichaId ? hrefDaFicha(l.fichaId) : hrefDaGaveta(l.id))
/** Encerrado sem ficha não tem para onde ir (a gaveta só lista contas ativas). */
export const destinoDoEncerrado = (e: Pick<Encerrado, 'fichaId'>) => (e.fichaId ? hrefDaFicha(e.fichaId) : null)

const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
export const textoEncerrado = (e: Pick<Encerrado, 'encerradoEm' | 'encerradoPor'>) => `Encerrado em ${e.encerradoEm ? DATA.format(e.encerradoEm) : 'data não registrada'} por ${e.encerradoPor}`
