import type { StatusTone } from '@betinhos/ui'
import { AUTOR, STATUS, statusLabel, statusTone } from './choices'
import { aberta, atrasada, daEtapa, doProjeto, etapaDoProjeto, ordemDoCodigo, podeConcluir, provas } from './regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from './types'

/** As 5 fases da trilha, na ordem: Ideia → Fazendo → DEV → PROD → Prova. */
export const FASES = ['Ideia', 'Fazendo', 'DEV', 'PROD', 'Prova'] as const
export type NumFase = 1 | 2 | 3 | 4 | 5

/** Dias sem atualização a partir dos quais o projeto aberto conta como parado. */
export const DIAS_PARADO = 7

/**
 * Fase da etapa: Ideia = 1, Fazendo = 2, Conferir (DEV) = 3, `cr40f_publicadoprod` preenchido sem Pronto = 4 (PROD),
 * Pronto = 5. Pausado = null (trilha sem destaque).
 */
export function fase(e: Pick<Etapa, 'status' | 'publicadoProd'>): NumFase | null {
  if (e.status === STATUS.pausada) return null
  if (e.status === STATUS.concluida) return 5
  if (e.publicadoProd) return 4
  if (e.status === STATUS.validacao) return 3
  if (e.status === STATUS.andamento) return 2
  return 1
}

export type TomFase = 'ideia' | 'fazendo' | 'dev' | 'prod' | 'ok' | 'vencido'
export type Trilha = { fase: NumFase | null; rotulo: string; tom: TomFase | null; descricao: string }

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Fase atual com o rótulo curto da célula (data, %, "Conferir", "Vencido", "Ideia"/"Brief") e o texto alternativo. */
export function trilha(e: Etapa, atualizacoes: Atualizacao[], hoje: string): Trilha {
  const f = fase(e)
  if (f == null) return { fase: null, rotulo: '', tom: null, descricao: 'Pausado' }
  const itens = daEtapa(atualizacoes, e.id)
  let rotulo: string
  let tom: TomFase
  if (f === 5) { const p = provas(itens)[0]; rotulo = p ? ddmm(p.data) : 'Prova'; tom = 'ok' }
  else if (f === 4) { rotulo = ddmm(e.publicadoProd as string); tom = 'prod' }
  else if (f === 3) { rotulo = 'Conferir'; tom = 'dev' }
  else if (f === 2) { rotulo = `${e.andamento}%`; tom = 'fazendo' }
  else { rotulo = itens.length ? 'Brief' : 'Ideia'; tom = 'ideia' }
  if (f < 5 && atrasada(e, hoje)) { rotulo = 'Vencido'; tom = 'vencido' }
  const descricao = `Fase ${f} de 5, ${FASES[f - 1]}${tom === 'vencido' ? ', prazo vencido' : rotulo !== FASES[f - 1] ? ` (${rotulo})` : ''}`
  return { fase: f, rotulo, tom, descricao }
}

/** Ação que o projeto espera agora; null = nada pendente. */
export function acaoPendente(e: Etapa, atualizacoes: Atualizacao[]): string | null {
  if (!aberta(e)) return null
  if (e.publicadoProd) return podeConcluir(atualizacoes, e.id) ? 'Concluir' : 'Anexar prova'
  if (e.status === STATUS.validacao) return 'Conferir'
  return null
}

/** Briefing do gestor: texto do projeto ou anexos/atualizações fora de etapa. */
const temBriefing = (p: Projeto, atualizacoes: Atualizacao[]) =>
  Boolean(p.briefing.trim()) || atualizacoes.some((a) => a.projetoId === p.id && !a.etapaId)

const DIA = 86400000
const diaDe = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
/** Dias corridos entre a data (ISO) e `hoje` (`aaaa-mm-dd`). */
export const diasDesde = (iso: string, hoje: string) => Math.round((diaDe(hoje) - diaDe(iso)) / DIA)

/** Parado: não está pronto nem pausado e a última atualização da etapa tem mais de 7 dias (sem atualização não conta). */
export function parada(e: Etapa, atualizacoes: Atualizacao[], hoje: string): boolean {
  if (!aberta(e)) return false
  const u = daEtapa(atualizacoes, e.id)[0]
  return u != null && diasDesde(u.data, hoje) > DIAS_PARADO
}

/**
 * "Precisa de mim" (só o Renan; para o gestor nada conta e a tela esconde o filtro): projeto para conferir,
 * publicado no PROD sem prova (e não pronto), ou com briefing do gestor e sem etapa.
 */
export function precisaDeMim(perfil: Perfil, p: Projeto, e: Etapa | null, atualizacoes: Atualizacao[]): boolean {
  if (perfil !== 'renan') return false
  if (!e) return temBriefing(p, atualizacoes)
  return e.status === STATUS.validacao || (Boolean(e.publicadoProd) && aberta(e) && !podeConcluir(atualizacoes, e.id))
}

export type Situacao = { rotulo: string; tom: StatusTone }

