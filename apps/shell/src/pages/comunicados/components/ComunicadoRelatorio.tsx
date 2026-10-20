import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Avatar, Breadcrumb, Button, Dialog, EmptyState, Grid, MetricCard, PageHeader, SearchBox, SegmentedControl, Skeleton, Spinner, StatusBadge, Surface, useToast } from '@betinhos/ui'
import { AlertTriangle, ArrowLeft, Bell, Check, Clock, Copy, Download, Eye, MessageSquare, PenLine, RefreshCw, SearchX, Users } from 'lucide-react'
import type { Source } from '../data/source'
import {
  COMUNICADO_ESCOPO, COMUNICADO_PUSH, COMUNICADO_TIPO, buildResultadosCsv, canResendPush, duplicateComunicado, fileSlug, formatDate, isAberto, isPendente,
  matchResultado, parseSignature, plural, pushLabel, statusLabel, statusTone, type Comunicado, type Destinatario, type Motorista, type ResultadoFiltro,
} from '../domain/comunicados'
import { Assinatura } from './Assinatura'

type Props = {
  item: Comunicado
  motoristas: Motorista[]
  source: Source
  onBack: () => void
  onDuplicate: (draft: Comunicado) => void
}

const FILTROS: { value: ResultadoFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'concluidos', label: 'Concluídos' },
  { value: 'falhas', label: 'Falhas' },
]

