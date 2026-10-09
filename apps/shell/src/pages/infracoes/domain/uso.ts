import type { MultaUso } from './types'

/** Multas por infração, mais recentes primeiro. */
export function usoIndex(multas: MultaUso[]) {
  const map = new Map<string, MultaUso[]>()
  for (const m of multas) {
    const list = map.get(m.infracaoId)
    if (list) list.push(m)
    else map.set(m.infracaoId, [m])
  }
  for (const list of map.values()) list.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0))
  return map
}

export function resumoUso(list: MultaUso[], now = new Date()) {
  const limite = new Date(now)
  limite.setFullYear(limite.getFullYear() - 1)
  return {
    total: list.length,
    ultimos12: list.filter((m) => m.data && m.data >= limite && m.data <= now).length,
    ultima: list.find((m) => m.data)?.data ?? null,
  }
}
