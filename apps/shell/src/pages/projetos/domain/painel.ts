import { AUTOR, STATUS } from './choices'
import { ehAudio, ehImagem, ehVideo } from './anexos'
import { aberta, atrasada, daEtapa, doProjeto, etapasDo, ordemDoCodigo, podeConcluir, provas } from './regras'
import type { Anexo, Atualizacao, Etapa, Perfil, Projeto } from './types'

/** As 5 fases da trilha, na ordem: Ideia → Fazendo → DEV → PROD → Prova. */
export const FASES = ['Ideia', 'Fazendo', 'DEV', 'PROD', 'Prova'] as const
export type NumFase = 1 | 2 | 3 | 4 | 5

/** Dias sem atualização a partir dos quais a etapa aberta conta como parada. */
export const DIAS_PARADO = 7

/**
 * Fase da etapa: Ideia = 1, Em andamento = 2, Em validação = 3, `cr40f_publicadoprod` preenchido sem Concluída = 4,
 * Concluída = 5. Pausada = null (trilha sem destaque).
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
  const codigo = e.codigo || 'Etapa'
  if (f == null) return { fase: null, rotulo: '', tom: null, descricao: `${codigo}: pausada` }
  const itens = daEtapa(atualizacoes, e.id)
  let rotulo: string
  let tom: TomFase
  if (f === 5) { const p = provas(itens)[0]; rotulo = p ? ddmm(p.data) : 'Prova'; tom = 'ok' }
  else if (f === 4) { rotulo = ddmm(e.publicadoProd as string); tom = 'prod' }
  else if (f === 3) { rotulo = 'Conferir'; tom = 'dev' }
  else if (f === 2) { rotulo = `${e.andamento}%`; tom = 'fazendo' }
  else { rotulo = itens.length ? 'Brief' : 'Ideia'; tom = 'ideia' }
  if (f < 5 && atrasada(e, hoje)) { rotulo = 'Vencido'; tom = 'vencido' }
  const descricao = `${codigo}: fase ${f} de 5, ${FASES[f - 1]}${tom === 'vencido' ? ', prazo vencido' : rotulo !== FASES[f - 1] ? ` (${rotulo})` : ''}`
  return { fase: f, rotulo, tom, descricao }
}

/** Ação que a etapa espera agora; null = nada pendente. */
export function acaoPendente(e: Etapa, atualizacoes: Atualizacao[]): string | null {
  if (!aberta(e)) return null
  if (e.publicadoProd) return podeConcluir(atualizacoes, e.id) ? 'Concluir' : 'Anexar prova'
  if (e.status === STATUS.validacao) return 'Conferir'
  if (e.status === STATUS.ideia && daEtapa(atualizacoes, e.id).length) return 'Montar brief'
  return null
}

/** Briefing do gestor: texto do projeto ou anexos/atualizações fora de etapa. */
const temBriefing = (p: Projeto, atualizacoes: Atualizacao[]) =>
  Boolean(p.briefing.trim()) || atualizacoes.some((a) => a.projetoId === p.id && !a.etapaId)

const DIA = 86400000
const diaDe = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
/** Dias corridos entre a data (ISO) e `hoje` (`aaaa-mm-dd`). */
export const diasDesde = (iso: string, hoje: string) => Math.round((diaDe(hoje) - diaDe(iso)) / DIA)

/** Última atualização da etapa, ou null. */
export const ultimaDaEtapa = (atualizacoes: Atualizacao[], etapaId: string) => daEtapa(atualizacoes, etapaId)[0] ?? null

/** Etapa parada: não está concluída nem pausada e a última atualização tem mais de 7 dias (sem atualização não conta). */
export function parada(e: Etapa, atualizacoes: Atualizacao[], hoje: string): boolean {
  if (!aberta(e)) return false
  const u = ultimaDaEtapa(atualizacoes, e.id)
  return u != null && diasDesde(u.data, hoje) > DIAS_PARADO
}

