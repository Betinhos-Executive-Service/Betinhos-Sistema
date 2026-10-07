import type { Papel, ServicoPessoa } from './types'

type Raw = Omit<ServicoPessoa, 'papeis'> & { papel: Papel }

/** Junta as fontes (solicitante, passageiro 1–4, serviços por passageiro) sem repetir serviço; mais recente primeiro. */
export function mergeServicos(raw: Raw[]): ServicoPessoa[] {
  const map = new Map<string, ServicoPessoa>()
  for (const r of raw) {
    const { papel, ...rest } = r
    const atual = map.get(r.id)
    if (atual) { if (!atual.papeis.includes(papel)) atual.papeis.push(papel); continue }
    map.set(r.id, { ...rest, papeis: [papel] })
  }
  const ordem = (s: ServicoPessoa) => s.data?.getTime() ?? -Infinity
  return [...map.values()].sort((a, b) => ordem(b) - ordem(a))
}

export type Resumo = { total: number; primeiro: Date | null; ultimo: Date | null; ultimos90: number; proximo: Date | null }

export function resumo(servicos: ServicoPessoa[], now = new Date()): Resumo {
  const datas = servicos.map((s) => s.data).filter((d): d is Date => d != null)
  const passadas = datas.filter((d) => d <= now)
  const futuras = datas.filter((d) => d > now).sort((a, b) => a.getTime() - b.getTime())
  const limite = now.getTime() - 90 * 86_400_000
  return {
    total: servicos.length,
    primeiro: passadas.length ? new Date(Math.min(...passadas.map((d) => d.getTime()))) : null,
    ultimo: passadas.length ? new Date(Math.max(...passadas.map((d) => d.getTime()))) : null,
    ultimos90: passadas.filter((d) => d.getTime() >= limite).length,
    proximo: futuras[0] ?? null,
  }
}
