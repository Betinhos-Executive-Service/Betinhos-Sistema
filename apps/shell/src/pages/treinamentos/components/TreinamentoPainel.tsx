import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Avatar, Breadcrumb, Button, EmptyState, Grid, MetricCard, PageHeader, SearchBox, SegmentedControl, Skeleton, StatusBadge, Surface, todaySaoPaulo, useToast } from '@betinhos/ui'
import { ArrowLeft, BellRing, CalendarClock, Check, CheckCircle2, Eye, Pencil, PenLine, RefreshCw, Repeat, SearchX, Users, XCircle } from 'lucide-react'
import { parseSignature } from '../../comunicados/domain/comunicados'
import { Assinatura } from '../../comunicados/components/Assinatura'
import type { Source } from '../data/source'
import { erroTexto, fmtDia, formatDate, isConcluida, isVencido, matchParticipacao, plural, podeLembrar, publicoLabel, PUSH, pushLabel, statusParticipacao, type FiltroParticipacao, type Funcionario, type Participacao, type Treinamento } from '../domain/treinamentos'
import { AnexosSecao } from './AnexosSecao'
import { Conteudo } from './Conteudo'

type Props = { item: Treinamento; funcionarios: Funcionario[]; source: Source; onBack: () => void; onEditar: () => void; onReaplicar: () => void }

const FILTROS: { value: FiltroParticipacao; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'concluidos', label: 'Concluídos' },
  { value: 'reprovados', label: 'Reprovados' },
]

