import type { Row } from '@betinhos/dataverse'
import { diaSP, formatBR, toDateOnly } from '../../frota/data/dates'
import { GRAU, STATUS_OPTIONS, TONE, label, type Tone } from '../../frota/data/schema'
import { atrasada, rotuloJanela, type Janela } from '../../frota/domain/janela'
import { parse } from './fetch'
import { parseLayout } from './layout'
import type { Column, View } from './types'

/**
 * Linhas de manutenção na Geral (manutenções v2, plano 3; spec 2026-11-16-manutencoes-v2-design.md, "Shell › Geral").
 * A linha é `cr40f_reservadeveculos` com `new_categoriadoitem` = Manutenção, ligada à manutenção por `cr40f_om`.
 */
export const CATEGORIA_ITEM = 'new_categoriadoitem'
export const CATEGORIA_MANUTENCAO = 100000001
export const MOTORISTA = 'cr40f_motorista'
export const SAIDA = 'cr40f_dataehorriodesada'
const FATURAMENTO = 'cr40f_statusdefaturamento'
/** Apelido do link-entity da manutenção na consulta: as colunas voltam como `bt_manut.<coluna>`. */
export const ALIAS_MANUTENCAO = 'bt_manut'
const TABELA_MANUTENCAO = 'cr40f_manutencoes'
const ID_MANUTENCAO = 'cr40f_manutencoesid'
const LIGACAO = 'cr40f_om'
/** Colunas da manutenção que o desenho da linha usa. */
export const COLUNAS_MANUTENCAO = ['cr40f_id', 'cr40f_descricao', 'cr40f_graudamanutencao', 'cr40f_status', 'cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_agendarpara'] as const
/** Campos da própria linha que o desenho usa mesmo quando a visão não mostra a coluna. */
export const CAMPOS_DA_LINHA = [CATEGORIA_ITEM, LIGACAO, 'cr40f_veiculo', MOTORISTA, SAIDA] as const

/**
 * Exceções ao padrão de "Mostrar manutenções", pelo id da visão do sistema em minúsculas. Vazio por decisão do Renan
 * (17/11/2026): as 13 visões do DEV seguem o critério automático, inclusive "A receber" (ligada) e "Visualização Mobile"
 * (desligada). Visões pessoais também usam o critério; o mapa é só para visões do sistema.
 */
export const PADRAO_POR_VISAO: Readonly<Record<string, boolean>> = {}

const VALOR = String(CATEGORIA_MANUTENCAO)
const ESCONDIDAS = `ne:${VALOR}|null:`
const MOSTRADAS = `eq:${VALOR}|ne:${VALOR}|null:`
type Marca = 'escondidas' | 'mostradas'
const filhos = (el: Element) => Array.from(el.children)
const texto = (doc: Document) => new XMLSerializer().serializeToString(doc)

/** `<filter type="or">` só com condições de categoria, no formato que o shell grava; qualquer outro formato não é a marca. */
function lerMarca(el: Element): Marca | null {
  if (el.tagName !== 'filter' || el.getAttribute('type') !== 'or') return null
  const condicoes = filhos(el)
  if (!condicoes.length || condicoes.some((c) => c.tagName !== 'condition' || c.getAttribute('attribute') !== CATEGORIA_ITEM)) return null
  const chave = condicoes.map((c) => `${c.getAttribute('operator')}:${c.getAttribute('value') ?? ''}`).sort().join('|')
  return chave === ESCONDIDAS ? 'escondidas' : chave === MOSTRADAS ? 'mostradas' : null
}

/** Desligado: `ne` ou `null` (o `ne` sozinho não devolve linha sem categoria). Ligado: a tautologia que nomeia a manutenção. */
function criarMarca(doc: Document, mostrar: boolean) {
  const filtro = doc.createElement('filter')
  filtro.setAttribute('type', 'or')
  const operadores: [string, string | null][] = mostrar ? [['eq', VALOR], ['ne', VALOR], ['null', null]] : [['ne', VALOR], ['null', null]]
  for (const [operador, valor] of operadores) {
    const condicao = doc.createElement('condition')
    condicao.setAttribute('attribute', CATEGORIA_ITEM)
    condicao.setAttribute('operator', operador)
    if (valor != null) condicao.setAttribute('value', valor)
    filtro.appendChild(condicao)
  }
  return filtro
}

/**
 * Padrão da visão sem marca (D2): ligado quando ela é de programação (mostra a coluna Motorista ou filtra o motorista)
 * e não é de faturamento (nenhuma condição em `cr40f_statusdefaturamento`).
 */
