import { StatusBadge } from '@betinhos/ui'
import { formatDate, rodizio, type View } from '../domain/escala'

type Props = { sabado: string; view: View }

export function RodizioTab({ sabado, view }: Props) {
  const linhas = rodizio(view.motoristas, view.excecoes, sabado)
  return (
    <div className="escala__tab">
      <p className="escala__summary">
        Fins de semana até {formatDate(sabado)}, contando padrão fixo e exceções. Os menos escalados aparecem primeiro.
      </p>
      <table className="escala__table">
        <thead>
          <tr><th scope="col">Motorista</th><th scope="col">Plantão 8 sem.</th><th scope="col">Trabalha 8 sem.</th><th scope="col">No ano</th></tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.motorista.id}>
              <th scope="row">
                <span className="escala__name">{l.motorista.nome}</span>
                {l.acimaDaMedia ? <StatusBadge tone="warning">Acima da média</StatusBadge> : null}
              </th>
              <td>{l.plantao8}</td>
              <td>{l.trabalha8}</td>
              <td>{l.ano}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