/** Pílula da lista: rótulo curto da situação ("Pronto · N provas" quando concluído, "No PROD" quando publicado e aberto). */
export function situacao(e: Etapa | null, atualizacoes: Atualizacao[]): Situacao {
  if (!e) return { rotulo: statusLabel(STATUS.ideia), tom: statusTone(STATUS.ideia) }
  if (e.status === STATUS.concluida) {
    const n = provas(daEtapa(atualizacoes, e.id)).reduce((soma, a) => soma + a.anexos.length, 0)
    return { rotulo: n ? `${statusLabel(e.status)} · ${n} ${n === 1 ? 'prova' : 'provas'}` : statusLabel(e.status), tom: statusTone(e.status) }
  }
  if (e.publicadoProd && aberta(e)) return { rotulo: 'No PROD', tom: 'warning' }
  return { rotulo: statusLabel(e.status), tom: statusTone(e.status) }
}

/** "O que falta": o nome da etapa; vazio cai na ação pendente, no brief a montar ou em "—". */
export function oQueFalta(p: Projeto, e: Etapa | null, atualizacoes: Atualizacao[]): string {
  if (e?.nome.trim()) return e.nome
  if (e) return acaoPendente(e, atualizacoes) ?? '—'
  return temBriefing(p, atualizacoes) ? 'Montar o brief' : '—'
}

const concluidaComProva = (e: Etapa, atualizacoes: Atualizacao[]) => e.status === STATUS.concluida && podeConcluir(atualizacoes, e.id)

export const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'mim', label: 'Precisa de mim' },
  { value: 'validacao', label: 'Conferir' },
  { value: 'parados', label: 'Parados' },
  { value: 'provas', label: 'Prontos com prova' },
] as const
export type Filtro = (typeof FILTROS)[number]['value']
export const ehFiltro = (v: string): v is Filtro => FILTROS.some((f) => f.value === v)

type Ctx = { projetos: Projeto[]; etapas: Etapa[]; atualizacoes: Atualizacao[]; perfil: Perfil; hoje: string }

function passa(filtro: Filtro, p: Projeto, e: Etapa | null, c: Ctx) {
  switch (filtro) {
    case 'todos': return true
    case 'mim': return precisaDeMim(c.perfil, p, e, c.atualizacoes)
    case 'validacao': return e?.status === STATUS.validacao
    case 'parados': return e != null && parada(e, c.atualizacoes, c.hoje)
    case 'provas': return e != null && concluidaComProva(e, c.atualizacoes)
  }
}

/** Contagem de cada filtro rápido, em projetos. */
export function contagens(c: Ctx): Record<Filtro, number> {
  const out = {} as Record<Filtro, number>
  for (const { value } of FILTROS) out[value] = c.projetos.filter((p) => passa(value, p, etapaDoProjeto(c.etapas, p.id), c)).length
  return out
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Palavras da busca (todas precisam aparecer), sem acento e sem caixa. */
export const palavras = (q: string) => normalizar(q).split(/\s+/).filter(Boolean)

export type Linha = { projeto: Projeto; etapa: Etapa | null; situacao: Situacao; falta: string }

/** Uma linha por projeto (ordem de código), com o filtro rápido e a busca aplicados. */
export function linhas(c: Ctx & { filtro: Filtro; busca: string }): Linha[] {
  const ws = palavras(c.busca)
  const ordem = (a: Projeto, b: Projeto) => (ordemDoCodigo(a.codigo) ?? Infinity) - (ordemDoCodigo(b.codigo) ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR')
  const out: Linha[] = []
  for (const p of [...c.projetos].sort(ordem)) {
    const etapa = etapaDoProjeto(c.etapas, p.id)
    if (!passa(c.filtro, p, etapa, c)) continue
    const falta = oQueFalta(p, etapa, c.atualizacoes)
    const texto = normalizar(`${p.codigo} ${p.nome} ${p.area} ${p.responsavel} ${p.briefing} ${etapa?.nome ?? ''}`)
    if (!ws.every((w) => texto.includes(w))) continue
    out.push({ projeto: p, etapa, situacao: situacao(etapa, c.atualizacoes), falta })
  }
  return out
}

/** Sigla do avatar do autor: R (Renan), G (Gestor), IA (Agente). */
export const siglaAutor = (autor: number) => (autor === AUTOR.renan ? 'R' : autor === AUTOR.agente ? 'IA' : 'G')

/** Motivo do "Concluir" desabilitado; null = pode concluir. */
export function motivoSemConcluir(perfil: Perfil, e: Etapa, atualizacoes: Atualizacao[]): string | null {
  if (e.status === STATUS.concluida) return 'já pronto'
  if (perfil !== 'renan') return 'só o Renan'
  if (!podeConcluir(atualizacoes, e.id)) return 'falta prova'
  return null
}

/** Atualizações do projeto fora de etapa (briefing). */
export const doBriefing = (atualizacoes: Atualizacao[], projetoId: string) => doProjeto(atualizacoes, projetoId).filter((a) => !a.etapaId)