/**
 * "Precisa de mim". Renan: etapa em validação para conferir, etapa publicada no PROD sem prova (e não concluída)
 * e briefing do gestor sem etapas. A regra é só do Renan: para o gestor nada conta (a tela esconde o filtro).
 */
export function precisaDeMim(perfil: Perfil, e: Etapa, atualizacoes: Atualizacao[]): boolean {
  if (perfil !== 'renan') return false
  return e.status === STATUS.validacao || (Boolean(e.publicadoProd) && aberta(e) && !podeConcluir(atualizacoes, e.id))
}
export function projetoPrecisaDeMim(perfil: Perfil, p: Projeto, etapas: Etapa[], atualizacoes: Atualizacao[]): boolean {
  if (perfil !== 'renan') return false
  return !etapas.some((e) => e.projetoId === p.id) && temBriefing(p, atualizacoes)
}

const concluidaComProva = (e: Etapa, atualizacoes: Atualizacao[]) => e.status === STATUS.concluida && podeConcluir(atualizacoes, e.id)

export const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'mim', label: 'Precisa de mim' },
  { value: 'validacao', label: 'Em validação' },
  { value: 'parados', label: 'Parados' },
  { value: 'provas', label: 'Concluídos com prova' },
] as const
export type Filtro = (typeof FILTROS)[number]['value']
export const ehFiltro = (v: string): v is Filtro => FILTROS.some((f) => f.value === v)

type Dados = { projetos: Projeto[]; etapas: Etapa[]; atualizacoes: Atualizacao[] }
type Ctx = Dados & { perfil: Perfil; hoje: string }

function passaEtapa(filtro: Filtro, e: Etapa, c: Ctx) {
  switch (filtro) {
    case 'todos': return true
    case 'mim': return precisaDeMim(c.perfil, e, c.atualizacoes)
    case 'validacao': return e.status === STATUS.validacao
    case 'parados': return parada(e, c.atualizacoes, c.hoje)
    case 'provas': return concluidaComProva(e, c.atualizacoes)
  }
}

/**
 * Contagem de cada filtro rápido: etapas que passam; "Todos" e "Precisa de mim" somam também o projeto sem etapas
 * (em "Precisa de mim", só o que tem briefing do gestor).
 */
