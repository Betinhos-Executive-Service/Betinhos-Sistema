import { getXrmHost } from '../pages/composicao/data/xrm'
import { EVENTO_QUERY, hrefFor, parseHash } from '../nav/useHashRoute'

const GENERAL_TABLE = 'cr40f_reservadeveculos'
const GENERAL_WEBRESOURCE = 'new_formulario_geral.html'

/** Painel lateral do model-driven (navigateTo com target 2 + position 2): o registro abre por cima da grade, que continua atrás. */
export const RECORD_DRAWER = { target: 2, position: 2, width: { value: 50, unit: '%' } } as const
/** O Formulário Geral é largo: pede mais espaço no painel. */
export const GENERAL_DRAWER = { target: 2, position: 2, width: { value: 75, unit: '%' } } as const

const guid = (id: string) => id.replace(/[{}]/g, '')

/**
 * Tabelas que têm tela no shell: o registro abre na gaveta (drawer) dessa tela, pela rota do menu e o parâmetro que a
 * tela já lê da URL. `voltar=1` faz o fechar da gaveta voltar para a lista de origem (`instalarVoltarDaGaveta`).
 * `soNoPeriodo`: a tela só acha o registro na lista do período carregado; sem ele a gaveta não abriria por cima da
 * lista de origem, então a tela abre inteira.
 */
export const GAVETAS_DO_SHELL: Readonly<Record<string, { rota: string; chave: string; soNoPeriodo?: true }>> = {
  cr40f_funcionarios: { rota: 'funcionarios', chave: 'ficha' },
  cr40f_veiculos: { rota: 'frota-veiculos', chave: 'ficha' },
  cr40f_clientes1: { rota: 'clientes', chave: 'ver' },
  cr40f_bancodedados: { rota: 'pessoas', chave: 'ver' },
  cr40f_equipamento: { rota: 'equipamentos', chave: 'ver' },
  cr40f_financeiro: { rota: 'ops', chave: 'abrir', soNoPeriodo: true },
  cr40f_pagantes: { rota: 'pagantes', chave: 'abrir', soNoPeriodo: true },
  cr40f_despesaoperacional: { rota: 'despesas-operacionais', chave: 'abrir', soNoPeriodo: true },
}

/** Parâmetros com que as telas abrem uma gaveta; sem nenhum deles, a gaveta está fechada. */
const CHAVES_DE_GAVETA = ['ficha', 'ver', 'editar', 'novo', 'abrir', 'registro']

/** Hash da lista de onde a última gaveta foi aberta por `openGridRecord`; só na memória (recarregar abre a tela inteira). */
let origemDaGaveta: string | null = null

/**
 * Lista que fica de fundo enquanto a gaveta aberta de outra lista (`voltar=1`) está na tela: o shell continua mostrando
 * a origem (ex.: a Geral) e monta a tela do registro só para a gaveta. Sem gaveta de outra lista, null.
 */
export function fundoDaGaveta(hash: string): string | null {
  return origemDaGaveta && parseHash(hash).query.get('voltar') === '1' ? origemDaGaveta : null
}

/**
 * Gaveta aberta a partir de outra lista (`voltar=1`): quando a tela fecha a gaveta (tira o parâmetro dela da URL), volta
 * no histórico para a lista de onde o usuário veio, com a visão e os filtros dela. Instalado uma vez no `main`.
 */
export function instalarVoltarDaGaveta() {
  const aoMudar = () => {
    const { query } = parseHash(location.hash)
    if (query.get('voltar') !== '1' || CHAVES_DE_GAVETA.some((chave) => query.has(chave))) return
    history.back()
  }
  window.addEventListener(EVENTO_QUERY, aoMudar)
  return () => window.removeEventListener(EVENTO_QUERY, aoMudar)
}

/**
 * Abre um registro relacionado (lookup, ID) a partir de uma lista (Composição, Geral). Tabela com tela no shell: abre a
 * gaveta dessa tela. Senão, dentro do model-driven, painel lateral com `navigateTo` (o Geral no Formulário Geral, o resto
 * no formulário nativo); sem `navigateTo`, `openForm`; por URL direta, aba nova do Dataverse.
 */
export function openGridRecord(table: string, recordId: string): Promise<unknown> | undefined {
  const id = guid(recordId)
  const gaveta = GAVETAS_DO_SHELL[table]
  if (gaveta) {
    // Gaveta aberta de dentro de outra gaveta: o fundo continua sendo a lista original.
    origemDaGaveta = gaveta.soNoPeriodo ? null : fundoDaGaveta(location.hash) ?? location.hash
    location.hash = hrefFor(gaveta.rota, { [gaveta.chave]: id, voltar: '1' })
    return undefined
  }
  const host = getXrmHost()
  const navigation = host?.Navigation
  if (navigation?.navigateTo) {
    if (table === GENERAL_TABLE) {
      return navigation.navigateTo({
        pageType: 'webresource',
        webresourceName: GENERAL_WEBRESOURCE,
        data: JSON.stringify({ mode: 'edit', entityName: GENERAL_TABLE, id, recordId: id, entityId: id }),
      }, GENERAL_DRAWER)
    }
    return navigation.navigateTo({ pageType: 'entityrecord', entityName: table, entityId: id }, RECORD_DRAWER)
  }
  if (typeof navigation?.openForm === 'function') return navigation.openForm({ entityName: table, entityId: id })
  const clientUrl = host?.Utility?.getGlobalContext().getClientUrl()?.replace(/\/+$/, '')
  if (!clientUrl) return undefined
  window.open(`${clientUrl}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`, '_blank', 'noopener')
  return undefined
}
