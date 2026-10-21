import { normalize } from '../../infracoes/domain/filters'
import type { TipoEquipamento } from './types'

export const MAX_TIPO = 100

export const byNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR')

/** Nome obrigatório e único (sem diferenciar caixa e acento). */
export function validateTipo(nome: string, tipos: TipoEquipamento[], selfId: string | null): string | null {
  const t = nome.trim()
  if (!t) return 'Informe o nome do tipo.'
  if (t.length > MAX_TIPO) return `No máximo ${MAX_TIPO} caracteres.`
  const key = normalize(t)
  const dup = tipos.find((o) => o.id !== selfId && normalize(o.nome.trim()) === key)
  if (!dup) return null
  return dup.ativo ? `Já existe o tipo ${dup.nome}.` : `Já existe o tipo ${dup.nome} (inativo). Reative-o na lista.`
}

/** Opções de seletor: ativos, mais o valor atual do item mesmo se inativo. */
export function opcoesAtivas<T extends { id: string; nome: string; ativo: boolean }>(list: T[], atualId: string | null | undefined) {
  return list
    .filter((x) => x.ativo || x.id === atualId)
    .sort(byNome)
    .map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (inativo)` }))
}

export type IconeTipo = 'notebook' | 'desktop' | 'monitor' | 'mouse' | 'teclado' | 'headset' | 'celular' | 'tablet' | 'cartao' | 'impressora' | 'outro'
const ICONES: [RegExp, IconeTipo][] = [
  [/notebook|laptop/, 'notebook'], [/desktop|computador|cpu/, 'desktop'], [/monitor|tela/, 'monitor'], [/mouse/, 'mouse'], [/teclado/, 'teclado'],
  [/headset|fone/, 'headset'], [/celular|smartphone/, 'celular'], [/tablet/, 'tablet'], [/cartao|maquininha|pos\b/, 'cartao'], [/impressora/, 'impressora'],
]
/** Ícone do item sem foto, pelo nome do tipo (os tipos são editáveis: sem correspondência, ícone genérico). */
export function iconeTipo(nome: string): IconeTipo {
  const key = normalize(nome)
  return ICONES.find(([re]) => re.test(key))?.[1] ?? 'outro'
}
