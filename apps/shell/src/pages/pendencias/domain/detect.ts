import { CP, FAT, OP, PAG } from './codes'
import type { OpResumo, PaganteResumo, Pendencia, Reserva, TipoPendencia } from './types'

const cents = (v: number | null | undefined) => Math.round((v ?? 0) * 100)
const isPago = (s: number | null) => s === PAG.pago || s === PAG.autorizado
const latest = (rs: Reserva[]) => rs.reduce<Date | null>((d, r) => (r.saida && (!d || r.saida > d) ? r.saida : d), null)

/** Espelha spec §3: só aponta o que o motor corrigiria (1, 3) ou o que precisa de gente (2, 5). */
export function detectarPendencias(ops: OpResumo[], reservas: Reserva[], pagantes: PaganteResumo[]): Pendencia[] {
  const out: Pendencia[] = []
  const porOp = new Map<string, Reserva[]>()
  for (const r of reservas) if (r.opId) porOp.set(r.opId, [...(porOp.get(r.opId) ?? []), r])
  const pagsPorOp = new Map<string, PaganteResumo[]>()
  for (const p of pagantes) pagsPorOp.set(p.opId, [...(pagsPorOp.get(p.opId) ?? []), p])
  const jaListadas = new Set<string>()

  const push = (tipo: TipoPendencia, o: OpResumo | null, rs: Reserva[], detalhe: string, corrigivel: boolean) => {
    const valor = o?.valor ?? (rs.length ? rs.reduce((s, r) => s + (r.cpValor ?? 0), 0) : null)
    out.push({
      id: `${tipo}:${o?.id ?? rs[0]?.id}`, tipo, opId: o?.id ?? null, opCodigo: o?.codigo ?? '', reservaIds: rs.map((r) => r.id),
      cliente: o?.cliente || rs[0]?.cliente || '', data: latest(rs), valor, detalhe, corrigivel,
    })
  }

  for (const o of ops) {
    const rs = porOp.get(o.id) ?? []
    const ativos = (pagsPorOp.get(o.id) ?? []).filter((p) => p.status !== PAG.cancelado)
    if (o.status === OP.paga) {
      const desalinhadas = rs.filter((r) => r.fatStatus !== FAT.pago || (r.cpId != null && r.cpStatus !== CP.concluida))
      if (desalinhadas.length) push('op-paga-desalinhada', o, desalinhadas, `${desalinhadas.length} serviço(s) sem Pago/Concluída`, true)
      continue
    }
    const pagasNaReserva = rs.filter((r) => r.fatStatus === FAT.pago)
    const semPagamento = o.status === OP.cancelada || !ativos.some((p) => isPago(p.status))
    if (semPagamento && pagasNaReserva.length) {
      push('op-sem-pagamento-reserva-paga', o, pagasNaReserva, o.status === OP.cancelada ? 'OP cancelada' : 'Nenhum pagante ativo pago', true)
      pagasNaReserva.forEach((r) => jaListadas.add(r.id))
    }
    if (o.status !== OP.cancelada && ativos.length) {
      const total = o.valor ?? (rs.length && rs.every((r) => r.cpId) ? rs.reduce((s, r) => s + (r.cpValor ?? 0), 0) : null)
      const soma = ativos.reduce((s, p) => s + cents(p.valor), 0)
      if (total != null && soma !== cents(total)) push('rateio-nao-fecha', o, rs, `Rateio ${(soma / 100).toFixed(2)} × total ${total.toFixed(2)}`, false)
    }
  }

  const opPorId = new Map(ops.map((o) => [o.id, o]))
  for (const r of reservas) {
    if (r.fatStatus !== FAT.pago || jaListadas.has(r.id)) continue
    const o = r.opId ? opPorId.get(r.opId) : undefined
    if (o?.status === OP.paga) continue
    push('pago-sem-op-paga', o ?? null, [r], o ? `OP ${o.codigo} não está paga` : 'Sem OP', false)
  }
  return out.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0))
}
