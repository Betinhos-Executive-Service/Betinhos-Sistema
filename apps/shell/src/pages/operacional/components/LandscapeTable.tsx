import type { PassageiroServico, Reserva } from '../domain/types'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'
import { passengerList } from '../domain/passengers'
import { StatusBadge } from '@betinhos/ui'

/** Paisagem compacta (altura ≤ 560): tabela densa somente leitura; tocar na linha abre o sheet. */
export function LandscapeTable({ reservas, now, passageiros, onSelect }: {
  reservas: Reserva[]; now: Date; passageiros: Record<string, PassageiroServico[]>; onSelect: (id: string) => void
}) {
  return (
    <table className="op-landscape">
      <thead><tr><th>Saída</th><th>Motorista</th><th>Veículo</th><th>Trajeto</th><th>Solicitante</th><th>Passageiros</th><th>Status</th></tr></thead>
      <tbody>
        {reservas.map((r) => {
          const state = serviceState(r, now)
          return (
            <tr key={r.id} data-edge={state.kind === 'delayed' ? 'danger' : undefined}>
              <td><button type="button" className="op-landscape__open" onClick={() => onSelect(r.id)}>{r.saida ? formatHour(r.saida) : '--:--'} <span>#{r.codigo}</span></button></td>
              <td>{r.motorista || 'Sem motorista'}</td>
              <td>{r.veiculo || r.tipoVeiculo}</td>
              <td>{r.trajeto || r.destino}</td>
              <td>{r.solicitante}</td>
              <td>{passengerList(r, passageiros[r.id]).map((p) => p.nome).join(', ')}</td>
              <td><StatusBadge tone={statusTone(r.status)} dot>{r.status || 'Sem status'}</StatusBadge></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