export function contagens(c: Ctx): Record<Filtro, number> {
  const semEtapas = c.projetos.filter((p) => !c.etapas.some((e) => e.projetoId === p.id))
  const out = {} as Record<Filtro, number>
  for (const { value } of FILTROS) out[value] = c.etapas.filter((e) => passaEtapa(value, e, c)).length
  out.todos += semEtapas.length
  out.mim += semEtapas.filter((p) => projetoPrecisaDeMim(c.perfil, p, c.etapas, c.atualizacoes)).length
  return out
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Palavras da busca (todas precisam aparecer), sem acento e sem caixa. */
export const palavras = (q: string) => normalizar(q).split(/\s+/).filter(Boolean)
const casa = (texto: string, ws: string[]) => { const t = normalizar(texto); return ws.every((w) => t.includes(w)) }

export type Grupo = {
  projeto: Projeto
  etapas: Etapa[]
  total: number
  concluidas: number
  /** Partes da barra (fração de 0 a 1): concluídas, em validação ou no PROD, em andamento. */
  barra: { ok: number; dev: number; fazendo: number }
  ultima: Atualizacao | null
  /** Dias desde a última atualização quando há etapa aberta e passou de 7 dias; null = não está parado. */
  paradoHa: number | null
  acao: string | null
}

/** Lista agrupada por projeto (ordem de código), com o filtro rápido e a busca aplicados. */
export function agrupar(c: Ctx & { filtro: Filtro; busca: string }): Grupo[] {
  const ws = palavras(c.busca)
  const ordem = (a: Projeto, b: Projeto) => (ordemDoCodigo(a.codigo) ?? Infinity) - (ordemDoCodigo(b.codigo) ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR')
  const out: Grupo[] = []
  for (const p of [...c.projetos].sort(ordem)) {
    const todas = etapasDo(c.etapas, p.id)
    const projetoCasa = !ws.length || casa(`${p.codigo} ${p.nome} ${p.area} ${p.responsavel} ${p.briefing}`, ws)
    const visiveis = todas.filter((e) => passaEtapa(c.filtro, e, c) && (projetoCasa || casa(`${e.codigo} ${e.nome}`, ws)))
    const projetoSozinho = !todas.length && projetoCasa && (c.filtro === 'todos' || (c.filtro === 'mim' && projetoPrecisaDeMim(c.perfil, p, c.etapas, c.atualizacoes)))
    if (!visiveis.length && !projetoSozinho) continue
    const total = todas.length
    const conta = (f: (e: Etapa) => boolean) => (total ? todas.filter(f).length / total : 0)
    const ultima = doProjeto(c.atualizacoes, p.id)[0] ?? null
    const abertas = todas.some(aberta)
    const dias = ultima ? diasDesde(ultima.data, c.hoje) : null
    out.push({
      projeto: p,
      etapas: visiveis,
      total,
      concluidas: todas.filter((e) => e.status === STATUS.concluida).length,
      barra: { ok: conta((e) => fase(e) === 5), dev: conta((e) => fase(e) === 3 || fase(e) === 4), fazendo: conta((e) => fase(e) === 2) },
      ultima,
      paradoHa: abertas && dias != null && dias > DIAS_PARADO ? dias : null,
      acao: projetoPrecisaDeMim(c.perfil, p, c.etapas, c.atualizacoes) ? 'Montar brief' : null,
    })
  }
  return out
}

/** "hoje 09:40", "ontem" ou "dd/mm". */
export function quandoCurto(iso: string, hoje: string) {
  const d = diasDesde(iso, hoje)
  if (d <= 0) return `hoje ${iso.slice(11, 16)}`
  if (d === 1) return 'ontem'
  return ddmm(iso)
}

/** Sigla do avatar do autor: R (Renan), G (Gestor), IA (Agente). */
export const siglaAutor = (autor: number) => (autor === AUTOR.renan ? 'R' : autor === AUTOR.agente ? 'IA' : 'G')

export type TipoProva = 'print' | 'video' | 'audio'
export const tipoDoAnexo = (a: Pick<Anexo, 'tipo'>): TipoProva | null =>
  ehImagem(a.tipo) ? 'print' : ehVideo(a.tipo) ? 'video' : ehAudio(a.tipo) ? 'audio' : null

export type ItemProva = { anexo: Anexo; atualizacao: Atualizacao; etapa: Etapa | null; projeto: Projeto | null }

/** Galeria de provas: cada anexo das atualizações marcadas como prova, mais recente primeiro, com filtro por projeto e tipo. */
export function galeriaDeProvas(d: Dados, filtro: { projetoId?: string | null; tipo?: TipoProva | null } = {}): ItemProva[] {
  const out: ItemProva[] = []
  for (const a of provas(d.atualizacoes).sort((x, y) => y.data.localeCompare(x.data))) {
    if (filtro.projetoId && a.projetoId !== filtro.projetoId) continue
    for (const anexo of a.anexos) {
      if (filtro.tipo && tipoDoAnexo(anexo) !== filtro.tipo) continue
      out.push({ anexo, atualizacao: a, etapa: d.etapas.find((e) => e.id === a.etapaId) ?? null, projeto: d.projetos.find((p) => p.id === a.projetoId) ?? null })
    }
  }
  return out
}

/** Motivo do "Concluir" desabilitado; null = pode concluir. */
export function motivoSemConcluir(perfil: Perfil, e: Etapa, atualizacoes: Atualizacao[]): string | null {
  if (e.status === STATUS.concluida) return 'já concluída'
  if (perfil !== 'renan') return 'só o Renan'
  if (!podeConcluir(atualizacoes, e.id)) return 'falta prova'
  return null
}
