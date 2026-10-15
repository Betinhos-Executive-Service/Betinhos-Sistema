import type { MouseEvent } from 'react'
import { Button, Table, type TableColumn } from '@betinhos/ui'
import { Car, IdCard } from 'lucide-react'
import { formatBR } from '../../funcionarios/data/dates'
import type { Pendencia } from '../domain/types'
import { StatusDoc } from './StatusDoc'

type Props = { lista: Pendencia[]; mobile: boolean; onRenovar: (p: Pendencia) => void; onAbrirFicha: (p: Pendencia) => void }

/** Clique que nasceu num controle (botão, link, campo) é dele; só o resto da linha/cartão abre a renovação. */
const emControle = (alvo: EventTarget | null) => alvo instanceof Element && Boolean(alvo.closest('button, a, input, select, textarea, [role="button"]'))

/**
 * Linha e cartão inteiros abrem o mesmo drawer do botão Renovar/Adicionar. A linha não vira `<button>` (o `onRowClick`
 * da Table) porque tem outros botões dentro; o acesso por teclado é o próprio botão Renovar, que continua visível.
 */
export function PendenciasLista({ lista, mobile, onRenovar, onAbrirFicha }: Props) {
  const acoes = (p: Pendencia) => (
    <span className="doc-acoes">
      <Button size="compact" variant="secondary" onClick={() => onRenovar(p)}>{p.doc ? 'Renovar' : 'Adicionar'}</Button>
      <Button size="compact" variant="ghost" icon={p.dono.categoria === 'pessoas' ? <IdCard size={14} /> : <Car size={14} />} onClick={() => onAbrirFicha(p)}>Abrir ficha</Button>
    </span>
  )
  if (mobile) {
    return (
      <ul className="doc-cards">
        {lista.map((p) => (
          <li key={p.chave} className="doc-item doc-item--clicavel" aria-label={`${p.tipo.nome} · ${p.dono.nome}`} onClick={(e) => { if (!emControle(e.target)) onRenovar(p) }}>
            <div className="doc-item__head"><strong className="doc-item__nome">{p.dono.nome}</strong><StatusDoc estado={p.estado} dias={p.dias} /></div>
            <p className="doc-muted">{p.tipo.nome}{p.doc?.validade ? ` · validade ${formatBR(p.doc.validade)}` : ''}</p>
            {acoes(p)}
          </li>
        ))}
      </ul>
    )
  }
  const aoClicar = (e: MouseEvent<HTMLDivElement>) => {
    if (emControle(e.target) || !(e.target instanceof Element)) return
    const chave = e.target.closest('[role="row"]')?.querySelector<HTMLElement>('[data-chave]')?.dataset.chave
    const p = chave ? lista.find((x) => x.chave === chave) : undefined
    if (p) onRenovar(p)
  }
  const columns: TableColumn<Pendencia>[] = [
    { key: 'dono', header: 'Cadastro', cell: (p) => <span className="doc-dono" data-chave={p.chave}><strong>{p.dono.nome}</strong><span>{p.dono.detalhe}</span></span> },
    { key: 'tipo', header: 'Documento', cell: (p) => p.tipo.nome },
    { key: 'validade', header: 'Validade', cell: (p) => (p.doc?.validade ? formatBR(p.doc.validade) : '—'), hideBelow: 'compact' },
    { key: 'estado', header: 'Situação', cell: (p) => <StatusDoc estado={p.estado} dias={p.dias} /> },
    { key: 'acoes', header: '', cell: acoes, align: 'end' },
  ]
  return <Table className="doc-table doc-table--clicavel" columns={columns} rows={lista} rowKey={(p) => p.chave} onClick={aoClicar} />
}
