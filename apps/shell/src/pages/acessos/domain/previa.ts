import { PERFIL_LABEL, TODOS, type Acessos, type Perfil } from '../../../app/acessos'
import colunasJson from '../../../nav/acessosColunas.json'
import { menuVisivel, perfisDoItem } from '../../../nav/acessosMenu'
import mapaJson from '../../../nav/acessosMapa.json'
import type { PerfisPessoa } from './types'

/** Resposta da Custom API `cr40f_AcessoPrevia` (contrato em docs/features/acessos-o-que-perde/spec.md). `rotulo` = nome de exibição da tabela (o lógico quando a metadata não tem); nulo no privilégio avulso. */
export type Perda = { chave: string; tabela: string | null; rotulo: string | null; perde: string[]; incerto: boolean }
export type DireitoDeColuna = 'ler' | 'criar' | 'gravar'
export type ColunaPerdida = { tabela?: string; rotulo?: string | null; coluna: string; perde: DireitoDeColuna[]; incerto: boolean }
/** `dona` falso = coproprietária (compartilhado com ela). */
export type FlowParado = { nome: string; tipo: 'admin' | 'tabela' | 'incerto'; dona: boolean }
/** `limitado` = a contagem parou no teto do servidor (5000): há pelo menos esse tanto. */
export type Grupo = { nome: string; perdeDonos: number | null; limitado: boolean }
export type Previa = {
  admin: { antes: boolean; depois: boolean }
  perdas: Perda[]
  colunas: ColunaPerdida[]
  grupos: Grupo[]
  apps: { nome: string }[]
  flows: FlowParado[]
  conexoes: { nome: string }[]
}
export type Uso = { tabela: string; registros: number | null; limitado: boolean; incerto: boolean }

const DIREITOS: DireitoDeColuna[] = ['ler', 'criar', 'gravar']

const LISTAS = ['perdas', 'colunas', 'grupos', 'apps', 'flows', 'conexoes'] as const

function json(resultado: string): Record<string, unknown> {
  const obj: unknown = JSON.parse(resultado)
  if (!obj || typeof obj !== 'object') throw new Error('Resposta da prévia sem o formato esperado.')
  return obj as Record<string, unknown>
}

/** Confia no contrato; resposta sem o formato vira falha da prévia ("não deu para medir"), nunca "não perde nada". */
export function lerPrevia(resultado: string): Previa {
  const o = json(resultado)
  const admin = o.admin as Previa['admin'] | undefined
  if (typeof admin?.antes !== 'boolean' || typeof admin.depois !== 'boolean' || LISTAS.some((k) => !Array.isArray(o[k]))) throw new Error('Resposta da prévia sem o formato esperado.')
  return o as unknown as Previa
}

export function lerUso(resultado: string): Uso[] {
  const uso = json(resultado).uso
  if (!Array.isArray(uso)) throw new Error('Resposta do uso sem o formato esperado.')
  return uso as Uso[]
}

const ACAO: Record<string, string> = { Read: 'ver', Create: 'criar', Write: 'editar', Delete: 'excluir', Append: 'vincular', AppendTo: 'vincular', Assign: 'atribuir', Share: 'compartilhar', Use: 'usar' }
const ORDEM_ACAO = ['ver', 'criar', 'editar', 'excluir', 'vincular', 'atribuir', 'compartilhar', 'usar']

/** Ações em português, na ordem de leitura, sem repetir (Append e AppendTo viram "vincular"). */
export function acoes(perde: string[]): string[] {
  const nomes = new Set(perde.map((t) => ACAO[t] ?? t.toLowerCase()))
  return [...ORDEM_ACAO.filter((a) => nomes.has(a)), ...[...nomes].filter((a) => !ORDEM_ACAO.includes(a))]
}

/** Rótulo de cada grupo de `acessosColunas.json`; o teste do domínio falha se entrar grupo sem rótulo. */
export const GRUPO_ROTULO: Record<string, string> = { basico: 'dados básicos', cnh: 'CNH', rh: 'dados de RH', pessoal: 'dados pessoais', operacao: 'operação', patrimonio: 'patrimônio', cotacao: 'cotação', composicao: 'composição', valor: 'valores', cr: 'CR', pdf: 'PDF', prova: 'prova' }
const GRUPOS: Record<string, Record<string, string[]>> = colunasJson.grupos

