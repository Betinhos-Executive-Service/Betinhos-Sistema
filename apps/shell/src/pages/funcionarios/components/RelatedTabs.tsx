import { Alert, Button, buttonClassName, EmptyState, Spinner, StatusBadge } from '@betinhos/ui'
import { ExternalLink, Inbox } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { statusLabel, statusTone } from '../../equipamentos/domain/choices'
import type { DataSource } from '../data/source'
import type { EquipamentoResumo, Multa, Posse } from '../data/types'
import { errorMessage } from '../data/xrm'

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const fmt = (value: string | null) => (value ? dateTime.format(new Date(value)) : '—')

export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true }))
    load().then((data) => setState({ data, loading: false }), (error) => setState({ error: errorMessage(error), loading: false }))
  }, [load])
  useEffect(reload, [reload])
  return { ...state, reload }
}

export function Status({ loading, error, empty, emptyText = 'Nenhum registro.' }: { loading: boolean; error?: string; empty: boolean; emptyText?: string }) {
  if (loading) return <p className="loading-line"><Spinner size={16} /> Carregando…</p>
  if (error) return <Alert tone="danger" title="Não foi possível carregar.">{error}</Alert>
  if (empty) return <EmptyState compact align="start" icon={<Inbox />} title={emptyText} />
  return null
}

export function MultasTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.multas(id), [source, id])
  const { data, loading, error } = useLoad<Multa[]>(load)
  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!data?.length} />
      <ul className="cards">
        {data?.map((multa) => (
          <li key={multa.id} className="card">
            <div className="card-main">
              <strong>{multa.titulo}</strong>
              <span className="muted">{fmt(multa.dataHora)} · {multa.placa || 'sem placa'}{multa.local && ` · ${multa.local}`}</span>
            </div>
            <StatusBadge tone="info">{multa.status || '—'}</StatusBadge>
            <Button variant="ghost" size="compact" icon={<ExternalLink size={16} />} aria-label={`Abrir multa ${multa.titulo}`} onClick={() => source.openForm('cr40f_multas', multa.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VeiculosTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.posses(id), [source, id])
  const { data, loading, error } = useLoad<Posse[]>(load)
  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!data?.length} />
      <ol className="timeline">
        {data?.map((posse) => (
          <li key={posse.id} className={posse.fim ? '' : 'timeline--open'}>
            <strong>{posse.veiculo}</strong>
            <span className="muted">{fmt(posse.inicio)} → {posse.fim ? fmt(posse.fim) : 'em posse'}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Só leitura: o cadastro e a troca de responsável ficam em #/equipamentos (link abre o item). */
export function EquipamentosTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.equipamentos(id), [source, id])
  const { data, loading, error } = useLoad<EquipamentoResumo[]>(load)
  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!data?.length} emptyText="Nenhum equipamento com este funcionário." />
      <ul className="cards">
        {data?.map((item) => (
          <li key={item.id} className="card">
            <div className="card-main">
              <strong>{item.descricao || 'Sem descrição'}</strong>
              <span className="muted">{[item.tipo, item.numeroSerie && `Série ${item.numeroSerie}`].filter(Boolean).join(' · ') || '—'}</span>
            </div>
            <StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge>
            <a className={buttonClassName({ variant: 'ghost', size: 'compact', iconOnly: true })} href={`#/equipamentos?ver=${encodeURIComponent(item.id)}`} aria-label={`Abrir equipamento ${item.descricao || 'sem descrição'}`}><ExternalLink size={16} aria-hidden /></a>
          </li>
        ))}
      </ul>
    </div>
  )
}
