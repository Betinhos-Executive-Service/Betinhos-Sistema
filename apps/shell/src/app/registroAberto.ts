import { useSyncExternalStore } from 'react'

/**
 * Tabelas que têm tela no shell: o lookup de uma lista (Geral, Composição) abre a gaveta dessa tela por cima da lista,
 * sem trocar de rota. O hospedeiro (`GavetaRegistro`) tem um adaptador por tabela.
 */
export const TABELAS_COM_GAVETA = [
  'cr40f_funcionarios',
  'cr40f_veiculos',
  'cr40f_clientes1',
  'cr40f_bancodedados',
  'cr40f_equipamento',
  'cr40f_financeiro',
  'cr40f_pagantes',
  'cr40f_despesaoperacional',
] as const

export type TabelaComGaveta = (typeof TABELAS_COM_GAVETA)[number]
export type RegistroAberto = { table: TabelaComGaveta; id: string }

export const temGaveta = (table: string): table is TabelaComGaveta => (TABELAS_COM_GAVETA as readonly string[]).includes(table)

let aberto: RegistroAberto | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

export function abrirGavetaRegistro(table: TabelaComGaveta, id: string) {
  aberto = { table, id }
  avisar()
}

export function fecharGavetaRegistro() {
  if (!aberto) return
  aberto = null
  avisar()
}

const assinar = (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte) } }
/** Registro com a gaveta aberta agora (fora do React, ex.: testes). */
export const gavetaRegistroAberta = () => aberto

export function useGavetaRegistro() {
  return useSyncExternalStore(assinar, gavetaRegistroAberta, gavetaRegistroAberta)
}
