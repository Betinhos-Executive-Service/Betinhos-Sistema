import { CAT_ITEM_SERVICO, CSV_2026_FIM, CSV_2026_INICIO } from './codes'
import { entre } from './periodo'
import type { Filtros, Reserva } from './types'

export const ehServico = (r: Reserva) => r.categoriaItem === CAT_ITEM_SERVICO

/** `enrichReservas` do legado: jan–mar/2026 do Dataverse sai (texto bruto, sem fuso) e entra o CSV. */
export function aplicarCsv2026(dataverse: Reserva[], csv: Reserva[]) {
  return dataverse.filter((r) => { const d = r.saidaRaw.slice(0, 10); return d < CSV_2026_INICIO || d > CSV_2026_FIM }).concat(csv)
}

export const temSegmento = (f: Filtros) => f.status.length + f.clientes.length + f.motoristas.length + f.tipos.length > 0

/** `passesActiveFilters`: OR dentro de cada filtro, AND entre eles; filtro vazio não restringe. */
export const passaSegmentos = (r: Reserva, f: Filtros) =>
  (!f.status.length || f.status.includes(r.statusLabel)) &&
  (!f.clientes.length || f.clientes.includes(r.cliente)) &&
  (!f.motoristas.length || f.motoristas.includes(r.motoristaKey)) &&
  (!f.tipos.length || f.tipos.includes(r.tipoVeiculo))

/** `rv` do legado: serviços no período e nos segmentos. */
export const filtrarServicos = (todas: Reserva[], f: Filtros) => todas.filter((r) => ehServico(r) && entre(r.dia, f.inicio, f.fim) && passaSegmentos(r, f))

export const soma = (rows: Reserva[]) => rows.reduce((s, r) => s + (r.valor || 0), 0)

export function agrupar<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = map.get(k)
    if (list) list.push(r)
    else map.set(k, [r])
  }
  return map
}

/** `mKeys`: meses (AAAA-MM) com serviço, em ordem. */
export const mesesComDados = (rows: Reserva[]) => [...new Set(rows.map((r) => r.mes).filter(Boolean))].sort()

export type Opcao = { value: string; label: string }
export type OpcoesFiltro = { status: Opcao[]; clientes: Opcao[]; motoristas: Opcao[]; tipos: Opcao[] }

const ordenar = (map: Map<string, string>) => [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

/** `populateFilters` do legado: opções de todas as reservas carregadas; o primeiro rótulo de cada chave vale, vazios ficam fora. */
export function opcoesFiltro(todas: Reserva[]): OpcoesFiltro {
  const status = new Map<string, string>()
  const clientes = new Map<string, string>()
  const motoristas = new Map<string, string>()
  const tipos = new Map<string, string>()
  const add = (map: Map<string, string>, value: string, label: string) => {
    if (value && label && !map.has(value)) map.set(value, label)
  }
  for (const r of todas) {
    add(status, r.statusLabel, r.statusLabel)
    add(clientes, r.cliente, r.cliente)
    add(motoristas, r.motoristaKey, r.motorista)
    add(tipos, r.tipoVeiculo, r.tipoVeiculo)
  }
  return { status: ordenar(status), clientes: ordenar(clientes), motoristas: ordenar(motoristas), tipos: ordenar(tipos) }
}
