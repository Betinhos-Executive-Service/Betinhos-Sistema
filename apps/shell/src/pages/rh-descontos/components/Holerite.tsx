import { Avatar } from '@betinhos/ui'
import { formatBR } from '../../frota/data/dates'
import type { ParcelaFolha } from '../../frota/data/types'
import { formatMoney } from '../../geral/domain/format'
import { chaveOrigem, mascararCpf, origemTexto, parcelaTexto, type GrupoColaborador } from '../domain/descontos'

/** Bolinhas da corrente: uma por parcela; lançada cheia, a do mês com anel; sem dado na janela fica vazia. */
function Bolinhas({ p, cadeia }: { p: ParcelaFolha; cadeia: ParcelaFolha[] }) {
  return (
    <span className="rh-bolinhas" aria-hidden="true">
      {Array.from({ length: p.total }, (_, i) => {
        const x = cadeia.find((c) => c.numero === i + 1)
        return <span key={i} className="rh-bolinha" data-lancada={x?.status === 'descontada' || undefined} data-atual={i + 1 === p.numero || undefined} />
      })}
    </span>
  )
}

/** Cartão do colaborador no mês, como um holerite: linhas das parcelas, subtotal e carimbo quando tudo foi lançado. */
export function Holerite({ grupo, cadeias, erros, onAbrirMulta }: { grupo: GrupoColaborador; cadeias: Map<string, ParcelaFolha[]>; erros: Map<string, string>; onAbrirMulta: (multaId: string) => void }) {
  const dia = grupo.lancadoEm ? formatBR(grupo.lancadoEm).slice(0, 5) : ''
  return (
    <article className="rh-holerite" aria-label={grupo.nome} data-lancado={grupo.tudoLancado || undefined}>
      <header className="rh-holerite__topo">
        <Avatar name={grupo.nome.split(/\s+/).filter((p) => /^\p{L}/u.test(p)).join(' ')} />
        <div>
          <h3>{grupo.nome}</h3>
          <small>{mascararCpf(grupo.cpf)}</small>
        </div>
      </header>
      <ul className="rh-holerite__linhas">
        {grupo.parcelas.map((p) => {
          const corpo = (
            <>
              <span className="rh-linha__texto">
                <strong>{origemTexto(p)}</strong>
                {p.multa?.infracao || p.multa?.dataInfracao ? <small>{[p.multa.infracao, formatBR(p.multa.dataInfracao)].filter(Boolean).join(' · ')}</small> : null}
              </span>
              <span className="rh-linha__valor">
                <strong>{formatMoney(p.valor)}</strong>
                <span className="rh-linha__parcela"><Bolinhas p={p} cadeia={cadeias.get(chaveOrigem(p)) ?? []} />{parcelaTexto(p)}</span>
              </span>
            </>
          )
          return (
            <li key={p.id}>
              {p.multa ? <button type="button" className="rh-linha rh-linha--link" onClick={() => onAbrirMulta(p.multa!.id)}>{corpo}</button> : <div className="rh-linha">{corpo}</div>}
              {erros.get(p.id) ? <p className="rh-erro" role="alert">{erros.get(p.id)}</p> : null}
            </li>
          )
        })}
      </ul>
      <footer className="rh-holerite__rodape"><span>Subtotal</span>{grupo.tudoLancado ? <span className="rh-carimbo">Lançado{dia ? ` ${dia}` : ''}</span> : null}<strong>{formatMoney(grupo.subtotal / 100)}</strong></footer>
    </article>
  )
}
