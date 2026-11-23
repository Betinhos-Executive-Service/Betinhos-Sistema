import type { Perfil } from '@betinhos/app-config'

export const ABAS = ['perfis', 'motoristas', 'historico'] as const
export type Aba = (typeof ABAS)[number]
export type Modo = 'rascunho' | 'publicado'
export type VerComo = { tipo: 'perfil'; perfil: Perfil | 'admin' } | { tipo: 'motorista'; id: string }

const PERFIS_VER = ['proprio', 'terceiro', 'admin'] as const

export const lerAba = (q: URLSearchParams): Aba => ABAS.find((a) => a === q.get('aba')) ?? 'perfis'
export const lerModo = (q: URLSearchParams): Modo => (q.get('modo') === 'publicado' ? 'publicado' : 'rascunho')

/** `perfil:terceiro` ou `motorista:<id>` (o valor do seletor e do parâmetro `ver`); qualquer outra coisa vale o perfil Próprio. */
export function verDe(bruto: string): VerComo {
  const [tipo, valor] = [bruto.slice(0, bruto.indexOf(':')), bruto.slice(bruto.indexOf(':') + 1)]
  if (tipo === 'motorista' && valor) return { tipo: 'motorista', id: valor }
  if (tipo === 'perfil') { const p = PERFIS_VER.find((x) => x === valor); if (p) return { tipo: 'perfil', perfil: p } }
  return { tipo: 'perfil', perfil: 'proprio' }
}

export const lerVer = (q: URLSearchParams): VerComo => verDe(q.get('ver') ?? '')

export const escreverVer = (v: VerComo) => (v.tipo === 'motorista' ? `motorista:${v.id}` : `perfil:${v.perfil}`)
export const lerMotorista = (q: URLSearchParams) => q.get('motorista') || null
