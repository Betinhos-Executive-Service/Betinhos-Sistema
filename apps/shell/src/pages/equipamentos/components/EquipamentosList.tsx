import { useState, type ReactNode } from 'react'
import { StatusBadge, Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { CreditCard, Headphones, Keyboard, Laptop, Monitor, Mouse, Package, PcCase, Printer, Smartphone, Tablet, type LucideIcon } from 'lucide-react'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { iconeTipo, type IconeTipo } from '../domain/cadastros'
import { statusLabel, statusTone } from '../domain/choices'
import type { Equipamento } from '../domain/types'

type Props = { list: Equipamento[]; inativos: Set<string>; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** `aaaa-mm-dd` → `dd/mm/aaaa` sem passar por Date (evita deslocar o dia pelo fuso). */
export const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const fmtCompra = (e: Equipamento) => [fmtData(e.dataCompra), e.valorCompra == null ? '' : money.format(e.valorCompra)].filter(Boolean).join(' · ') || '—'

const ICONE: Record<IconeTipo, LucideIcon> = {
  notebook: Laptop, desktop: PcCase, monitor: Monitor, mouse: Mouse, teclado: Keyboard, headset: Headphones,
  celular: Smartphone, tablet: Tablet, cartao: CreditCard, impressora: Printer, outro: Package,
}

/** Miniatura da capa; sem foto (ou se a imagem não carregar), o ícone do tipo. Decorativa: o nome vem ao lado. */
export function Miniatura({ e, size = 'compact' }: { e: Equipamento; size?: 'compact' | 'card' }) {
  const [quebrada, setQuebrada] = useState<string | null>(null)
  const Icone = ICONE[iconeTipo(e.tipoNome)]
  const foto = e.capa && quebrada !== e.capa ? e.capa : null
  return (
    <span className={`eq-thumb eq-thumb--${size}${foto ? ' eq-thumb--foto' : ''}`} aria-hidden="true">
      {foto ? <img src={foto} alt="" onError={() => setQuebrada(foto)} /> : <Icone size={size === 'card' ? 22 : 16} />}
    </span>
  )
}

function OpenName({ e, onOpen }: { e: Equipamento; onOpen: (id: string) => void }) {
  return (
    <span className="eq-name">
      <Miniatura e={e} />
      <button type="button" className="eq-open" onClick={() => onOpen(e.id)}>
        <strong>{e.descricao || 'Sem descrição'}</strong>
      </button>
    </span>
  )
}

export function StatusSelo({ e }: { e: Equipamento }) {
  return <StatusBadge tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusBadge>
}

function Responsavel({ e, inativos }: { e: Equipamento; inativos: Set<string> }) {
  if (!e.responsavelId) return <span className="eq-muted">Sem responsável</span>
  return (
    <span className="eq-badges">
      <span>{e.responsavelNome || 'Funcionário'}</span>
      {inativos.has(e.responsavelId) ? <StatusBadge tone="neutral">Inativo</StatusBadge> : null}
    </span>
  )
}

export function EquipamentosTable({ list, inativos, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Equipamento>[] = [
    { key: 'equipamento', header: 'Equipamento', label: 'Equipamento', sortable: true, defaultWidth: 170, width: 'minmax(160px, 2fr)', cell: (e) => <OpenName e={e} onOpen={onOpen} /> },
    { key: 'tipo', header: 'Tipo', label: 'Tipo', sortable: true, defaultWidth: 100, width: 'minmax(100px, .8fr)', cell: (e) => e.tipoNome || '—' },
    { key: 'marcaModelo', header: 'Marca/modelo', label: 'Marca/modelo', sortable: true, defaultWidth: 130, width: 'minmax(120px, 1fr)', hideBelow: 'compact', cell: (e) => e.marcaModelo || '—' },
    { key: 'responsavel', header: 'Responsável', label: 'Responsável', sortable: true, defaultWidth: 160, width: 'minmax(140px, 1.2fr)', cell: (e) => <Responsavel e={e} inativos={inativos} /> },
    { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 150, width: 'minmax(120px, .9fr)', cell: (e) => <StatusSelo e={e} /> },
    { key: 'serie', header: 'Nº de série', label: 'Nº de série', sortable: true, defaultWidth: 100, width: 'minmax(100px, .8fr)', hideBelow: 'compact', cell: (e) => <span className="eq-num">{e.numeroSerie || '—'}</span> },
    { key: 'compra', header: 'Compra', label: 'Compra', sortable: true, defaultWidth: 150, width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (e) => <span className="eq-num">{fmtCompra(e)}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.eq-open')}>
      <Table className="eq-table" columns={columns} rows={list} rowKey={(e) => e.id} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function EquipamentosCards({ list, inativos, onOpen }: Props) {
  return (
    <ul className="eq-cards" aria-label="Equipamentos" onClick={(event) => openFromRow(event, '.eq-card', '.eq-card__open')}>
      {list.map((e) => (
        <li key={e.id} className="eq-card">
          <button type="button" className="eq-card__open" onClick={() => onOpen(e.id)}>
            <Miniatura e={e} size="card" />
            <span className="eq-card__text">
              <strong className="eq-card__name">{e.descricao || 'Sem descrição'}</strong>
              <span className="eq-card__meta">{[e.tipoNome, e.marcaModelo, e.numeroSerie && `Série ${e.numeroSerie}`].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
          <div className="eq-card__foot"><Responsavel e={e} inativos={inativos} /><StatusSelo e={e} /></div>
        </li>
      ))}
    </ul>
  )
}
