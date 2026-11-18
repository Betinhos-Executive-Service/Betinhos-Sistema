import { formatBR } from '../../frota/data/dates'
import type { ParcelaFolha } from '../../frota/data/types'
import { formatMoney } from '../../geral/domain/format'
import { estadoParcela, mesAbreviado, mesDe } from '../domain/descontos'

type Props = { p: ParcelaFolha; corrente: ParcelaFolha[]; mes: string; mesAtual: string; onAbrirMulta: (multaId: string) => void }

const TEXTO = { lancada: 'lançada', cancelada: 'cancelada', atrasada: 'atrasada', futura: 'a lançar' }

/** Detalhe expandido da linha: de onde vem o desconto e as parcelas do mesmo parcelamento, mês a mês. */
export function DetalheParcela({ p, corrente, mes, mesAtual, onAbrirMulta }: Props) {
  const m = p.multa
  return (
    <div className="rh-det">
      <dl className="rh-det__dados">
        {m ? <div><dt>Auto</dt><dd className="rh-mono">{m.auto}</dd></div> : null}
        {m?.infracao ? <div><dt>Infração</dt><dd>{m.infracao}</dd></div> : null}
        {m?.dataInfracao ? <div><dt>Data</dt><dd>{formatBR(m.dataInfracao)}</dd></div> : null}
        <div><dt>Parcelamento</dt><dd>{p.total === 1 ? 'À vista' : `${p.total} parcelas`}</dd></div>
      </dl>
      {p.total > 1 ? (
        <ol className="rh-det__corrente" aria-label="Parcelas mês a mês">
          {corrente.map((c) => {
            const mesC = mesDe(c)
            const estado = estadoParcela(c, mesAtual)
            const doMes = mesC === mes && (estado === 'futura' || estado === 'atrasada')
            return (
              <li key={c.id} data-estado={doMes ? 'atual' : estado} aria-current={mesC === mes ? 'date' : undefined}>
                <span>{`${mesAbreviado(mesC)} · ${c.numero}/${c.total}`}</span>
                <strong className="rh-mono">{formatMoney(c.valor)}</strong>
                <small>{doMes ? 'este mês' : TEXTO[estado]}</small>
              </li>
            )
          })}
        </ol>
      ) : null}
      {m ? <button type="button" className="rh-link" onClick={() => onAbrirMulta(m.id)}>Abrir a multa na Frota</button> : null}
    </div>
  )
}
