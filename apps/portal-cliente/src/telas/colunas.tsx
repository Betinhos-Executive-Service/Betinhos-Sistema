import type { TableColumn } from '@betinhos/ui'
import { dataHora } from '../domain/formato'

type ComTrajeto = { origem: string; destino: string; passageiros: string[] }

/** Número, saída e, no card do mobile (onde a coluna Trajeto some), o trajeto. */
export function ResumoServico({ numero, saida, origem, destino }: { numero: string; saida: string; origem: string; destino: string }) {
  return (
    <>
      <span className="pc-servico__numero">{numero}</span>
      <span className="pc-servico__data">{dataHora(saida)}</span>
      <span className="pc-servico__trajeto">{origem} → {destino}</span>
    </>
  )
}

/** Colunas Trajeto e Passageiros, iguais na validação e em Meus serviços. */
export function colunasTrajeto<T extends ComTrajeto>(): TableColumn<T>[] {
  return [
    { key: 'trajeto', header: 'Trajeto', width: 'minmax(220px, 1.6fr)', hideBelow: 'mobile', cell: (s) => <span className="pc-trajeto">{s.origem} → {s.destino}</span> },
    { key: 'passageiros', header: 'Passageiros', width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (s) => s.passageiros.join(', ') },
  ]
}
