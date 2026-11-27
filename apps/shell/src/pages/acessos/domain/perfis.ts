import { AREAS, AREA_LABEL, ehArea, NIVEL_LABEL, PERFIL_LABEL, nomeDoPapel, type Nivel, type Perfil, type PerfisDeArea } from '../../../app/acessos'
import type { AmploHistorico, ErroApi, Historico, ItemPedido, PerfisPessoa } from './types'

/** JSON do pedido (e do histórico): áreas na ordem fixa, Administrador de acessos no fim. Lista vazia = só o Base. */
export function paraPedido(p: PerfisPessoa): ItemPedido[] {
  const itens: ItemPedido[] = AREAS.flatMap((area) => { const nivel = p.areas[area]; return nivel ? [{ perfil: area, nivel }] : [] })
  return p.acessos ? [...itens, { perfil: 'acessos' }] : itens
}

/** Lê o JSON gravado no histórico; texto inválido ou item desconhecido não derruba a tela. */
export function doPedido(texto: unknown): PerfisPessoa {
  let itens: unknown = null
  try { itens = typeof texto === 'string' ? JSON.parse(texto) : null } catch { itens = null }
  const areas: PerfisDeArea = {}
  let acessos = false
  for (const item of Array.isArray(itens) ? (itens as { perfil?: unknown; nivel?: unknown }[]) : []) {
    if (item?.perfil === 'acessos') acessos = true
    else if (ehArea(item?.perfil)) areas[item.perfil] = item.nivel === 'gestor' ? 'gestor' : 'operador'
  }
  return { areas, acessos }
}

/** Lê `cr40f_amplo`; texto vazio ou inválido = sem retirada nem devolução. */
export function doAmplo(texto: unknown): AmploHistorico | null {
  let obj: { acao?: unknown; papeis?: unknown } | null
  try { obj = typeof texto === 'string' && texto.trim() ? (JSON.parse(texto) as { acao?: unknown; papeis?: unknown } | null) : null } catch { obj = null }
  if (!obj || (obj.acao !== 'retirar' && obj.acao !== 'devolver' && obj.acao !== 'encerrar' && obj.acao !== 'reativar')) return null
  const papeis = (Array.isArray(obj.papeis) ? (obj.papeis as { id?: unknown; nome?: unknown }[]) : []).map((p) => ({ id: String(p?.id ?? ''), nome: String(p?.nome ?? '') })).filter((p) => p.nome)
  return { acao: obj.acao, papeis }
}

/** Última entrada de acesso amplo da pessoa (histórico do mais novo ao mais velho), sem a retirada vazia (não tirou papel nenhum) e sem encerrar/reativar (o Devolver do servidor também os ignora). Só ela pode ser devolvida, e só se for retirada. */
export const ultimaDoAmplo = (historico: Historico[], usuarioId: string): Historico | undefined =>
  historico.find((h) => h.usuarioId === usuarioId && h.amplo && (h.amplo.acao === 'retirar' || h.amplo.acao === 'devolver') && !(h.amplo.acao === 'retirar' && !h.amplo.papeis.length))

export function amploTexto(amplo: AmploHistorico): string {
  const nomes = amplo.papeis.map((p) => p.nome).join(', ')
  const rotulo = { retirar: 'Acesso amplo retirado', devolver: 'Acesso amplo devolvido', encerrar: 'Encerrado', reativar: 'Reativado' }[amplo.acao]
  return `${rotulo}${nomes ? `: ${nomes}` : ''}`
}

export const iguais = (a: PerfisPessoa, b: PerfisPessoa) => a.acessos === b.acessos && AREAS.every((area) => a.areas[area] === b.areas[area])

const nivelTexto = (nivel: Nivel | undefined) => (nivel ? NIVEL_LABEL[nivel] : 'sem acesso')
const simNao = (v: boolean) => (v ? 'sim' : 'não')

/** Uma linha por diferença, para o resumo "O que muda ao salvar" e para o histórico. */
export function oQueMuda(antes: PerfisPessoa, depois: PerfisPessoa): string[] {
  const linhas = AREAS.filter((area) => antes.areas[area] !== depois.areas[area]).map((area) => `${AREA_LABEL[area]}: ${nivelTexto(antes.areas[area])} → ${nivelTexto(depois.areas[area])}`)
  if (antes.acessos !== depois.acessos) linhas.push(`${PERFIL_LABEL.acessos}: ${simNao(antes.acessos)} → ${simNao(depois.acessos)}`)
  return linhas
}

/** Texto dos chips da lista. */
export function rotulos(p: PerfisPessoa): string[] {
  const areas = AREAS.flatMap((area) => { const nivel = p.areas[area]; return nivel ? [`${AREA_LABEL[area]} · ${NIVEL_LABEL[nivel]}`] : [] })
  return p.acessos ? [...areas, PERFIL_LABEL.acessos] : areas
}

/** O plugin responde `CODIGO: mensagem`; o cliente do Dataverse embrulha isso em outros textos. */
export function erroDaApi(reason: unknown): ErroApi {
  const texto = reason instanceof Error ? reason.message : String(reason)
  const m = /([A-Z_]{4,}): ([^|]*)/.exec(texto)
  return m ? { codigo: m[1], mensagem: m[2].trim() } : { codigo: null, mensagem: texto }
}

/** Perfis citados num `PERFIL_INDISPONIVEL` (a mensagem traz os nomes dos papéis que faltam no ambiente). */
export function perfisIndisponiveis(erro: ErroApi): Perfil[] {
  if (erro.codigo !== 'PERFIL_INDISPONIVEL') return []
  const areas: Perfil[] = AREAS.filter((area) => erro.mensagem.includes(nomeDoPapel(area, 'operador')) || erro.mensagem.includes(nomeDoPapel(area, 'gestor')))
  return erro.mensagem.includes('Perfil - Administrador de acessos') ? [...areas, 'acessos'] : areas
}