const OUTRAS = 'Outras colunas'
export const semPrefixo = (nome: string) => nome.replace(/^(cr40f|new)_/, '')

/** Grupo da coluna: `Funcionários: dados pessoais`; fora do JSON vira "Outras colunas". */
export function rotuloDaColuna(c: ColunaPerdida): string {
  const [tabelaRef, ...resto] = c.coluna.split('.')
  const tabela = c.tabela ?? (resto.length ? tabelaRef : '')
  const coluna = resto.length ? resto.join('.') : c.coluna
  const grupo = Object.entries(GRUPOS[tabela] ?? {}).find(([, colunas]) => colunas.includes(coluna))?.[0]
  return grupo ? `${c.rotulo ?? semPrefixo(tabela)}: ${GRUPO_ROTULO[grupo] ?? grupo}` : OUTRAS
}

type Modulo = Record<string, string[]>
const MODULOS = mapaJson.modulos as Record<string, Modulo>

/** Área "dona" de cada tabela do mapa: onde ela é dona ou filha; senão a primeira que a cita. */
const AREA_DA_TABELA = (() => {
  const mapa = new Map<string, Perfil>()
  for (const dona of [true, false]) {
    for (const [perfil, modulo] of Object.entries(MODULOS)) {
      for (const [categoria, tabelas] of Object.entries(modulo)) {
        if ((categoria === 'donas' || categoria === 'filhas') !== dona || !Array.isArray(tabelas)) continue
        for (const t of tabelas) if (!mapa.has(t)) mapa.set(t, perfil as Perfil)
      }
    }
  }
  return mapa
})()

export type ItemPerdido = { chave: string; nome: string; acoes: string[]; incerto: boolean; uso: Uso | null }
export type AreaPerdida = { perfil: Perfil; area: string; telas: string[]; itens: ItemPerdido[] }
export type Resumo = {
  telasSomem: string[]
  areas: AreaPerdida[]
  /** Sem tela no mapa (tabela fora dele ou privilégio avulso). */
  outras: ItemPerdido[]
  /** `acoes` = o que se perde no grupo (ver, criar, editar), somado das colunas. */
  colunas: { rotulo: string; incerto: boolean; nomes: string[]; acoes: string[] }[]
  apps: string[]
  flows: FlowParado[]
  conexoes: string[]
  grupos: Previa['grupos']
  vazio: boolean
  /** Perde leitura, coluna, app, flow ou conexão, perde algo que usou ou não deu para medir. Só ganho ou excluir sem uso salva direto. */
  precisaConfirmar: boolean
}

const menuDe = (admin: boolean, perfis: PerfisPessoa): Acessos => (admin ? TODOS : { admin: false, areas: perfis.areas, acessos: perfis.acessos })
const ACAO_DA_COLUNA: Record<DireitoDeColuna, string> = { ler: 'ver', criar: 'criar', gravar: 'editar' }

/** Junta a prévia do servidor com o menu antes e depois. `uso` nulo = não medido (ainda medindo ou falhou): toda perda de tabela pede confirmação.
 * Com lista, tabela perdida que não está nela sai "não deu para medir". */
