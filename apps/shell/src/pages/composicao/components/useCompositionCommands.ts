import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { logAppError } from '@betinhos/ui/error-logger'
import type { Composition, MoneyField } from '../data/compositions'
import { deleteCompositions, getOpFlowUrl, inspectCompositionsForOp, triggerOpFlow } from '../data/dataverse'
import { deleteMockCompositions, generateMockOp, inspectMockCompositionsForOp } from '../data/mock-store'

export type CommandPhase = 'refresh' | 'inspect-op' | 'send-op' | 'delete' | null
export type CommandNotice = { tone: 'success' | 'warning' | 'error'; title: string; detail?: string; retryRefresh?: boolean }
// `background`: releitura automática; por padrão sem aviso e descartada se a pessoa começar a editar.
export type RefreshOptions = { background?: boolean; showNotice?: boolean; preserveFieldDrafts?: boolean }
type OpInspection = Awaited<ReturnType<typeof inspectCompositionsForOp>>
export type PendingConfirm = { kind: 'op'; result: OpInspection } | { kind: 'delete'; ids: string[]; names: string[] }

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  if (typeof error === 'string') return error
  return fallback
}

type CommandsOptions = {
  dataSource: 'dataverse' | 'mock' | null
  selectedIds: string[]
  selectedVisibleRows: Composition[]
  commandLocked: boolean
  refreshData: (options?: RefreshOptions) => Promise<boolean>
  setCommandPhase: Dispatch<SetStateAction<CommandPhase>>
  setCommandProgress: Dispatch<SetStateAction<string>>
  setNotice: Dispatch<SetStateAction<CommandNotice | null>>
  setRows: Dispatch<SetStateAction<Composition[]>>
  setSelectedRowIds: Dispatch<SetStateAction<string[]>>
  setSelectedCell: Dispatch<SetStateAction<{ rowId: string; field: MoneyField } | null>>
}

/** Gerar OP e excluir composições: verificação, confirmação e execução. */
export function useCompositionCommands({ dataSource, selectedIds, selectedVisibleRows, commandLocked, refreshData, setCommandPhase, setCommandProgress, setNotice, setRows, setSelectedRowIds, setSelectedCell }: CommandsOptions) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const closeConfirm = useCallback(() => setPendingConfirm(null), [])

  const generateOp = useCallback(async () => {
    if (!selectedIds.length || !dataSource || commandLocked) return
    setCommandPhase('inspect-op')
    setCommandProgress('Verificando serviços e OPs existentes…')
    setNotice(null)
    try {
      const result = dataSource === 'mock' ? inspectMockCompositionsForOp(selectedIds) : await inspectCompositionsForOp(selectedIds)
      setPendingConfirm({ kind: 'op', result })
    } catch (error) {
      void logAppError(error, { action: 'verificar-servicos-op', phase: 'load', component: 'useCompositionCommands' })
      setNotice({ tone: 'error', title: 'Falha ao verificar serviços', detail: errorMessage(error, 'Tente novamente após conferir o acesso ao Dataverse.') })
    }
    finally { setCommandPhase(null); setCommandProgress('') }
  }, [selectedIds, dataSource, commandLocked])

  const excludeSelected = useCallback(() => {
    if (!selectedIds.length || !dataSource || commandLocked) return
    setPendingConfirm({ kind: 'delete', ids: selectedIds, names: selectedVisibleRows.map((row) => row.client) })
  }, [selectedIds, selectedVisibleRows, dataSource, commandLocked])

  const confirmPending = useCallback(async () => {
    const pending = pendingConfirm
    if (!pending) return
    setPendingConfirm(null)
    setNotice(null)
    if (pending.kind === 'op') {
      setCommandPhase('send-op')
      setCommandProgress(dataSource === 'mock' ? 'Gerando OP de demonstração…' : 'Enviando solicitação ao Power Automate…')
      try {
        if (dataSource === 'mock') generateMockOp(pending.result.eligible)
        else {
          const url = await getOpFlowUrl()
          await triggerOpFlow(url, pending.result.eligible)
        }
        const skipped = pending.result.existing.length + pending.result.withoutService.length + pending.result.readErrors.length
        setNotice({ tone: 'success', title: dataSource === 'mock' ? 'OP simulada gerada' : 'Solicitação de OP enviada', detail: `1 OP com ${servicesLabel(pending.result.eligible.length)}${dataSource === 'mock' ? ' (simulação local)' : ' enviada ao Flow'}.${skipped ? ` ${skipped} não processado(s); veja o resumo da seleção antes de uma nova tentativa.` : ''}` })
      } catch (error) {
        void logAppError(error, { action: 'gerar-op', phase: 'submit', component: 'useCompositionCommands' })
        setNotice({ tone: 'error', title: 'O Flow não confirmou a solicitação', detail: `${errorMessage(error, 'Falha de conexão.')} Confira as OPs antes de tentar novamente para evitar duplicidade.` })
      }
      finally { setCommandPhase(null); setCommandProgress('') }
      return
    }
    setCommandPhase('delete')
    setCommandProgress(`Excluindo 0 de ${pending.ids.length}…`)
    try {
      const onProgress = (completed: number, total: number) => setCommandProgress(`Excluindo ${completed} de ${total}…`)
      const result = dataSource === 'mock' ? deleteMockCompositions(pending.ids, onProgress) : await deleteCompositions(pending.ids, onProgress)
      if (result.succeeded.length) {
        setRows((current) => current.filter((row) => !result.succeeded.includes(row.id)))
        setSelectedRowIds((current) => current.filter((id) => !result.succeeded.includes(id)))
        setSelectedCell((current) => current && result.succeeded.includes(current.rowId) ? null : current)
        if (!(await refreshData({ showNotice: false }))) {
          setNotice({ tone: 'warning', title: 'Exclusão concluída; atualização falhou', detail: `${result.succeeded.length} excluída(s) · ${result.failed.length} não excluída(s). Os registros excluídos foram removidos desta grade. Atualize novamente quando a conexão voltar.`, retryRefresh: true })
          return
        }
      }
      setNotice({ tone: result.failed.length ? 'warning' : 'success', title: result.failed.length ? 'Exclusão parcial' : 'Composições excluídas', detail: `${result.succeeded.length} excluída(s) · ${result.failed.length} não excluída(s).${result.failed.length ? ` ${result.failed.map((item) => `${item.id}: ${item.message}`).join(' | ')}` : ''}` })
    } catch (error) {
      void logAppError(error, { action: 'excluir-composicoes', phase: 'submit', component: 'useCompositionCommands' })
      setNotice({ tone: 'error', title: 'Falha ao excluir composições', detail: errorMessage(error, 'Confira os registros antes de tentar novamente.') })
    }
    finally { setCommandPhase(null); setCommandProgress('') }
  }, [dataSource, pendingConfirm, refreshData])
  return { pendingConfirm, generateOp, excludeSelected, confirmPending, closeConfirm }
}

