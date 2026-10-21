import { Button, EmptyState, PageHeader, SearchBox } from '@betinhos/ui'
import { Cake, Check, ChevronRight, CloudOff, IdCard, Plus, RefreshCw, SearchX, SlidersHorizontal, Stethoscope } from 'lucide-react'
import { useQueryBandeira } from '../../../nav/queryState'
import { useEffect, useRef, type ReactNode } from 'react'
import type { AlertKind } from '../data/alerts'
import type { Filters, SortKey } from '../data/filters'
import { EMPRESA, FUNCAO, STATUS, VINCULO, optionLabel, type Option } from '../data/schema'
import type { FuncionarioView } from '../data/types'
import { AlertBadge, Avatar, EnvBadge, StatusBadge } from './Badges'

type Props = {
  views: FuncionarioView[]
  visible: FuncionarioView[]
  /** Parte de `visible` já na tela (rolagem infinita); sem ela, todos. */
  shown?: FuncionarioView[]
  /** Fim da lista (sentinela da rolagem infinita). */
  footer?: ReactNode
  counts: Record<AlertKind, number>
  filters: Filters
  update: (patch: Partial<Filters>) => void
  reset: () => void
  ativos: number
  loading: boolean
  error: string | null
  envLabel: string
  onReload: () => void
  onOpen: (id: string) => void
  onNew: () => void
}

const ALERTAS: { kind: AlertKind; label: string; icon: typeof IdCard }[] = [
  { kind: 'cnh', label: 'CNH', icon: IdCard },
  { kind: 'aso', label: 'ASO', icon: Stethoscope },
  { kind: 'aniversario', label: 'Aniversários', icon: Cake },
]

const ORDENS: { key: SortKey; label: string }[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cnh', label: 'Vencimento da CNH' },
  { key: 'aso', label: 'Data do ASO' },
  { key: 'admissao', label: 'Admissão' },
]

const EMPRESA_CURTA: Option[] = EMPRESA.map((option) => ({ ...option, label: option.value === 202410000 ? 'Betinhos' : 'DePaula' }))

function filtrosExtras(filters: Filters) {
  return [filters.funcao, filters.empresa, filters.vinculo].filter((value) => value !== null).length + (filters.sort !== 'nome' || filters.desc ? 1 : 0)
}

