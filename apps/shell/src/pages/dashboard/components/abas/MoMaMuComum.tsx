import type { ReactNode } from 'react'
import type { TableColumn } from '@betinhos/ui'
import { COLUNA_LARGA } from '../Linhas'

/* Células comuns das listas das abas Motoristas, Manutenções e Multas. */

export const forte = (texto: ReactNode) => <strong className="dash-forte">{texto}</strong>
/** Variante de duas colunas do celular: título da linha na 1ª e o restante, com rótulo inline, na 2ª. */
export const resto = <R,>(header: string, cell: TableColumn<R>['cell']): TableColumn<R> => ({ key: 'resto', header, width: COLUNA_LARGA, cell })
/** AAAA-MM-DD → dd/MM/yyyy ('' vira '—'). */
export const dataBR = (dia: string) => (dia ? dia.split('-').reverse().join('/') : '—')
