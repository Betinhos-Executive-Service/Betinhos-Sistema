import type { ReactNode } from 'react'
import { StatusBadge, Table, todaySaoPaulo, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { BookOpen, CalendarClock, ListChecks, PenLine } from 'lucide-react'
import { openRowActions } from '../../pagantes/components/PagantesList'
import type { Linha } from '../domain/lista'
import { dataCurta, exigenciasDe, progressoDe, publicoCelula, validadeDe, type Exigencia, type ProgressoConta } from '../domain/tabela'
import { formatDate, isPublicado, type Funcionario } from '../domain/treinamentos'

type Props = {
  list: Linha[]
  funcionarios?: Funcionario[]
  progresso?: Record<string, ProgressoConta>
  onOpen: (id: string) => void
  loading?: boolean
  view?: TableView
  quickFilters?: TableQuickFilters
  footer?: ReactNode
  empty?: ReactNode
}

const ICONES: Record<Exigencia['key'], ReactNode> = {
  assinatura: <PenLine size={12} aria-hidden="true" />,
  quiz: <ListChecks size={12} aria-hidden="true" />,
  leitura: <BookOpen size={12} aria-hidden="true" />,
}

const Vazio = ({ children }: { children: ReactNode }) => <span className="tr-muted">{children}</span>

function Situacao({ t }: { t: Linha }) {
  const publicado = isPublicado(t)
  return <StatusBadge tone={publicado ? 'success' : 'neutral'}>{publicado ? 'Publicado' : 'Rascunho'}</StatusBadge>
}

function Titulo({ t }: { t: Linha }) {
  return (
    <span className="tr-titulo">
      <strong title={t.titulo}>{t.titulo || 'Sem título'}</strong>
      {t.descricao ? <small title={t.descricao}>{t.descricao}</small> : null}
    </span>
  )
}

function Progresso({ t, conta }: { t: Linha; conta: ProgressoConta | undefined }) {
  if (!isPublicado(t)) return <Vazio>Ainda não publicado</Vazio>
  const info = progressoDe(conta)
  if (!info) return <Vazio>Sem participantes</Vazio>
  return (
    <span className="tr-prog" title={`${info.pct}% concluído`}>
      <span className="tr-prog__texto tr-num">{info.texto}</span>
      <span className="tr-prog__trilha" role="progressbar" aria-label={info.texto} aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.pct}>
        <span className={`tr-prog__barra${info.completo ? ' is-completo' : ''}`} style={{ width: `${info.pct}%` }} />
      </span>
    </span>
  )
}

function Publico({ t, funcionarios }: { t: Linha; funcionarios: Funcionario[] }) {
  const { principal, detalhe } = publicoCelula(t, funcionarios)
  return <span className="tr-titulo"><span className="tr-corte" title={principal}>{principal}</span>{detalhe ? <small>{detalhe}</small> : null}</span>
}

function Exige({ t }: { t: Linha }) {
  return <span className="tr-chips">{exigenciasDe(t).map((e) => <span key={e.key} className="tr-chip">{ICONES[e.key]}{e.label}</span>)}</span>
}

function Validade({ t, hoje }: { t: Linha; hoje: string }) {
  const v = validadeDe(t, hoje)
  if (!v) return <Vazio>Sem prazo</Vazio>
  if (v.estado === 'ok') return <span className="tr-num" title={v.completa}>{v.texto}</span>
  return <span title={v.completa}><StatusBadge tone={v.estado === 'vencido' ? 'danger' : 'warning'}><CalendarClock size={12} aria-hidden="true" /> {v.texto}</StatusBadge></span>
}

function Quando({ value, vazio }: { value: string | null; vazio: string }) {
  return value ? <span className="tr-num" title={formatDate(value)}>{dataCurta(value)}</span> : <Vazio>{vazio}</Vazio>
}

export function TreinamentosTable({ list, funcionarios = [], progresso = {}, onOpen, loading, view, quickFilters, footer, empty }: Props) {
  const hoje = todaySaoPaulo()
  const columns: TableColumn<Linha>[] = [
    { key: 'titulo', header: 'Treinamento', label: 'Treinamento', sortable: true, defaultWidth: 280, width: 'minmax(220px, 2.4fr)', cell: (t) => <Titulo t={t} /> },
    { key: 'estado', header: 'Situação', label: 'Situação', sortable: true, defaultWidth: 100, width: 'minmax(96px, .6fr)', cell: (t) => <Situacao t={t} /> },
    { key: 'progresso', header: 'Conclusão', label: 'Conclusão', sortable: true, defaultWidth: 160, width: 'minmax(150px, 1.2fr)', cell: (t) => <Progresso t={t} conta={progresso[t.id]} /> },
    { key: 'publico', header: 'Público-alvo', label: 'Público-alvo', sortable: true, defaultWidth: 160, width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (t) => <Publico t={t} funcionarios={funcionarios} /> },
    { key: 'exigencias', header: 'Exige', label: 'Exige', sortable: true, defaultWidth: 160, width: 'minmax(130px, 1fr)', hideBelow: 'compact', cell: (t) => <Exige t={t} /> },
    { key: 'validade', header: 'Validade', label: 'Validade', sortable: true, defaultWidth: 140, width: 'minmax(130px, .9fr)', cell: (t) => <Validade t={t} hoje={hoje} /> },
    { key: 'publicadoEm', header: 'Publicado em', label: 'Publicado em', sortable: true, defaultWidth: 110, width: 'minmax(100px, .7fr)', hideBelow: 'compact', cell: (t) => <Quando value={t.publicadoEm} vazio="Não publicado" /> },
    { key: 'criado', header: 'Criado em', label: 'Criado em', sortable: true, defaultWidth: 130, width: 'minmax(100px, .7fr)', hideBelow: 'compact', cell: (t) => <Quando value={t.criadoEm || null} vazio="—" /> },
  ]
  return <Table className="tr-table" columns={columns} rows={list} rowKey={(t) => t.id} onRowClick={(t) => onOpen(t.id)} rowActions={openRowActions(onOpen)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
}

export function TreinamentosCards({ list, funcionarios = [], progresso = {}, onOpen }: Pick<Props, 'list' | 'funcionarios' | 'progresso' | 'onOpen'>) {
  const hoje = todaySaoPaulo()
  return (
    <ul className="tr-cards" aria-label="Treinamentos">
      {list.map((t) => (
        <li key={t.id} className="tr-card">
          <button type="button" className="tr-open" onClick={() => onOpen(t.id)}>
            <span className="tr-card__top"><Titulo t={t} /><Situacao t={t} /></span>
            <Progresso t={t} conta={progresso[t.id]} />
            <span className="tr-card__foot"><Publico t={t} funcionarios={funcionarios} /><Validade t={t} hoje={hoje} /></span>
            <Exige t={t} />
          </button>
        </li>
      ))}
    </ul>
  )
}
