// components/PendenciasLista.tsx
import { Button, Table, type TableColumn } from '@betinhos/ui'
import { formatBR } from '../../funcionarios/data/dates'
import type { Pendencia } from '../domain/types'
import { StatusDoc } from './StatusDoc'

/** Link da ficha do dono: Funcionários abre direto na seção Documentos; Frota abre a ficha do veículo. */
export const hrefFicha = (p: Pendencia) => (p.dono.categoria === 'pessoas'
  ? `#/funcionarios?ficha=${p.dono.id}&secao=documentos`
  : `#/frota?ficha=${p.dono.id}`)

type Props = { lista: Pendencia[]; mobile: boolean; onRenovar: (p: Pendencia) => void }

export function PendenciasLista({ lista, mobile, onRenovar }: Props) {
  const acoes = (p: Pendencia) => (
    <span className="doc-acoes">
      <Button size="compact" variant="secondary" onClick={() => onRenovar(p)}>{p.doc ? 'Renovar' : 'Adicionar'}</Button>
      <a className="doc-link" href={hrefFicha(p)}>Abrir ficha</a>
    </span>
  )
  if (mobile) {
    return (
      <ul className="doc-cards">
        {lista.map((p) => (
          <li key={p.chave} className="doc-item" aria-label={`${p.tipo.nome} · ${p.dono.nome}`}>
            <div className="doc-item__head"><strong className="doc-item__nome">{p.dono.nome}</strong><StatusDoc estado={p.estado} dias={p.dias} /></div>
            <p className="doc-muted">{p.tipo.nome}{p.doc?.validade ? ` · validade ${formatBR(p.doc.validade)}` : ''}</p>
            {acoes(p)}
          </li>
        ))}
      </ul>
    )
  }
  const columns: TableColumn<Pendencia>[] = [
    { key: 'dono', header: 'Cadastro', cell: (p) => <span className="doc-dono"><strong>{p.dono.nome}</strong><span>{p.dono.detalhe}</span></span> },
    { key: 'tipo', header: 'Documento', cell: (p) => p.tipo.nome },
    { key: 'validade', header: 'Validade', cell: (p) => (p.doc?.validade ? formatBR(p.doc.validade) : '—'), hideBelow: 'compact' },
    { key: 'estado', header: 'Situação', cell: (p) => <StatusDoc estado={p.estado} dias={p.dias} /> },
    { key: 'acoes', header: '', cell: acoes, align: 'end' },
  ]
  return <Table className="doc-table" columns={columns} rows={lista} rowKey={(p) => p.chave} />
}
