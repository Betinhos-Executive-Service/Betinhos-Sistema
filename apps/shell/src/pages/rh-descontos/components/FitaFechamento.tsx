import { Button } from '@betinhos/ui'
import { Check, Undo2 } from 'lucide-react'
import { formatBR } from '../../frota/data/dates'
import type { ParcelaFolha } from '../../frota/data/types'
import { formatMoney } from '../../geral/domain/format'
import { cadeias, chaveOrigem, mascararCpf, mesAbreviado, mesDe, origemTexto, parcelaTexto, type GrupoColaborador } from '../domain/descontos'

type Props = {
  grupos: GrupoColaborador[]; todas: ParcelaFolha[]; mes: string; mesAtual: string
  marcados: Set<string>; ativoId: string; erros: Map<string, string>; ocupado: boolean
  onMarcar: (id: string) => void; onAtivo: (id: string) => void
  onLancar: (colaboradores: string[]) => void; onDesfazer: (colaborador: string) => void; onAbrirMulta: (multaId: string) => void
}

/** Passo Lançar: a "fita de somar" à esquerda (marcar quem já foi lançado na folha) e o detalhe do colaborador à direita. */
export function FitaFechamento({ grupos, todas, mes, mesAtual, marcados, ativoId, erros, ocupado, onMarcar, onAtivo, onLancar, onDesfazer, onAbrirMulta }: Props) {
  const total = grupos.reduce((s, g) => s + g.subtotal, 0)
  const lancado = grupos.reduce((s, g) => s + g.lancado, 0)
  const ativo = grupos.find((g) => g.id === ativoId) ?? grupos[0]
  const correntes = cadeias(todas)
  const marcadosValidos = grupos.filter((g) => marcados.has(g.id) && !g.tudoLancado).map((g) => g.id)
  const erroDe = (g: GrupoColaborador) => g.parcelas.map((p) => erros.get(p.id)).find(Boolean)
  const previstasAtivo = ativo.parcelas.filter((p) => p.status === 'prevista')
  const valorPrevistas = previstasAtivo.reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100
  const n = marcadosValidos.length

  return (
    <div className="rh-fita">
      <section className="rh-fita__lista" aria-label="Fita de fechamento">
        <ul>
          {grupos.map((g) => (
            <li key={g.id} data-ativo={g.id === ativo.id || undefined} data-lancado={g.tudoLancado || undefined}>
              <label className="rh-marca">
                <input type="checkbox" checked={g.tudoLancado || marcados.has(g.id)} disabled={g.tudoLancado || ocupado} onChange={() => onMarcar(g.id)} aria-label={`Marcar ${g.nome}`} />
                <span className="rh-marca__caixa" aria-hidden="true">{g.tudoLancado || marcados.has(g.id) ? <Check size={14} /> : null}</span>
              </label>
              <button type="button" className="rh-fita__nome" aria-pressed={g.id === ativo.id} onClick={() => onAtivo(g.id)}>{g.nome}</button>
              <span className="rh-mono">{formatMoney(g.subtotal / 100)}</span>
              {erroDe(g) ? <p className="rh-erro" role="alert">{erroDe(g)}</p> : null}
            </li>
          ))}
        </ul>
        <dl className="rh-fita__soma">
          <div><dt>Lançado</dt><dd className="rh-mono">{formatMoney(lancado / 100)}</dd></div>
          <div><dt>Falta lançar</dt><dd className="rh-mono">{formatMoney((total - lancado) / 100)}</dd></div>
          <div className="rh-fita__total"><dt>Total</dt><dd className="rh-mono">{formatMoney(total / 100)}</dd></div>
        </dl>
        <Button variant="primary" disabled={!n || ocupado} loading={ocupado} onClick={() => onLancar(marcadosValidos)}>{n === 1 ? 'Lançar o 1 marcado' : `Lançar os ${n} marcados`}</Button>
      </section>

      <section className="rh-fita__detalhe" aria-label={`Detalhe de ${ativo.nome}`}>
        <header>
          <h3>{ativo.nome}</h3>
          <small>{mascararCpf(ativo.cpf)}</small>
        </header>
        {ativo.parcelas.map((p) => (
          <div key={p.id} className="rh-corrente">
            <div className="rh-corrente__titulo">
              {p.multa
                ? <button type="button" className="rh-link" onClick={() => onAbrirMulta(p.multa!.id)}>{origemTexto(p)}</button>
                : <strong>{origemTexto(p)}</strong>}
              {p.multa?.infracao ? <small>{[p.multa.infracao, formatBR(p.multa.dataInfracao)].filter(Boolean).join(' · ')}</small> : null}
            </div>
            <ol className="rh-corrente__cartoes">
              {(correntes.get(chaveOrigem(p)) ?? [p]).map((c) => {
                const atual = mesDe(c) === mes
                return (
                  <li key={c.id} data-estado={c.status === 'descontada' ? 'lancada' : atual ? 'atual' : 'futura'} aria-current={atual ? 'date' : undefined}>
                    <span>{mesAbreviado(mesDe(c))}</span>
                    <strong>{formatMoney(c.valor)}</strong>
                    <small>{c.status === 'descontada' ? 'lançada' : atual ? 'agora' : mesDe(c) < mesAtual ? 'atrasada' : parcelaTexto(c)}</small>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
        <div className="rh-fita__acoes">
          {previstasAtivo.length ? <Button variant="primary" disabled={ocupado} onClick={() => onLancar([ativo.id])}>{`Lancei ${formatMoney(valorPrevistas)} na folha`}</Button> : null}
          {ativo.parcelas.some((p) => p.status === 'descontada') ? <Button variant="secondary" icon={<Undo2 size={16} />} disabled={ocupado} onClick={() => onDesfazer(ativo.id)}>Desfazer</Button> : null}
        </div>
      </section>
    </div>
  )
}