/** Textos do diálogo de confirmação para OP e exclusão. */
export function confirmDialogContent(pending: PendingConfirm, mock: boolean) {
  if (pending.kind === 'delete') return {
    kind: pending.kind,
    title: 'Excluir composições?',
    description: `${pending.ids.length} ${pending.ids.length === 1 ? 'composição será excluída' : 'composições serão excluídas'} ${mock ? 'dos dados locais desta sessão' : 'do Dataverse'}.`,
    items: pending.names.map((name, index) => `${name || 'Composição sem cliente'} · ${pending.ids[index]}`),
    summary: undefined,
    confirmLabel: `Excluir ${pending.ids.length}`,
  }
  const { eligible, existing, withoutService, readErrors } = pending.result
  return {
    kind: pending.kind,
    title: eligible.length ? `${mock ? 'Simular' : 'Gerar'} 1 ordem de pagamento com ${servicesLabel(eligible.length)}?` : 'Nenhuma OP pronta para gerar',
    description: eligible.length ? mock ? 'Simulação local. Nenhuma OP será criada no Dataverse.' : `Uma única OP será criada e vinculada ${eligible.length === 1 ? 'ao serviço elegível' : `aos ${eligible.length} serviços elegíveis`}.` : 'Os serviços selecionados precisam de atenção antes de gerar OP.',
    items: [
      ...existing.map((id) => `${id} · OP já existente`),
      ...withoutService.map((id) => `${id} · sem serviço`),
      ...readErrors.map((id) => `${id} · erro de leitura`),
    ],
    summary: [
      { label: 'Elegíveis', count: eligible.length },
      { label: existing.length === 1 ? 'já tem OP' : 'já têm OP', count: existing.length, tone: 'warning' as const },
      { label: 'sem serviço', count: withoutService.length, tone: 'warning' as const },
      { label: 'com erro de leitura', count: readErrors.length, tone: 'error' as const },
    ],
    confirmLabel: `${mock ? 'Simular' : 'Gerar'} 1 OP`,
  }
}

function servicesLabel(count: number) {
  return `${count} ${count === 1 ? 'serviço' : 'serviços'}`
}