export function MobileHome(props: Props) {
  const { views, visible, shown = visible, footer, counts, filters, update, reset, ativos, loading, error, envLabel, onReload, onOpen, onNew } = props
  // A folha de filtros aberta vive na URL (`filtros=1`).
  const [sheet, setSheet] = useQueryBandeira('filtros')
  const extras = filtrosExtras(filters)
  const toggleStatus = (value: number) => update({ status: filters.status.includes(value) ? filters.status.filter((item) => item !== value) : [...filters.status, value] })

  return (
    <div className="m-app">
      <header className="m-head">
        <PageHeader
          className="m-page-header"
          title="Funcionários"
          meta={<><span>{ativos} ativos de {views.length}</span><EnvBadge env={envLabel} /></>}
          actions={<Button variant="secondary" size="touch" icon={<RefreshCw size={20} className={loading ? 'spin' : ''} />} aria-label="Recarregar lista" onClick={onReload} disabled={loading} />}
        />
        <SearchBox size="touch" aria-label="Buscar colaborador" placeholder="Buscar nome, CPF, telefone ou placa" value={filters.search} onChange={(search) => update({ search })} />
        <div className="m-chips" role="group" aria-label="Filtros rápidos">
          <button type="button" className={`m-chip m-chip--filter${extras ? ' m-chip--on' : ''}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
            <SlidersHorizontal size={15} aria-hidden /> Filtros{extras > 0 && <strong>{extras}</strong>}
          </button>
          {STATUS.map((option) => (
            <button key={option.value} type="button" className={`m-chip${filters.status.includes(option.value) ? ' m-chip--on' : ''}`} aria-pressed={filters.status.includes(option.value)} onClick={() => toggleStatus(option.value)}>
              {filters.status.includes(option.value) && <Check size={14} aria-hidden />}{option.label}
            </button>
          ))}
          <span className="m-chips-sep" aria-hidden />
          {ALERTAS.map(({ kind, label, icon: Icon }) => (
            <button key={kind} type="button" className={`m-chip m-chip--alert m-chip--${kind}${filters.alerta === kind ? ' m-chip--on' : ''}`} aria-pressed={filters.alerta === kind} disabled={!counts[kind] && filters.alerta !== kind} onClick={() => update({ alerta: filters.alerta === kind ? null : kind })}>
              <Icon size={14} aria-hidden />{label}<strong>{counts[kind]}</strong>
            </button>
          ))}
        </div>
      </header>

      <main className="m-content">
        <p className="m-count">{visible.length} de {views.length} colaboradores</p>
        {loading && !views.length ? (
          <ul className="m-list" aria-hidden>{[0, 1, 2, 3, 4].map((n) => <li key={n} className="m-row m-row--sk"><span className="bt-skeleton m-sk-avatar" /><span className="m-sk-lines"><span className="bt-skeleton bt-skeleton--text" /><span className="bt-skeleton bt-skeleton--text" /></span></li>)}</ul>
        ) : error ? (
          <div className="m-state" role="alert">
            <EmptyState tone="danger" icon={<CloudOff />} title="Não foi possível carregar os colaboradores." action={<Button variant="secondary" size="touch" icon={<RefreshCw size={16} />} onClick={onReload}>Tentar de novo</Button>}>{error}</EmptyState>
          </div>
        ) : !visible.length ? (
          <div className="m-state">
            <EmptyState icon={<SearchX />} title="Nenhum colaborador encontrado para estes filtros." action={<Button variant="secondary" size="touch" onClick={reset}>Limpar filtros</Button>}>Revise a busca ou limpe os filtros.</EmptyState>
          </div>
        ) : (
          <ul className="m-list">
            {shown.map((row) => {
              const nome = String(row.values.cr40f_nomecompleto ?? '') || 'Sem nome'
              const sub = [optionLabel(FUNCAO, row.values.cr40f_funcao), row.values.new_apelido ? String(row.values.new_apelido) : '', row.veiculo?.label.split(' · ')[0] ?? ''].filter(Boolean).join(' · ')
              return (
                <li key={row.id}>
                  <button type="button" className="m-row" onClick={() => onOpen(row.id)}>
                    <Avatar name={nome} src={row.fotoThumb} size={44} />
                    <span className="m-row-main">
                      <span className="m-row-top"><strong>{nome}</strong><StatusBadge value={row.values.cr40f_status} /></span>
                      <span className="m-row-sub">{sub}</span>
                      {row.alertas.length > 0 && <span className="m-row-alerts">{row.alertas.map((alerta) => <AlertBadge key={alerta.kind} alerta={alerta} />)}</span>}
                    </span>
                    <ChevronRight size={18} className="m-row-chevron" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {footer}
      </main>

      <Button size="touch" className="m-fab" icon={<Plus size={20} />} onClick={onNew}>Novo</Button>

      {sheet && <FiltrosSheet filters={filters} update={update} reset={reset} total={visible.length} onClose={() => setSheet(false)} />}
    </div>
  )
}

function OptionGroup({ label, options, value, onChange }: { label: string; options: Option[]; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <fieldset className="m-sheet-group">
      <legend>{label}</legend>
      <div className="m-pills">
        <button type="button" className={`m-pill${value === null ? ' m-pill--on' : ''}`} aria-pressed={value === null} onClick={() => onChange(null)}>Todos</button>
        {options.map((option) => (
          <button key={option.value} type="button" className={`m-pill${value === option.value ? ' m-pill--on' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(value === option.value ? null : option.value)}>{option.label}</button>
        ))}
      </div>
    </fieldset>
  )
}

function FiltrosSheet({ filters, update, reset, total, onClose }: { filters: Filters; update: (patch: Partial<Filters>) => void; reset: () => void; total: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { panel.current?.focus() }, [])

  return (
    <div className="m-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panel} className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-sheet-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
        <span className="m-sheet-grip" aria-hidden />
        <header className="m-sheet-head">
          <h2 id="m-sheet-title">Filtros</h2>
          <Button variant="ghost" size="touch" onClick={() => { reset(); }}>Limpar tudo</Button>
        </header>
        <div className="m-sheet-body">
          <OptionGroup label="Função" options={FUNCAO} value={filters.funcao} onChange={(funcao) => update({ funcao })} />
          <OptionGroup label="Empresa" options={EMPRESA_CURTA} value={filters.empresa} onChange={(empresa) => update({ empresa })} />
          <OptionGroup label="Vínculo" options={VINCULO} value={filters.vinculo} onChange={(vinculo) => update({ vinculo })} />
          <fieldset className="m-sheet-group">
            <legend>Ordenar por</legend>
            <div className="m-pills">
              {ORDENS.map((ordem) => (
                <button key={ordem.key} type="button" className={`m-pill${filters.sort === ordem.key ? ' m-pill--on' : ''}`} aria-pressed={filters.sort === ordem.key} onClick={() => update({ sort: ordem.key, desc: false })}>{ordem.label}</button>
              ))}
            </div>
          </fieldset>
        </div>
        <footer className="m-sheet-foot">
          <Button size="touch" fullWidth onClick={onClose}>{`Ver ${total} colaborador${total === 1 ? '' : 'es'}`}</Button>
        </footer>
      </div>
    </div>
  )
}