export function montarResumo(previa: Previa, uso: Uso[] | null, atuais: PerfisPessoa, rascunho: PerfisPessoa): Resumo {
  const antes = menuVisivel(menuDe(previa.admin.antes, atuais))
  const depois = menuVisivel(menuDe(previa.admin.depois, rascunho))
  const ficam = new Set(depois.flatMap((g) => g.items.map((i) => i.id)))
  const telasSomem = antes.flatMap((g) => g.items).filter((i) => !ficam.has(i.id)).flatMap((i) => (i.label ? [i.label] : []))
  const telasDepois = depois.flatMap((g) => g.items)

  const usoPorTabela = new Map((uso ?? []).map((u) => [u.tabela, u]))
  const porArea = new Map<Perfil, ItemPerdido[]>()
  const outras: ItemPerdido[] = []
  let confirmar = uso === null && previa.perdas.some((p) => p.tabela)
  for (const p of previa.perdas) {
    const medido = p.tabela && uso ? usoPorTabela.get(p.tabela) ?? { tabela: p.tabela, registros: null, limitado: false, incerto: true } : null
    const item: ItemPerdido = { chave: p.chave, nome: p.rotulo ?? (p.tabela ? semPrefixo(p.tabela) : p.chave), acoes: acoes(p.perde), incerto: p.incerto, uso: medido }
    confirmar ||= p.perde.includes('Read') || p.incerto || (!!medido && (medido.incerto || medido.registros !== 0))
    const perfil = p.tabela ? AREA_DA_TABELA.get(p.tabela) : undefined
    if (perfil) porArea.set(perfil, [...(porArea.get(perfil) ?? []), item])
    else outras.push(item)
  }
  const areas = [...porArea].map(([perfil, itens]) => ({
    perfil,
    area: PERFIL_LABEL[perfil],
    telas: telasDepois.filter((t) => perfisDoItem(t.id)?.includes(perfil)).flatMap((t) => (t.label ? [t.label] : [])),
    itens,
  }))

  const porRotulo = new Map<string, Resumo['colunas'][number]>()
  for (const c of previa.colunas) {
    const rotulo = rotuloDaColuna(c)
    const atual = porRotulo.get(rotulo) ?? { rotulo, incerto: false, nomes: [], acoes: [] }
    atual.incerto ||= c.incerto
    atual.nomes.push(c.coluna)
    atual.acoes = DIREITOS.filter((d) => c.perde.includes(d) || atual.acoes.includes(ACAO_DA_COLUNA[d])).map((d) => ACAO_DA_COLUNA[d])
    porRotulo.set(rotulo, atual)
  }
  const colunas = [...porRotulo.values()].sort((a, b) => Number(a.rotulo === OUTRAS) - Number(b.rotulo === OUTRAS) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

  const apps = previa.apps.map((a) => a.nome)
  const perdeForaDasTabelas = colunas.length > 0 || apps.length > 0 || previa.flows.length > 0 || previa.conexoes.length > 0
  return {
    telasSomem, areas, outras, colunas, apps,
    flows: previa.flows,
    conexoes: previa.conexoes.map((c) => c.nome),
    grupos: previa.grupos,
    vazio: !previa.perdas.length && !perdeForaDasTabelas && !telasSomem.length,
    precisaConfirmar: confirmar || perdeForaDasTabelas,
  }
}

export function usoTexto(uso: Uso | null): string | null {
  if (!uso) return null
  if (uso.incerto || uso.registros === null) return 'não deu para medir'
  if (uso.registros === 0) return 'sem gravação em 90 dias (leitura não é registrada)'
  if (uso.limitado) return `criou ou alterou ${uso.registros}+ registros em 90 dias`
  return `criou ou alterou ${uso.registros} ${uso.registros === 1 ? 'registro' : 'registros'} em 90 dias`
}

/** "12 registros", "5000+ registros"; nulo quando não deu para contar. */
export function registrosTexto(n: number | null, limitado: boolean): string | null {
  if (n === null) return null
  return limitado ? `${n}+ registros` : `${n} ${n === 1 ? 'registro' : 'registros'}`
}

/** Teto do servidor por chamada; as tabelas além dele saem "não deu para medir". */
const MAX_TABELAS = 200
/** O servidor recusa `cr40f_segredo` no uso (um nome fora da lista derruba a medição inteira); ela fica "não deu para medir". */
const SEM_MEDIR = new Set(['cr40f_segredo'])
export const tabelasParaMedir = (previa: Previa): string[] => [...new Set(previa.perdas.flatMap((p) => (p.tabela && !SEM_MEDIR.has(p.tabela) ? [p.tabela] : [])))].slice(0, MAX_TABELAS)