export function padraoManutencoes(view: Pick<View, 'id' | 'fetchxml' | 'layoutxml'>, excecoes: Readonly<Record<string, boolean>> = PADRAO_POR_VISAO): boolean {
  const excecao = excecoes[view.id.toLowerCase()]
  if (excecao !== undefined) return excecao
  const { entity } = parse(view.fetchxml)
  // Só as condições da entidade raiz (filtros dela, aninhados ou não): condição dentro de um link-entity é de outra tabela.
  const filtra = (attribute: string) => entity.querySelector(`:scope > filter condition[attribute="${attribute}"]`) != null
  const mostraMotorista = parseLayout(view.layoutxml).some((c) => !c.alias && c.attribute === MOTORISTA)
  return (mostraMotorista || filtra(MOTORISTA)) && !filtra(FATURAMENTO)
}

/** "Mostrar manutenções" da visão e o FetchXML dela sem a marca (o que a tela usa para filtros, busca e consulta). */
export type ManutencoesDaVisao = { fetchxml: string; mostrar: boolean; gravado: boolean }

/** Lê a marca gravada (e a tira do FetchXML); sem marca, o padrão da visão. FetchXML inválido fica como veio, desligado. */
export function lerManutencoesDaVisao(view: Pick<View, 'id' | 'fetchxml' | 'layoutxml'>): ManutencoesDaVisao {
  try {
    const { doc, entity } = parse(view.fetchxml)
    let marca: Marca | null = null
    for (const filtro of filhos(entity)) {
      const lida = lerMarca(filtro)
      if (!lida) continue
      marca = lida
      filtro.remove()
    }
    if (!marca) return { fetchxml: view.fetchxml, mostrar: padraoManutencoes(view), gravado: false }
    return { fetchxml: texto(doc), mostrar: marca === 'mostradas', gravado: true }
  } catch {
    return { fetchxml: view.fetchxml, mostrar: false, gravado: false }
  }
}

/** FetchXML para gravar na visão com o liga/desliga explícito; a marca anterior, se houver, sai. */
export function gravarManutencoesNaVisao(fetchxml: string, mostrar: boolean): string {
  const { doc, entity } = parse(fetchxml)
  for (const filtro of filhos(entity)) if (lerMarca(filtro)) filtro.remove()
  entity.appendChild(criarMarca(doc, mostrar))
  return texto(doc)
}

/**
 * FetchXML da consulta. Ligado: os campos da linha e o link-entity outer da manutenção (N:1 por `cr40f_om`, não muda a
 * contagem nem a paginação). Desligado: o filtro que tira só a categoria Manutenção.
 */
export function aplicarManutencoes(fetchxml: string, mostrar: boolean): string {
  const { doc, entity } = parse(fetchxml)
  if (!mostrar) {
    entity.appendChild(criarMarca(doc, false))
    return texto(doc)
  }
  const atuais = filhos(entity)
  if (!atuais.some((c) => c.tagName === 'all-attributes')) {
    for (const nome of CAMPOS_DA_LINHA) {
      if (atuais.some((c) => c.tagName === 'attribute' && c.getAttribute('name') === nome)) continue
      const atributo = doc.createElement('attribute')
      atributo.setAttribute('name', nome)
      entity.insertBefore(atributo, entity.firstChild)
    }
  }
  if (!atuais.some((c) => c.tagName === 'link-entity' && c.getAttribute('alias') === ALIAS_MANUTENCAO)) {
    const link = doc.createElement('link-entity')
    link.setAttribute('name', TABELA_MANUTENCAO)
    link.setAttribute('from', ID_MANUTENCAO)
    link.setAttribute('to', LIGACAO)
    link.setAttribute('link-type', 'outer')
    link.setAttribute('alias', ALIAS_MANUTENCAO)
    for (const nome of COLUNAS_MANUTENCAO) {
      const atributo = doc.createElement('attribute')
      atributo.setAttribute('name', nome)
      link.appendChild(atributo)
    }
    entity.appendChild(link)
  }
  return texto(doc)
}

const F = '@OData.Community.Display.V1.FormattedValue'
const doLink = (coluna: (typeof COLUNAS_MANUTENCAO)[number]) => `${ALIAS_MANUTENCAO}.${coluna}`
const valorTexto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const valorNumero = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** O que o desenho da linha de manutenção mostra (tabela e cards). */
export type LinhaManutencao = {
  manutencaoId: string
  codigo: string | null
  veiculo: string
  descricao: string
  grau: string | null
  status: number | null
  statusRotulo: string
  statusTom: Tone
  janela: Janela | null
  janelaRotulo: string
  atrasada: boolean
  /** Saída programada fora da janela do encaixe: avisa, não bloqueia (spec). */
  foraDaJanela: boolean
}

export const ehLinhaDeManutencao = (row: Row) => valorNumero(row[CATEGORIA_ITEM]) === CATEGORIA_MANUTENCAO && valorTexto(row[`_${LIGACAO}_value`]) != null