export function ComunicadoRelatorio({ item, motoristas, source, onBack, onDuplicate }: Props) {
  const toast = useToast()
  const [rows, setRows] = useState<Destinatario[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<ResultadoFiltro>('todos')
  const [busca, setBusca] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [reenviando, setReenviando] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [lembrando, setLembrando] = useState(false)
  const token = useRef(0)

  const tipo = item.tipo
  const ciencia = tipo === COMUNICADO_TIPO.ciencia
  const nomes = useMemo(() => new Map(motoristas.map((m) => [m.id.toLowerCase(), m.nome])), [motoristas])
  const nome = useCallback((row: Destinatario) => nomes.get(row.motoristaId.toLowerCase()) || row.nomeAssinante || 'Motorista sem cadastro', [nomes])

  const load = useCallback(async () => {
    const current = ++token.current
    setLoading(true)
    setError(null)
    try {
      const list = await source.destinatarios(item.id)
      if (current === token.current) { setRows(list); setLoaded(true) }
    } catch (reason) {
      if (current === token.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (current === token.current) setLoading(false)
    }
  }, [source, item.id])

  useEffect(() => { void load() }, [load])

  const termo = busca.trim().toLowerCase()
  const buscados = rows.filter((row) => !termo || nome(row).toLowerCase().includes(termo))
  const visiveis = buscados.filter((row) => matchResultado(filtro, row, tipo))
  const selected = rows.find((row) => row.id === selectedId) ?? visiveis[0] ?? rows[0]
  const concluidos = rows.filter((row) => !isPendente(row, tipo)).length
  const abertos = rows.filter(isAberto).length
  const falhas = rows.filter((row) => row.pushStatus === COMUNICADO_PUSH.falhou).length
  const lembretes = rows.filter((row) => isPendente(row, tipo) && canResendPush(row, tipo))
  const semAcesso = motoristas.filter((m) => m.problema).length
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0)

  const reenviar = async (row: Destinatario) => {
    setReenviando(row.id)
    const falhou = row.pushStatus === COMUNICADO_PUSH.falhou
    try {
      await source.reenviar(row.id)
      toast({ tone: 'success', message: falhou ? 'Push reenfileirado.' : 'Lembrete reenfileirado.' })
      await load()
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : 'Não foi possível reenviar o push.' })
    } finally {
      setReenviando('')
    }
  }

  const lembrarPendentes = async () => {
    setLembrando(true)
    const falhas: string[] = []
    for (const row of lembretes) {
      try { await source.reenviar(row.id) } catch { falhas.push(nome(row)) }
    }
    const enviados = lembretes.length - falhas.length
    setLembrar(false)
    setLembrando(false)
    if (enviados) toast({ tone: 'success', message: `Lembrete reenfileirado para ${enviados} ${plural(enviados, 'motorista', 'motoristas')}.` })
    if (falhas.length) toast({ tone: 'danger', message: `Não foi possível lembrar: ${falhas.join(', ')}. Tente novamente.` })
    await load()
  }

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([buildResultadosCsv(visiveis, nome)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `resultados-${fileSlug(item.titulo)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        className="page__header"
        breadcrumb={<Breadcrumb items={[{ label: 'Comunicados', href: '#/comunicados' }, { label: 'Relatório' }]} />}
        title={item.titulo}
        meta={<><StatusBadge tone="success">Enviado</StatusBadge><StatusBadge tone="info">{ciencia ? 'Assinatura obrigatória' : 'Informativo'}</StatusBadge></>}
        description={`${formatDate(item.disparadoEm)} · ${item.escopo === COMUNICADO_ESCOPO.selecionados ? `${item.alvoIds.length} ${plural(item.alvoIds.length, 'motorista selecionado', 'motoristas selecionados')}` : 'Todos os motoristas com acesso ao app'}`}
        actions={(
          <div className="cm-actions">
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onBack}>Voltar</Button>
            <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && loaded} onClick={() => void load()}>Atualizar</Button>
            <Button variant="secondary" icon={<Copy size={16} />} onClick={() => onDuplicate(duplicateComunicado(item))}>Duplicar como rascunho</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" title="Não foi possível carregar os resultados" action={<Button variant="secondary" onClick={() => void load()}>Tentar de novo</Button>}>{error}</Alert> : null}

      <Grid min={190} className="cm-kpis">
        <MetricCard icon={<Users size={20} />} label="Destinatários" value={rows.length} hint={semAcesso ? `${semAcesso} sem acesso ao app, fora do envio` : 'Todos com acesso ao app'} loading={!loaded} />
        <MetricCard icon={<Eye size={20} />} label="Visualizaram" value={`${abertos} de ${rows.length}`} hint={`${pct(abertos)}% abriram no app`} loading={!loaded} />
        <MetricCard icon={<PenLine size={20} />} tone="success" label={ciencia ? 'Ciências assinadas' : 'Ciências registradas'} value={`${concluidos} de ${rows.length}`} hint={`${rows.length - concluidos} ${plural(rows.length - concluidos, 'pendente', 'pendentes')}`} loading={!loaded} />
        <MetricCard icon={<AlertTriangle size={20} />} tone={falhas ? 'danger' : 'success'} label="Push com falha" value={falhas} hint={falhas ? 'Reenvie para quem não recebeu' : 'Nenhuma falha de entrega'} loading={!loaded} />
      </Grid>

      <div className="cm-report">
        <Surface eyebrow="Entrega e ciência" title="Resultados por motorista" flush className="cm-results"
          action={<SegmentedControl aria-label="Filtrar resultados" size="compact" value={filtro} onChange={setFiltro} options={FILTROS.map((f) => ({ value: f.value, label: `${f.label} · ${buscados.filter((row) => matchResultado(f.value, row, tipo)).length}` }))} />}>
          <div className="cm-list__toolbar">
            <SearchBox className="cm-search" value={busca} onChange={setBusca} placeholder="Buscar motorista" aria-label="Buscar motorista nos resultados" />
            <div className="cm-actions">
              <Button variant="secondary" size="compact" icon={<Download size={14} />} disabled={!visiveis.length} onClick={exportar}>Exportar CSV</Button>
              <Button variant="secondary" size="compact" icon={<Bell size={14} />} disabled={!lembretes.length || lembrando} onClick={() => setLembrar(true)}>Lembrar pendentes ({lembretes.length})</Button>
            </div>
          </div>
          <ul className="cm-results__body" aria-busy={!loaded}>
            {!loaded && loading ? [0, 1, 2].map((i) => <li key={i} className="cm-list__skeleton"><Skeleton shape="rect" height={44} /></li>) : null}
            {visiveis.map((row) => {
              const falhou = row.pushStatus === COMUNICADO_PUSH.falhou
              const ativo = selected?.id === row.id
              return (
                <li key={row.id} className={`cm-recipient${ativo ? ' is-selected' : ''}`}>
                  <button type="button" className="cm-recipient__main" aria-pressed={ativo} onClick={() => setSelectedId(row.id)}>
                    <Avatar name={nome(row)} size="sm" />
                    <span className="cm-recipient__text">
                      <strong>{nome(row)}{row.observacao ? <MessageSquare size={14} className="cm-recipient__obs" aria-label="Tem observação" /> : null}</strong>
                      <small>{row.cienteEm ? `Assinou em ${formatDate(row.cienteEm)}` : row.lidoEm ? `Confirmou em ${formatDate(row.lidoEm)}` : row.abertoEm ? `Abriu em ${formatDate(row.abertoEm)}` : 'Aguardando abertura'}</small>
                    </span>
                    <StatusBadge tone={statusTone(row)}>{statusLabel(row)}</StatusBadge>
                    <span className={`cm-push${falhou ? ' is-error' : ''}`}>{row.pushStatus === COMUNICADO_PUSH.pendente ? <Spinner size={14} label="Na fila" /> : null}{pushLabel(row)}</span>
                  </button>
                  {canResendPush(row, tipo) ? (
                    <Button variant="secondary" size="compact" className="cm-recipient__action" icon={falhou ? <RefreshCw size={14} /> : <Bell size={14} />} loading={reenviando === row.id} disabled={Boolean(reenviando) || lembrando}
                      aria-label={`${falhou ? 'Reenviar push para' : 'Lembrar'} ${nome(row)}`} onClick={() => void reenviar(row)}>
                      {falhou ? 'Reenviar push' : 'Lembrar'}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {loaded && !rows.length ? <EmptyState icon={<Users size={36} />} title="Nenhum destinatário registrado">Atualize em instantes para ver a entrega do push.</EmptyState> : null}
          {loaded && rows.length > 0 && !visiveis.length ? <EmptyState icon={<SearchX size={36} />} title="Nenhum motorista com estes filtros" action={<Button variant="secondary" onClick={() => { setBusca(''); setFiltro('todos') }}>Limpar filtros</Button>} /> : null}
        </Surface>

        <aside className="cm-side" aria-label="Detalhe e mensagem enviada">
          {selected ? (
            <Surface title={nome(selected)} action={<StatusBadge tone={statusTone(selected)}>{statusLabel(selected)}</StatusBadge>} className="cm-detail">
              <span className="cm-label">Linha do tempo</span>
              <ol className="cm-timeline">
                {[
                  { label: 'Push', time: pushLabel(selected), done: selected.pushStatus === COMUNICADO_PUSH.enviado, error: selected.pushStatus === COMUNICADO_PUSH.falhou },
                  { label: 'Comunicado aberto', time: formatDate(selected.abertoEm) || 'Ainda não aberto', done: Boolean(selected.abertoEm), error: false },
                  { label: ciencia ? 'Ciência assinada' : 'Ciência registrada', time: formatDate(selected.cienteEm || selected.lidoEm) || 'Pendente', done: !isPendente(selected, tipo), error: false },
                ].map((step) => (
                  <li key={step.label} className={step.done ? 'is-done' : step.error ? 'is-error' : undefined}>
                    <span className="cm-timeline__dot" aria-hidden="true">{step.done ? <Check size={12} /> : step.error ? <AlertTriangle size={12} /> : null}</span>
                    <span><strong>{step.label}</strong><small>{step.time}</small></span>
                  </li>
                ))}
              </ol>
              {selected.assinaturaJson ? <><span className="cm-label">Assinatura</span><div className="cm-signature"><Assinatura value={parseSignature(selected.assinaturaJson)} /></div></> : null}
              {selected.observacao ? <><span className="cm-label">Observação</span><p className="cm-observation">{selected.observacao}</p></> : null}
              {isPendente(selected, tipo) ? (
                <p className="cm-pending"><Clock size={16} aria-hidden="true" />
                  {isAberto(selected) ? (ciencia ? 'Visualizou, mas ainda não assinou. O aviso segue em Serviços até a assinatura.' : 'Visualizou, mas ainda não confirmou em Seguinte.') : 'Ainda não abriu o comunicado no aplicativo.'}
                </p>
              ) : null}
            </Surface>
          ) : null}
          <Surface eyebrow="Conteúdo" title="Mensagem enviada" className="cm-sent"><p>{item.corpo}</p></Surface>
        </aside>
      </div>

      <Dialog open={lembrar} title={`Lembrar ${lembretes.length} ${plural(lembretes.length, 'motorista pendente', 'motoristas pendentes')}?`} onClose={() => { if (!lembrando) setLembrar(false) }}
        actions={<><Button variant="secondary" disabled={lembrando} onClick={() => setLembrar(false)}>Voltar</Button><Button icon={<Bell size={16} />} loading={lembrando} onClick={() => void lembrarPendentes()}>Enviar lembrete</Button></>}>
        Cada motorista que ainda não confirmou recebe um novo push com este comunicado.
      </Dialog>
    </>
  )
}
