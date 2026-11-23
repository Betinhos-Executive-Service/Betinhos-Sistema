import { CATALOGO, entradaDoCatalogo, type EntradaCatalogo, type Perfil } from './catalogo.ts'

/** Onde o valor de uma chave nasceu. */
export type Origem = 'fixa' | 'excecao' | 'piloto' | 'perfil' | 'padrao' | 'modulo-pai'

/** Conteúdo da versão publicada: valores por perfil. Admin (piloto) não entra: é sempre tudo ligado. */
export interface Matriz {
  proprio?: Readonly<Record<string, boolean>>
  terceiro?: Readonly<Record<string, boolean>>
}

export interface Excecao {
  chave: string
  ligado: boolean
  /** yyyy-MM-dd; vazia = sem validade. Vale até o fim desse dia (America/Sao_Paulo). */
  validade?: string | null
  /** Exceção encerrada (cr40f_encerradoem preenchido) nunca vale. */
  encerrada?: boolean
}

export interface Pessoa {
  /** cr40f_tipodevinculo: 1 = Terceiro; 0, vazio ou qualquer outro valor = Próprio. */
  vinculo?: number | null
  piloto?: boolean
  /** Mais recente por último: havendo duas vigentes para a mesma chave, vale a última. */
  excecoes?: readonly Excecao[]
}

export interface EntradaResolucao {
  /** Matriz da versão publicada; null/undefined = nenhuma versão publicada (vale o padrão do catálogo). */
  matriz?: Matriz | null
  pessoa?: Pessoa
  /** Data de hoje em America/Sao_Paulo (yyyy-MM-dd). Entra de fora: a regra nunca lê o relógio. */
  hoje: string
}

export interface Resolucao {
  ligado: boolean
  origem: Origem
}

export interface ConfigEfetiva {
  /** Número da versão publicada; null quando vale o padrão do catálogo. */
  versao: number | null
  perfil: Perfil
  piloto: boolean
  /** Vínculo vazio ou fora de 0/1: vale como Próprio, a tela avisa. */
  semVinculo: boolean
  chaves: Record<string, boolean>
  origens: Record<string, Origem>
}

export interface Mudanca {
  chave: string
  perfil: Perfil
  de: boolean
  para: boolean
}

export interface ErroMatriz {
  codigo: 'CHAVE_INVALIDA' | 'CHAVE_FIXA'
  chave: string
  perfil: string
}

export const PERFIS: readonly Perfil[] = ['proprio', 'terceiro']

export function perfilDoVinculo(vinculo: number | null | undefined): Perfil {
  return Number(vinculo) === 1 ? 'terceiro' : 'proprio'
}

export function semVinculo(vinculo: number | null | undefined): boolean {
  return vinculo === null || vinculo === undefined || (Number(vinculo) !== 0 && Number(vinculo) !== 1)
}

/** Matriz sem nenhum valor (ou ausente) = nunca houve publicação: vale o padrão do catálogo. */
export function matrizVazia(matriz: Matriz | null | undefined): boolean {
  if (!matriz) return true
  return PERFIS.every((p) => Object.keys(matriz[p] ?? {}).length === 0)
}

/** Valor de uma chave na matriz, sem pessoa. Chave ausente numa matriz com conteúdo = ligada (módulo ou função nova nasce ligada). */
export function valorNaMatriz(matriz: Matriz | null | undefined, perfil: Perfil, entrada: EntradaCatalogo): Resolucao {
  if (entrada.fixa) return { ligado: true, origem: 'fixa' }
  if (matrizVazia(matriz)) return { ligado: entrada.padrao[perfil], origem: 'padrao' }
  const valor = matriz?.[perfil]?.[entrada.chave]
  return { ligado: valor === undefined ? true : valor, origem: 'perfil' }
}

function vigente(excecao: Excecao, hoje: string): boolean {
  if (excecao.encerrada) return false
  return !excecao.validade || excecao.validade >= hoje
}

/** Ordem: chave fixa → exceção vigente → piloto → perfil pelo vínculo → função exige o módulo pai ligado. */
export function resolverChave(chave: string, entrada: EntradaResolucao): Resolucao {
  const item = entradaDoCatalogo(chave)
  if (!item) throw new RangeError(`Chave fora do catálogo: ${chave}`)
  const base = resolverSemPai(item, entrada)
  if (item.pai && base.ligado && !resolverChave(item.pai, entrada).ligado) return { ligado: false, origem: 'modulo-pai' }
  return base
}

function resolverSemPai(item: EntradaCatalogo, entrada: EntradaResolucao): Resolucao {
  if (item.fixa) return { ligado: true, origem: 'fixa' }
  const pessoa = entrada.pessoa
  const excecao = [...(pessoa?.excecoes ?? [])].reverse().find((e) => e.chave === item.chave && vigente(e, entrada.hoje))
  if (excecao) return { ligado: excecao.ligado, origem: 'excecao' }
  if (pessoa?.piloto) return { ligado: true, origem: 'piloto' }
  return valorNaMatriz(entrada.matriz, perfilDoVinculo(pessoa?.vinculo), item)
}

/** Configuração efetiva inteira de um motorista (o que o App recebe e o preview simula). */
export function configuracaoEfetiva(entrada: EntradaResolucao & { versao?: number | null }): ConfigEfetiva {
  const chaves: Record<string, boolean> = {}
  const origens: Record<string, Origem> = {}
  for (const item of CATALOGO) {
    const r = resolverChave(item.chave, entrada)
    chaves[item.chave] = r.ligado
    origens[item.chave] = r.origem
  }
  return {
    versao: entrada.versao ?? null,
    perfil: perfilDoVinculo(entrada.pessoa?.vinculo),
    piloto: Boolean(entrada.pessoa?.piloto),
    semVinculo: semVinculo(entrada.pessoa?.vinculo),
    chaves,
    origens,
  }
}

/** O que muda entre duas matrizes (valores resolvidos, não o JSON), para o resumo do Publicar. Chaves fixas não mudam. */
export function compararMatrizes(antes: Matriz | null | undefined, depois: Matriz | null | undefined): Mudanca[] {
  const mudancas: Mudanca[] = []
  for (const item of CATALOGO) {
    if (item.fixa) continue
    for (const perfil of PERFIS) {
      const de = valorNaMatriz(antes, perfil, item).ligado
      const para = valorNaMatriz(depois, perfil, item).ligado
      if (de !== para) mudancas.push({ chave: item.chave, perfil, de, para })
    }
  }
  return mudancas
}

/** Chave fora do catálogo ou chave fixa desligada. Lista vazia = matriz aceita. */
export function validarMatriz(matriz: Matriz): ErroMatriz[] {
  const erros: ErroMatriz[] = []
  for (const perfil of PERFIS) {
    for (const [chave, valor] of Object.entries(matriz[perfil] ?? {})) {
      const item = entradaDoCatalogo(chave)
      if (!item) erros.push({ codigo: 'CHAVE_INVALIDA', chave, perfil })
      else if (item.fixa && valor !== true) erros.push({ codigo: 'CHAVE_FIXA', chave, perfil })
    }
  }
  return erros
}

/** yyyy-MM-dd em America/Sao_Paulo. Só para quem chama a regra: a regra recebe o resultado em `hoje`. */
export function hojeSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}
