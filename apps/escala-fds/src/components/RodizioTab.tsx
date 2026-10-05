import { StatusBadge } from '@betinhos/ui'
import { formatDate, rodizio, type Motorista, type Registro } from '../domain/escala'

type Props = { sabado: string; motoristas: Motorista[]; registros: Map<string, Registro> }

export function RodizioTab({ sabado, motoristas, registros }: Props) {
  const linhas = rodizio(motoristas, registros.values(), sabado)
  return (
    <div className="escala__tab">
      <p className="escala__summary">
        Fins de semana com Trabalha ou Plantão até {formatDate(sabado)}. Os menos escalados aparecem primeiro.
      </p>
      <table className="escala__table">
        <thead>
          <tr><th scope="col">Motorista</th><th scope="col">8 semanas</th><th scope="col">No ano</th></tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.motorista.id}>
              <th scope="row">
                <span className="escala__name">{l.motorista.nome}</span>
                {l.acimaDaMedia ? <StatusBadge tone="warning">Acima da média</StatusBadge> : null}
              </th>
              <td>{l.ultimas8}</td>
              <td>{l.ano}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
