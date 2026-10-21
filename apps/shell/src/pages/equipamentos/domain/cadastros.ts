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
  return dup ? `Já existe o tipo ${dup.nome}.` : null
}

/** Opções de seletor: ativos, mais o valor atual do item mesmo se inativo. */
export function opcoesAtivas<T extends { id: string; nome: string; ativo: boolean }>(list: T[], atualId: string | null | undefined) {
  return list
    .filter((x) => x.ativo || x.id === atualId)
    .sort(byNome)
    .map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (inativo)` }))
}
