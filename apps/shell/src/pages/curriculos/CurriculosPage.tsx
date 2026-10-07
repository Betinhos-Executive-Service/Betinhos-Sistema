import { useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, StatusBadge, ToastProvider, useToast } from '@betinhos/ui'
import { Plus, ScrollText, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { statusPatch } from './data/mutations'
import type { Curriculo } from './domain/types'
import { EMPTY_FILTERS, buildStages, cargoOptions, filterCurriculos, groupByStage, stageFor, type Filters, type Stage } from './domain/funnel'
import { useCurriculos } from './useCurriculos'
import { useBoardDrag } from './useBoardDrag'
import { CurriculoFilters } from './components/CurriculoFilters'
import { BoardSkeleton, FunnelBoard } from './components/FunnelBoard'
import { FunnelTabs } from './components/FunnelTabs'
import { CurriculoDrawer, type DrawerTarget } from './components/CurriculoDrawer'
import './curriculos.css'

export function CurriculosPage({ host }: { host: Host }) {
  return <ToastProvider><Curriculos host={host} /></ToastProvider>
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Curriculos({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host, import.meta.env.VITE_CURRICULO_UPLOAD_URL), [host])
  const cv = useCurriculos(source)
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [target, setTarget] = useState<DrawerTarget>(null)
  const [confirm, setConfirm] = useState<{ c: Curriculo; stage: Stage } | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [activeTab, setActiveTab] = useState<number | null>(null)

  const now = useMemo(() => new Date(), [cv.list])
  const stages = useMemo(() => buildStages(cv.choices?.status ?? []), [cv.choices])
  const visible = useMemo(() => filterCurriculos(cv.list, filters), [cv.list, filters])
  const groups = useMemo(() => groupByStage(visible, stages), [visible, stages])
  const cargos = useMemo(() => cargoOptions(cv.list), [cv.list])

  async function move(c: Curriculo, stage: Stage) {
    try {
      await cv.mutate(c.id, { status: stage.value }, () => source.update(c.id, statusPatch(stage.value)))
      toast({ tone: 'success', message: `${c.nome} movido para ${stage.short}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível mover ${c.nome}. ${reasonText(reason)} Tente de novo.` })
    }
  }

  function requestMove(c: Curriculo, stage: Stage) {
    if (stageFor(c, stages)?.value === stage.value) return
    if (stage.confirm) { setConfirm({ c, stage }); return }
    void move(c, stage)
  }

  const drag = useBoardDrag((id, value) => {
    const c = cv.list.find((item) => item.id === id)
    const stage = stages.find((s) => s.value === value)
    if (!c || !stage) return false
    if (stage.confirm) { setConfirm({ c, stage }); return false }
    void move(c, stage)
    return true
  })

  const openCreate = () => setTarget({ mode: 'create' })
  const openView = (id: string) => setTarget({ mode: 'view', id })

  let body
  if (cv.loading && !cv.choices) body = <BoardSkeleton />
  else if (cv.error && !cv.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar os currículos" action={<Button variant="secondary" onClick={() => void cv.reload()}>Tentar de novo</Button>}>{cv.error}</Alert>
  } else if (!stages.length) {
    body = <Alert tone="danger" title="Etapas do funil indisponíveis">A coluna de status do currículo não tem as opções esperadas. Avise a TI.</Alert>
  } else if (!cv.list.length) {
    body = <EmptyState className="surface" align="start" icon={<ScrollText size={36} />} title="Nenhum currículo cadastrado" action={<Button icon={<Plus size={16} />} onClick={openCreate}>Novo currículo</Button>}>Cadastre o primeiro candidato para começar o funil.</EmptyState>
  } else if (!visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum currículo encontrado para estes filtros" action={<Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>} />
  } else if (mobile) {
    body = <FunnelTabs stages={stages} groups={groups} choices={cv.choices!} now={now} onOpen={openView} onMove={requestMove} active={activeTab} onActive={setActiveTab} />
  } else {
    body = <FunnelBoard stages={stages} groups={groups} choices={cv.choices!} now={now} onOpen={openView} onMove={requestMove} drag={drag} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} />
  }

  const reprovar = confirm?.stage.key === 'reprovado'
  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Currículos"
      meta={<span className="cv-meta">{cv.choices ? `${cv.list.length} candidatos` : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      actions={<Button icon={<Plus size={16} />} onClick={openCreate}>Novo currículo</Button>}
      toolbar={cv.choices && cv.list.length ? <CurriculoFilters filters={filters} onChange={setFilters} cargos={cargos} choices={cv.choices} /> : undefined}
    >
      {body}
      {cv.choices ? (
        <CurriculoDrawer target={target} onTarget={setTarget} list={cv.list} choices={cv.choices} stages={stages} source={source} onSaved={cv.upsert} onMove={requestMove} />
      ) : null}
      <Dialog open={confirm != null} onClose={() => setConfirm(null)} tone={reprovar ? 'danger' : 'neutral'} title={confirm ? `Mover ${confirm.c.nome} para ${confirm.stage.short}?` : ''}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Manter etapa</Button>
          <Button variant={reprovar ? 'danger' : 'primary'} onClick={() => { const next = confirm!; setConfirm(null); void move(next.c, next.stage) }}>
            {confirm ? `Mover para ${confirm.stage.short}` : 'Mover'}
          </Button>
        </>}>
        {reprovar ? 'O candidato sai do funil ativo, mas o cadastro continua disponível na coluna Reprovado.' : 'Use esta etapa só depois da admissão confirmada.'}
      </Dialog>
    </PageLayout>
  )
}
