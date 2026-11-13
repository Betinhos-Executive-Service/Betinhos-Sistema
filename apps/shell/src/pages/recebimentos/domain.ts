import type { Comprovante } from '../../lib/comprovantes/arquivo'
import { formatDateTime } from '../pagantes/domain/messages'

/** Comprovante que o motorista tirou ao receber (`cr40f_anexorecebimento_v2`). */
export type Recebimento = Comprovante & {
  /** Id do serviço (`cr40f_reserva`), em minúsculas. */
  reservaId: string
  ordem: number | null
  enviadoEm: Date | null
  motorista: string
}

/** Ordem do App (`cr40f_ordem`); sem ordem ou empate, o primeiro enviado primeiro. */
export function ordenar(lista: Recebimento[]) {
  const ordem = (r: Recebimento) => r.ordem ?? Number.MAX_SAFE_INTEGER
  return [...lista].sort((a, b) => ordem(a) - ordem(b) || (a.enviadoEm?.getTime() ?? 0) - (b.enviadoEm?.getTime() ?? 0))
}

/** Um grupo por serviço, na ordem dos serviços recebida; serviço sem comprovante fica de fora. */
export function agruparPorServico<S extends { id: string }>(servicos: S[], lista: Recebimento[]) {
  const porReserva = new Map<string, Recebimento[]>()
  for (const r of lista) porReserva.set(r.reservaId, [...(porReserva.get(r.reservaId) ?? []), r])
  return servicos
    .map((servico) => ({ servico, comprovantes: ordenar(porReserva.get(servico.id.toLowerCase()) ?? []) }))
    .filter((grupo) => grupo.comprovantes.length > 0)
}

/** Linha cinza do cartão: data e hora do envio e o motorista. */
export const metaRecebimento = (r: Recebimento) => [r.enviadoEm ? formatDateTime(r.enviadoEm) : '', r.motorista].filter(Boolean).join(' · ')
