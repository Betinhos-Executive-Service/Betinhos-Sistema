import type { Host } from '../../host'
import { colunasExistem } from './colunas'

// Prova de captura de mídia do App Motoristas (tabela cr40f_provamidia, gravada só pelo plugin new_ProvaMidia).
// O anexo e a prova se ligam pelo link do arquivo no SharePoint. Anexo sem prova (antigo ou prova pendente) não mostra nada.

export const ENTITY_PROVA = 'cr40f_provamidia'

export type SeloProva = 'capturada-sem-rede' | 'codigo-invalido' | 'codigo-nao-assinado' | 'fora-da-janela' | 'sem-data' | 'repetida' | 'parecida'
  | 'nota-nao-verificada' | 'sem-nota-fiscal' | 'valor-alterado'

export type ProvaMidia = {
  link: string
  origem: 'camera' | 'galeria'
  selos: SeloProva[]
  dataGravada: Date | null
  aparelho: string
  emitidoEm: Date | null
  recebidoEm: Date | null
  atrasoMinutos: number | null
  /** Despesa (fase 3): valor e data que a leitura rápida preencheu; mostrados com o selo "Valor alterado". */
  valorLido: number | null
  dataLida: string | null
}

/** Provas por link; falha de leitura vira mapa vazio (o selo é acessório e nunca derruba a tela). */
export type CarregarProvas = (links: string[]) => Promise<Map<string, ProvaMidia>>

// Valores das choices do ProvaMidiaHandler (migrations 20261116-1400, 20261116-1800 e 20261116-2100; a ordem é o contrato).
const SELOS: SeloProva[] = ['capturada-sem-rede', 'codigo-invalido', 'codigo-nao-assinado', 'fora-da-janela', 'sem-data', 'repetida', 'parecida', 'nota-nao-verificada', 'sem-nota-fiscal', 'valor-alterado']
const ORIGEM_GALERIA = 100000002

export const ROTULO_SELO: Record<SeloProva, string> = {
  'capturada-sem-rede': 'Sem rede',
  'codigo-invalido': 'Código inválido',
  'codigo-nao-assinado': 'Código não assinado',
  'fora-da-janela': 'Fora da janela',
  'sem-data': 'Sem data',
  repetida: 'Repetida',
  parecida: 'Parecida',
  'nota-nao-verificada': 'Nota não verificada',
  'sem-nota-fiscal': 'Sem nota fiscal',
  'valor-alterado': 'Valor alterado',
}

/** Selos que pedem atenção (vermelho); os demais são aviso. */
export const SELO_GRAVE: ReadonlySet<SeloProva> = new Set(['codigo-invalido', 'repetida'])

const data = (valor: unknown) => {
  const d = typeof valor === 'string' && valor ? new Date(valor) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

export function mapProva(row: Record<string, unknown>): ProvaMidia {
  const selos = String(row.cr40f_selos ?? '').split(',').map((v) => SELOS[Number(v.trim()) - 100000000]).filter((s): s is SeloProva => Boolean(s))
  return {
    link: String(row.cr40f_link ?? ''),
    origem: Number(row.cr40f_origemcaptura) === ORIGEM_GALERIA ? 'galeria' : 'camera',
    selos,
    dataGravada: data(row.cr40f_datagravada),
    aparelho: [row.cr40f_marca, row.cr40f_modelo].filter((v) => typeof v === 'string' && v.trim()).join(' '),
    emitidoEm: data(row.cr40f_emitidoem),
    recebidoEm: data(row.cr40f_recebidoem),
    atrasoMinutos: typeof row.cr40f_atrasominutos === 'number' ? row.cr40f_atrasominutos : null,
    valorLido: typeof row.cr40f_valorlido === 'number' ? row.cr40f_valorlido : null,
    dataLida: typeof row.cr40f_datalida === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.cr40f_datalida) ? row.cr40f_datalida.slice(0, 10) : null,
  }
}

const SELECT_BASE = ['cr40f_link', 'cr40f_origemcaptura', 'cr40f_selos', 'cr40f_datagravada', 'cr40f_marca', 'cr40f_modelo', 'cr40f_emitidoem', 'cr40f_recebidoem', 'cr40f_atrasominutos']
// Colunas da fase 3 (migration 20261116-2100): só entram no $select quando a metadata do ambiente as tem.
const COLUNAS_LEITURA = ['cr40f_valorlido', 'cr40f_datalida']
const SELECT_NOTA = [...SELECT_BASE, ...COLUNAS_LEITURA]
const LOTE = 10

/** Filtro OData por link, em lotes de 10 (limite de URL). */
export function provasPaths(entitySet: string, links: string[], colunas: string[] = SELECT_NOTA) {
  const unicos = [...new Set(links.filter(Boolean))]
  const paths: string[] = []
  for (let i = 0; i < unicos.length; i += LOTE) {
    const filtro = unicos.slice(i, i + LOTE).map((l) => `cr40f_link eq '${l.replace(/'/g, "''")}'`).join(' or ')
    paths.push(`${entitySet}?$select=${colunas.join(',')}&$filter=${encodeURIComponent(filtro)}`)
  }
  return paths
}

/** Mock: o 1º link vem da galeria (fora da janela, parecida, valor alterado), o 2º da câmera sem rede; os outros sem prova. */
export function provasMock(links: string[], agora = new Date()): Map<string, ProvaMidia> {
  const out = new Map<string, ProvaMidia>()
  const [primeiro, segundo] = links.filter(Boolean)
  const hora = (minutos: number) => new Date(agora.getTime() - minutos * 60_000)
  if (primeiro) out.set(primeiro, { link: primeiro, origem: 'galeria', selos: ['fora-da-janela', 'parecida', 'valor-alterado'], dataGravada: hora(60 * 24 * 9), aparelho: 'Apple iPhone 15', emitidoEm: hora(42), recebidoEm: hora(38), atrasoMinutos: 4, valorLido: 85.4, dataLida: '2026-11-14' })
  if (segundo) out.set(segundo, { link: segundo, origem: 'camera', selos: ['capturada-sem-rede'], dataGravada: null, aparelho: '', emitidoEm: null, recebidoEm: hora(5), atrasoMinutos: 95, valorLido: null, dataLida: null })
  return out
}

export function createCarregarProvas(host: Host): CarregarProvas {
  if (host.mode === 'mock') return async (links) => provasMock(links)
  let set: Promise<string | null> | null = null
  let colunas: Promise<string[]> | null = null
  return async (links) => {
    try {
      set ??= host.metadata.entities([ENTITY_PROVA]).then((info) => info.get(ENTITY_PROVA)?.entitySetName ?? null)
      colunas ??= colunasExistem(host, ENTITY_PROVA, COLUNAS_LEITURA).then((tem) => (tem ? SELECT_NOTA : SELECT_BASE))
      const entitySet = await set
      if (!entitySet) return new Map()
      const linhas = (await Promise.all(provasPaths(entitySet, links, await colunas).map((path) => host.client.getAll(path)))).flat()
      return new Map(linhas.map((row) => mapProva(row as Record<string, unknown>)).map((p) => [p.link, p]))
    } catch {
      // Tabela ainda não publicada no ambiente ou sem leitura: segue sem selo.
      set = null
      colunas = null
      return new Map()
    }
  }
}
