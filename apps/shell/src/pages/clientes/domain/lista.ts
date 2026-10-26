import type { FilterField, StoredView, ViewColumnDef } from '@betinhos/ui'
import type { Cliente } from './types'

/** A lista de Clientes no padrão do Design System (§10.9.1 e §10.9.2); o cadastro é pequeno e filtra em memória. */

export const TELA = 'clientes'

/** Colunas na ordem padrão; a primeira (Cliente) é fixa. */
export const CLIENTE_COLUMNS: ViewColumnDef[] = [
  { key: 'nome', label: 'Cliente' },
  { key: 'registro', label: 'Registro' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'criado', label: 'Cadastro' },
]

/** Registros presentes na lista, em ordem alfabética, para o filtro. */
export function registroOptions(list: Cliente[]) {
  return [...new Set(list.map((c) => c.registro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((r) => ({ value: r, label: r }))
}

export function clienteFields(list: Cliente[]): FilterField[] {
  return [
    { key: 'nome', label: 'Cliente', kind: 'text' },
    { key: 'registro', label: 'Registro', kind: 'choice', options: registroOptions(list) },
    { key: 'endereco', label: 'Endereço', kind: 'text' },
    { key: 'criado', label: 'Cadastro', kind: 'date' },
  ]
}

/** Valor de cada campo no cliente (para `filterRows`). */
export function readCliente(c: Cliente, key: string): unknown {
  switch (key) {
    case 'nome': return c.nome
    case 'registro': return c.registro || null
    case 'endereco': return c.endereco
    case 'criado': return c.criadoEm ? c.criadoEm.toISOString().slice(0, 10) : null
    default: return null
  }
}

/** Texto em que a busca procura: nome, registro e endereço. */
export const clienteKeywordText = (c: Cliente) => [c.nome, c.registro, c.endereco].filter(Boolean).join(' ')

/** Ordena pela coluna da visão; vazios por último. */
export function sortClientes(list: Cliente[], key: string, dir: 'asc' | 'desc') {
  const value = (c: Cliente) => (key === 'criado' ? (c.criadoEm?.toISOString() ?? '') : key === 'registro' ? c.registro : key === 'endereco' ? c.endereco : c.nome)
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (!x || !y) return x === y ? 0 : x ? -1 : 1
    return x.localeCompare(y, 'pt-BR') * sign
  })
}

/** Sem visões prontas além da padrão: o cadastro tem poucas dezenas de linhas. */
export const builtinViews = (): StoredView[] => []