/** Painel de participação do treinamento publicado: quem abriu, confirmou, assinou e a nota do quiz. */
export function TreinamentoPainel({ item, funcionarios, source, onBack, onEditar, onReaplicar }: Props) {
  const [rows, setRows] = useState<Participacao[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroParticipacao>('todos')
  const [busca, setBusca] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [lembrando, setLembrando] = useState(false)
  const token = useRef(0)
  const toast = useToast()
  const detalheRef = useRef<HTMLDivElement | null>(null)

  const pessoas = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios])
  const nome = useCallback((p: Participacao) => pessoas.get(p.funcionarioId)?.nome || p.nomeAssinante || 'Funcionário sem cadastro', [pessoas])
  const desligado = (p: Participacao) => pessoas.get(p.funcionarioId)?.ativo === false

  const load = useCallback(async () => {
    const current = ++token.current
    setLoading(true)
    setError(null)
    try {
      const list = await source.participacoes(item.id)
      if (current === token.current) { setRows(list); setLoaded(true) }
    } catch (reason) {
      if (current === token.current) setError(erroTexto(reason))
    } finally {
      if (current === token.current) setLoading(false)
    }
  }, [source, item.id])
  useEffect(() => { void load() }, [load])

  // Abaixo de 1120 px o detalhe fica empilhado depois da lista: leva a tela até ele.
  const selecionar = (id: string) => {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 1120px)').matches) requestAnimationFrame(() => { detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); detalheRef.current?.focus({ preventScroll: true }) })
  }

  const termo = busca.trim().toLowerCase()
  const buscados = rows.filter((p) => !termo || nome(p).toLowerCase().includes(termo))
  const visiveis = buscados.filter((p) => matchParticipacao(filtro, p))
  const selected = rows.find((p) => p.id === selectedId) ?? visiveis[0] ?? rows[0]
  const statusSelecionado = selected ? statusParticipacao(selected) : null
  const abertos = rows.filter((p) => p.abertoEm).length
  const concluidos = rows.filter(isConcluida).length
  const assinados = rows.filter((p) => p.assinadoEm).length
  const reprovados = rows.filter((p) => matchParticipacao('reprovados', p)).length
  const vencido = isVencido(item, todaySaoPaulo())

  const publico = publicoLabel(item, funcionarios)

  const lembrar = async (participacao?: Participacao) => {
    if (lembrando) return
    setLembrando(true)
    try {
      const r = await source.lembrar(item.id, participacao?.id)
      const ignorados = r.ignorados ? ` · ${r.ignorados} ignorados (concluídos, na fila ou lembrados nas últimas 24 h)` : ''
      toast(r.enfileirados
        ? { tone: 'success', message: `Lembrete enviado para ${r.enfileirados} ${plural(r.enfileirados, 'funcionário', 'funcionários')}${ignorados}` }
        : { tone: 'info', message: `Nenhum lembrete enviado${ignorados || ': ninguém pendente'}` })
      await load()
    } catch (reason) {
      toast({ tone: 'danger', message: erroTexto(reason, 'Não foi possível enviar o lembrete.') })
    } finally {
      setLembrando(false)
    }
  }
  const algumLembravel = rows.some((p) => podeLembrar(p, Date.now()))

  const etapas = (p: Participacao) => [
    { label: 'Abriu no app', time: formatDate(p.abertoEm) || 'Ainda não abriu', done: Boolean(p.abertoEm) },
    { label: 'Confirmou a leitura', time: formatDate(p.confirmadoEm) || 'Pendente', done: Boolean(p.confirmadoEm) },
    ...(item.exigeAssinatura ? [{ label: 'Assinou', time: formatDate(p.assinadoEm) || 'Pendente', done: Boolean(p.assinadoEm) }] : []),
    ...(item.exigeQuiz ? [{ label: `Quiz (mínimo ${item.notaMinima}%)`, time: p.nota == null ? 'Não respondeu' : `${p.nota}% · ${p.aprovado ? 'aprovado' : 'reprovado'} · ${p.tentativas} ${plural(p.tentativas, 'tentativa', 'tentativas')}`, done: p.aprovado === true }] : []),
    { label: 'Concluiu o treinamento', time: formatDate(p.concluidoEm) || 'Pendente', done: isConcluida(p) },
  ]

  return (
    <>
      <PageHeader
        className="page__header"
        breadcrumb={<Breadcrumb items={[{ label: 'Treinamentos', href: '#/treinamentos' }, { label: 'Participação' }]} />}
        title={item.titulo}
        meta={<>
          <StatusBadge tone="success">Publicado</StatusBadge>
          {item.exigeAssinatura ? <StatusBadge tone="info">Assinatura</StatusBadge> : null}
          {item.exigeQuiz ? <StatusBadge tone="info">Quiz</StatusBadge> : null}
          {vencido ? <StatusBadge tone="danger">Vencido</StatusBadge> : null}
        </>}
        description={`${formatDate(item.publicadoEm)} · ${publico}${item.validade ? ` · validade ${fmtDia(item.validade)}` : ''}${item.editadoEm ? ` · editado em ${formatDate(item.editadoEm)}` : ''}`}
        actions={(
          <div className="tr-actions">
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onBack}>Voltar</Button>
            <Button variant="secondary" icon={<BellRing size={16} />} loading={lembrando} disabled={!algumLembravel} title={algumLembravel ? undefined : 'Ninguém pode ser lembrado agora (concluído, push na fila ou lembrado nas últimas 24 h)'} onClick={() => void lembrar()}>Lembrar pendentes</Button>
            <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && loaded} onClick={() => void load()}>Atualizar</Button>
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar conteúdo</Button>
            <Button variant="secondary" icon={<Repeat size={16} />} onClick={onReaplicar}>Reaplicar</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" title="Não foi possível carregar a participação" action={<Button variant="secondary" onClick={() => void load()}>Tentar de novo</Button>}>{error}</Alert> : null}

      <Grid min={190} className="tr-kpis">
        <MetricCard icon={<Users size={20} />} label="Participantes" value={rows.length} hint={publico} loading={!loaded} />
        <MetricCard icon={<Eye size={20} />} label="Abriram" value={`${abertos} de ${rows.length}`} hint={`${rows.length ? Math.round((abertos / rows.length) * 100) : 0}% abriram no app`} loading={!loaded} />
        {item.exigeAssinatura ? <MetricCard icon={<PenLine size={20} />} tone="info" label="Assinaram" value={`${assinados} de ${rows.length}`} hint={`${rows.length - assinados} sem assinar`} loading={!loaded} /> : null}
        <MetricCard icon={<CheckCircle2 size={20} />} tone="success" label="Concluíram" value={`${concluidos} de ${rows.length}`} hint={`${rows.length - concluidos} ${plural(rows.length - concluidos, 'pendente', 'pendentes')}`} loading={!loaded} />
        {item.exigeQuiz ? <MetricCard icon={<XCircle size={20} />} tone={reprovados ? 'danger' : 'success'} label="Reprovados no quiz" value={reprovados} hint={reprovados ? 'Podem tentar de novo no app' : 'Ninguém reprovado'} loading={!loaded} /> : null}
      </Grid>

      <div className="tr-report">
        <Surface eyebrow="Participação" title="Por funcionário" flush className="tr-results"
          action={<SegmentedControl aria-label="Filtrar participação" size="compact" value={filtro} onChange={setFiltro} options={FILTROS.map((f) => ({ value: f.value, label: `${f.label} · ${buscados.filter((p) => matchParticipacao(f.value, p)).length}` }))} />}>
          <div className="tr-list__toolbar">
            <SearchBox className="tr-search" value={busca} onChange={setBusca} placeholder="Buscar funcionário" aria-label="Buscar funcionário na participação" />
          </div>
          <ul className="tr-results__body" aria-busy={!loaded}>
            {!loaded && loading ? [0, 1, 2].map((i) => <li key={i} className="tr-list__skeleton"><Skeleton shape="rect" height={44} /></li>) : null}
            {visiveis.map((p) => {
              const status = statusParticipacao(p)
              const ativo = selected?.id === p.id
              return (
                <li key={p.id} className={`tr-recipient${ativo ? ' is-selected' : ''}`}>
                  <button type="button" className="tr-recipient__main" aria-pressed={ativo} onClick={() => selecionar(p.id)}>
                    <Avatar name={nome(p)} size="sm" />
                    <span className="tr-recipient__text">
                      <strong>{nome(p)}{desligado(p) ? <StatusBadge tone="neutral">Desligado</StatusBadge> : null}</strong>
                      <small>{status.quando ? `${status.label} em ${formatDate(status.quando)}` : 'Aguardando abertura'}</small>
                      <small className={p.pushStatus === PUSH.falhou ? 'tr-push is-falhou' : 'tr-push'}>{pushLabel(p)}</small>
                    </span>
                    <span className="tr-recipient__nota">{item.exigeQuiz ? (p.nota == null ? 'Sem nota' : `Nota ${p.nota}%`) : ''}</span>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </button>
                </li>
              )
            })}
          </ul>
          {loaded && !rows.length ? <EmptyState icon={<Users size={36} />} title="Nenhum participante registrado">O público-alvo estava vazio na publicação.</EmptyState> : null}
          {loaded && rows.length > 0 && !visiveis.length ? <EmptyState icon={<SearchX size={36} />} title="Ninguém com estes filtros" action={<Button variant="secondary" onClick={() => { setBusca(''); setFiltro('todos') }}>Limpar filtros</Button>} /> : null}
        </Surface>

        <aside className="tr-side" aria-label="Detalhe e conteúdo publicado">
          {selected ? (
            <div ref={detalheRef} tabIndex={-1} className="tr-detail-anchor">
            <Surface title={nome(selected)} action={statusSelecionado ? <StatusBadge tone={statusSelecionado.tone}>{statusSelecionado.label}</StatusBadge> : null} className="tr-detail">
              <span className="tr-label">Linha do tempo</span>
              <ol className="tr-timeline">
                {etapas(selected).map((step) => (
                  <li key={step.label} className={step.done ? 'is-done' : undefined}>
                    <span className="tr-timeline__dot" aria-hidden="true">{step.done ? <Check size={12} /> : null}</span>
                    <span><strong>{step.label}</strong><small>{step.time}</small></span>
                  </li>
                ))}
              </ol>
              {selected.assinaturaJson ? <><span className="tr-label">Assinatura</span><div className="tr-signature"><Assinatura value={parseSignature(selected.assinaturaJson)} /></div></> : null}
              {selected.pushStatus === PUSH.falhou && podeLembrar(selected, Date.now()) ? <Button variant="secondary" size="compact" icon={<BellRing size={14} />} loading={lembrando} onClick={() => void lembrar(selected)}>Reenviar push</Button> : null}
              {vencido && !isConcluida(selected) ? <p className="tr-pending"><CalendarClock size={16} aria-hidden="true" />Validade vencida em {fmtDia(item.validade)} sem conclusão.</p> : null}
            </Surface>
            </div>
          ) : null}
          <Surface eyebrow="Conteúdo" title="O que foi publicado" className="tr-sent">
            {item.descricao ? <p className="tr-device__desc">{item.descricao}</p> : null}
            {item.videoUrl ? <p><a href={item.videoUrl} target="_blank" rel="noreferrer">Abrir vídeo</a></p> : null}
            <Conteudo texto={item.conteudo} className="tr-conteudo" nivel={3} />
            <AnexosSecao treinamentoId={item.id} anexos={item.anexos} source={source} disabled onChange={() => undefined} somenteLeitura />
            {item.exigeQuiz ? <p className="tr-hint">{item.perguntas.length} {plural(item.perguntas.length, 'pergunta', 'perguntas')} no quiz · nota mínima {item.notaMinima}%</p> : null}
          </Surface>
        </aside>
      </div>
    </>
  )
}
