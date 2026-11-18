import { Check } from 'lucide-react'
import type { ParcelaFolha } from '../../frota/data/types'
import { formatMoney } from '../../geral/domain/format'
import { chaveOrigem, mascararCpf, mesAbreviado, mesDe, mesPorExtenso, parcelaTexto, type GrupoColaborador } from '../domain/descontos'

/** Grade colaborador × mês. Parcelas do mesmo parcelamento em meses vizinhos se encostam numa barra contínua. */
export function LinhaDoTempo({ grupos, meses, mes, mesAtual, totais, onMes, onAbrirMulta }: {
  grupos: GrupoColaborador[]; meses: string[]; mes: string; mesAtual: string; totais: Map<string, number>
  onMes: (m: string) => void; onAbrirMulta: (multaId: string) => void
}) {
  const clicar = (p: ParcelaFolha) => { if (mesDe(p) !== mes) onMes(mesDe(p)); else if (p.multa) onAbrirMulta(p.multa.id) }
  return (
    <div className="rh-tempo">
      <table aria-label="Descontos por colaborador e mês">
        <thead>
          <tr>
            <th scope="col">Colaborador</th>
            {meses.map((m) => <th key={m} scope="col" aria-current={m === mes ? 'date' : undefined}>{mesAbreviado(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.id}>
              <th scope="row"><strong>{g.nome}</strong><small>{mascararCpf(g.cpf)}</small></th>
              {meses.map((m) => (
                <td key={m} aria-current={m === mes ? 'date' : undefined}>
                  {g.parcelas.filter((p) => mesDe(p) === m).map((p) => {
                    const chave = chaveOrigem(p)
                    const vizinha = (n: number) => g.parcelas.some((x) => chaveOrigem(x) === chave && x.numero === p.numero + n)
                    const estado = p.status === 'descontada' ? 'lancada' : m < mesAtual ? 'atrasada' : 'alancar'
                    return (
                      <button key={p.id} type="button" className="rh-pilula" data-estado={estado} data-esq={(p.numero > 1 && vizinha(-1)) || undefined} data-dir={vizinha(1) || undefined}
                        aria-label={`${g.nome}, ${mesPorExtenso(m)}, parcela ${parcelaTexto(p)}, ${formatMoney(p.valor)}`} onClick={() => clicar(p)}>
                        {estado === 'lancada' ? <Check size={12} aria-hidden="true" /> : null}{formatMoney(p.valor)}
                      </button>
                    )
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total do mês</th>
            {meses.map((m) => <td key={m} aria-current={m === mes ? 'date' : undefined}>{totais.get(m) ? formatMoney(totais.get(m)!) : '—'}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
