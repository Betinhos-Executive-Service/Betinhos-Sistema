import { useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Grid, MetricCard, PageHeader, SearchBox, SegmentedControl, Skeleton, StatusBadge, Surface, useToast } from '@betinhos/ui'
import { ChevronRight, Clock, FileEdit, Megaphone, Plus, RefreshCw, SearchX, Send, Trash2 } from 'lucide-react'
import type { Source } from '../data/source'
import { COMUNICADO_ESCOPO, COMUNICADO_TIPO, formatDate, isDisparado, matchLista, plural, type Comunicado, type ListaFiltro } from '../domain/comunicados'
import type { useComunicados } from '../useComunicados'

type Props = {
  data: ReturnType<typeof useComunicados>
  source: Source
  onNew: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
}

const FILTROS: { value: ListaFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'rascunhos', label: 'Rascunhos' },
  { value: 'enviados', label: 'Enviados' },
]

export function ComunicadosLista({ data, source, onNew, onOpen, onRefresh }: Props) {
  const toast = useToast()
  const [filtro, setFiltro] = useState<ListaFiltro>('todos')
  const [busca, setBusca] = useState('')
  const [excluir, setExcluir] = useState<Comunicado | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const { items, loaded } = data
  const termo = busca.trim().toLowerCase()
  const buscados = useMemo(() => items.filter((item) => !termo || `${item.titulo} ${item.corpo}`.toLowerCase().includes(termo)), [items, termo])
  const visiveis = buscados.filter((item) => matchLista(filtro, item))
  const enviados = items.filter(isDisparado).length
  const rascunhos = items.length - enviados
  const ultimo = items.map((item) => item.disparadoEm).filter((v): v is string => Boolean(v)).sort().pop() ?? null

  const confirmarExclusao = async () => {
    if (!excluir) return
    setExcluindo(true)
    try {
      await source.excluir(excluir.id)
      toast({ tone: 'success', message: 'Rascunho excluído.' })
      setExcluir(null)
      await data.reload()
    } catch (error) {
      toast({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível excluir o rascunho.' })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <PageHeader
        className="page__header"
        eyebrow={`Operação / Motoristas${source.mock ? ' / Dados de exemplo' : ''}`}
        title="Comunicados"
        description="Avisos enviados aos motoristas pelo App Motoristas e rascunhos em preparo."
        actions={(
          <div className="cm-actions">
            <Button variant="secondary" icon={<RefreshCw size={16} />} loading={data.loading && loaded} disabled={!loaded} onClick={onRefresh}>Atualizar</Button>
            <Button icon={<Plus size={16} />} disabled={!loaded} onClick={onNew}>Novo comunicado</Button>
          </div>
        )}
      />

      {data.error ? (
        <Alert tone="danger" title={loaded ? 'A última atualização falhou' : 'Não foi possível carregar os comunicados'} action={<Button variant="secondary" onClick={onRefresh}>Tentar de novo</Button>}>
          {data.error}{loaded ? ' A lista mostra os dados da carga anterior.' : ''}
        </Alert>
      ) : null}

      <Grid min={190} className="cm-kpis">
        <MetricCard icon={<Megaphone size={20} />} label="Comunicados" value={items.length} hint={source.mock ? 'Dados de exemplo' : 'Conectado ao Dataverse'} loading={!loaded} />
        <MetricCard icon={<Send size={20} />} tone="success" label="Enviados" value={enviados} hint={`${items.length ? Math.round((enviados / items.length) * 100) : 0}% do total`} loading={!loaded} />
        <MetricCard icon={<FileEdit size={20} />} tone={rascunhos ? 'warning' : 'info'} label="Rascunhos" value={rascunhos} hint={rascunhos ? 'Aguardando disparo' : 'Nenhum pendente'} loading={!loaded} />
        <MetricCard icon={<Clock size={20} />} label="Último envio" value={ultimo ? formatDate(ultimo).slice(0, 5) : '—'} hint={ultimo ? formatDate(ultimo) : 'Nenhum disparo ainda'} loading={!loaded} />
      </Grid>

      <Surface eyebrow="Histórico" title="Últimos comunicados" flush className="cm-list"
        action={<SegmentedControl aria-label="Filtrar comunicados" size="compact" value={filtro} onChange={setFiltro} options={FILTROS.map((f) => ({ value: f.value, label: `${f.label} · ${buscados.filter((item) => matchLista(f.value, item)).length}` }))} />}>
        <div className="cm-list__toolbar">
          <SearchBox className="cm-search" value={busca} onChange={setBusca} placeholder="Buscar por título ou mensagem" aria-label="Buscar comunicado" />
        </div>
        <div className="cm-list__head" aria-hidden="true"><span>Comunicado</span><span>Confirmação</span><span>Destinatários</span><span>Situação</span><span /></div>
        <ul className="cm-list__body" aria-busy={!loaded}>
          {!loaded ? [0, 1, 2].map((i) => <li key={i} className="cm-list__skeleton"><Skeleton shape="rect" height={44} /></li>) : null}
          {visiveis.map((item) => {
            const enviado = isDisparado(item)
            const ciencia = item.tipo === COMUNICADO_TIPO.ciencia
            return (
              <li key={item.id} className="cm-list__item">
                <button type="button" className="cm-list__row" onClick={() => onOpen(item.id)}>
                  <span className="cm-list__title"><strong>{item.titulo}</strong><small>{item.corpo}</small></span>
                  <span><StatusBadge tone="info">{ciencia ? 'Assinatura' : 'Informativo'}</StatusBadge></span>
                  <span className="cm-list__meta">{item.escopo === COMUNICADO_ESCOPO.selecionados ? `${item.alvoIds.length} ${plural(item.alvoIds.length, 'selecionado', 'selecionados')}` : 'Todos'}</span>
                  <span className="cm-list__status">
                    <StatusBadge tone={enviado ? 'success' : 'neutral'}>{enviado ? 'Enviado' : 'Rascunho'}</StatusBadge>
                    {enviado ? <small>{formatDate(item.disparadoEm)}</small> : null}
                  </span>
                  <ChevronRight size={16} className="cm-list__chevron" aria-hidden="true" />
                </button>
                {enviado ? null : (
                  <Button variant="ghost" size="compact" className="cm-list__delete" icon={<Trash2 size={16} />} aria-label={`Excluir rascunho ${item.titulo}`} title="Excluir rascunho" onClick={() => setExcluir(item)} />
                )}
              </li>
            )
          })}
        </ul>
        {loaded && !items.length ? <EmptyState icon={<Megaphone size={36} />} title="Nenhum comunicado ainda" action={<Button icon={<Plus size={16} />} onClick={onNew}>Novo comunicado</Button>}>Crie o primeiro aviso para os motoristas.</EmptyState> : null}
        {loaded && items.length > 0 && !visiveis.length ? <EmptyState icon={<SearchX size={36} />} title="Nenhum comunicado encontrado" action={<Button variant="secondary" onClick={() => { setBusca(''); setFiltro('todos') }}>Limpar filtros</Button>}>Troque o filtro ou limpe a busca.</EmptyState> : null}
      </Surface>

      <Dialog open={excluir !== null} tone="danger" title="Excluir este rascunho?" onClose={() => { if (!excluindo) setExcluir(null) }}
        actions={<>
          <Button variant="secondary" disabled={excluindo} onClick={() => setExcluir(null)}>Voltar</Button>
          <Button variant="danger" icon={<Trash2 size={16} />} loading={excluindo} onClick={() => void confirmarExclusao()}>Excluir rascunho</Button>
        </>}>
        “{excluir?.titulo || 'Sem título'}” será removido. Esta ação não pode ser desfeita.
      </Dialog>
    </>
  )
}