/**
 * Resumo da linha de manutenção; `null` para serviço, troca ou linha de manutenção sem a ligação `cr40f_om` (sem gaveta
 * para abrir, ela aparece como linha comum). Link vazio com `cr40f_om` preenchido não derruba: rótulos legíveis no lugar.
 * `cr40f_agendarpara` é UserLocal e chega em UTC: `toDateOnly` o converte para a data de São Paulo antes de comparar.
 */
export function lerLinhaManutencao(row: Row, hoje: string): LinhaManutencao | null {
  if (!ehLinhaDeManutencao(row)) return null
  const status = valorNumero(row[doLink('cr40f_status')])
  const grau = valorNumero(row[doLink('cr40f_graudamanutencao')])
  const inicio = toDateOnly(row[doLink('cr40f_janelainicio')], 'DateOnly')
  const fim = toDateOnly(row[doLink('cr40f_janelafim')], 'DateOnly')
  const agendarPara = toDateOnly(row[doLink('cr40f_agendarpara')], 'UserLocal')
  const janela: Janela | null = inicio && fim ? { inicio, fim } : null
  const saida = diaSP(valorTexto(row[SAIDA]))
  return {
    manutencaoId: String(row[`_${LIGACAO}_value`]).replace(/[{}]/g, ''),
    codigo: valorTexto(row[doLink('cr40f_id')]),
    veiculo: valorTexto(row[`_cr40f_veiculo_value${F}`]) ?? 'Sem veículo',
    descricao: valorTexto(row[doLink('cr40f_descricao')]) ?? 'Sem descrição',
    grau: grau == null ? null : label(GRAU, grau, valorTexto(row[`${doLink('cr40f_graudamanutencao')}${F}`]) ?? String(grau)),
    status,
    statusRotulo: status == null ? 'Sem status' : label(STATUS_OPTIONS.manutencao, status, valorTexto(row[`${doLink('cr40f_status')}${F}`]) ?? String(status)),
    statusTom: status == null ? 'neutral' : TONE.manutencao[status] ?? 'neutral',
    janela,
    janelaRotulo: janela ? rotuloJanela(janela) : agendarPara ? `Agendada para ${formatBR(agendarPara)}` : 'Sem janela',
    atrasada: status != null && atrasada({ status, janelaFim: fim, agendarPara }, hoje),
    foraDaJanela: saida != null && janela != null && (saida < janela.inicio || saida > janela.fim),
  }
}

/** Texto do aviso depois de gravar uma saída fora da janela; `null` quando está dentro ou não há janela. */
export function avisoForaDaJanela(saidaIso: string | null, m: Pick<LinhaManutencao, 'janela' | 'janelaRotulo'>): string | null {
  const dia = diaSP(saidaIso)
  if (!dia || !m.janela || (dia >= m.janela.inicio && dia <= m.janela.fim)) return null
  return `A saída de ${formatBR(dia)} ficou fora da janela da manutenção (${m.janelaRotulo}). A data foi gravada; confira com o gestor de frota.`
}

/** Na linha de manutenção só o motorista e a saída da própria linha editam (spec). */
export const editavelNaManutencao = (column: Column) => !column.alias && (column.attribute === MOTORISTA || column.attribute === SAIDA)

/** Célula da linha de manutenção depois da primeira coluna: um campo editável ou um trecho que junta colunas vizinhas. */
export type Trecho = { tipo: 'campo'; column: Column } | { tipo: 'resumo' | 'vazio'; key: string; span: number }

/**
 * Motorista e saída na própria coluna; as colunas vizinhas restantes viram um trecho só, e o primeiro trecho leva o
 * resumo. Quando a visão não tem coluna para o resumo (só a primeira, ou a primeira mais os campos editáveis), o resumo
 * ganha um trecho de `span` 1 com a chave da primeira coluna, antes dos campos: quem desenha o põe na primeira coluna.
 */
export function trechosDaManutencao(columns: Column[]): Trecho[] {
  const trechos: Trecho[] = []
  let comResumo = false
  for (const column of columns.slice(1)) {
    if (editavelNaManutencao(column)) { trechos.push({ tipo: 'campo', column }); continue }
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo.tipo !== 'campo') { ultimo.span += 1; continue }
    trechos.push({ tipo: comResumo ? 'vazio' : 'resumo', key: column.key, span: 1 })
    comResumo = true
  }
  if (!comResumo && columns.length) trechos.unshift({ tipo: 'resumo', key: columns[0].key, span: 1 })
  return trechos
}

/** Colunas da edição da manutenção no celular: motorista e saída da visão, ou criadas aqui quando a visão não as tem. */
export function colunasDaManutencao(columns: Column[]): Column[] {
  return [MOTORISTA, SAIDA].map((attribute) => columns.find((c) => !c.alias && c.attribute === attribute) ?? { key: attribute, attribute, alias: null, entity: null, width: 160 })
}
