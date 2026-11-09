import { Button, EmptyState, PageToolbar, Skeleton, Stack, Surface } from '@betinhos-executive-service/ui'
import { Scale, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { OperationData, Person, SubmitResult } from '../domain'
import { getRecordIdFromLocation, loadOperation, searchDirectoryPeople, submitOperation, updatePersonEmail } from '../dataverse'
import { logAppError } from '../errorLogger'
import { formatCurrency } from '../money'
import { activeDrafts, changeCount, diffDrafts, draftReducer, initialState, toSubmitPayers, validate, type DraftAction, type DraftState, type PayerDraft } from '../payerDraft'
import { AllocationSummary } from './components/AllocationSummary'
import { DiscardDialog } from './components/DiscardDialog'
import { FeedbackNotice } from './components/FeedbackNotice'
import { OperationHeader } from './components/OperationHeader'
import { PayerEditorRow, type RowChange } from './components/PayerEditorRow'
import { PersonSelect } from './components/PersonSelect'
import { PopupShell } from './components/PopupShell'
import { ResultActions, ResultView, type ResultRow } from './components/ResultView'
import { SaveSummaryDialog } from './components/SaveSummaryDialog'
import { StickyActionBar } from './components/StickyActionBar'

const CLOSE_MESSAGE = 'cr40f-gerar-pagantes:close'
const REQUEST_CLOSE_MESSAGE = 'cr40f-gerar-pagantes:request-close'
const REQUEST_CLOSE_ACK = 'cr40f-gerar-pagantes:request-close-ack'
const emptyState: DraftState = { drafts: [], pendingEmails: {} }
type Notice = { tone: 'error' | 'success'; text: string } | null
type PendingAction = 'close' | 'reload'

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) return error.message
  return fallback
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const linkResultLabel = { Generated: 'Link gerado', Pending: 'Link em processamento', Failed: 'Falha no link', Indeterminate: 'Link indeterminado', NotApplicable: 'Sem link' } as const
const emailResultLabel = { Sent: 'E-mail enviado', Pending: 'E-mail em processamento', Failed: 'Falha no e-mail', NotApplicable: 'Sem e-mail' } as const

function toResultRows(drafts: PayerDraft[], result: SubmitResult): ResultRow[] {
  return activeDrafts(drafts).map((draft) => {
    const item = result.results.find((entry) => entry.paganteId === draft.id)
    return {
      key: draft.key,
      name: draft.name,
      amountCents: draft.amountCents,
      paymentUrl: item?.paymentUrl ?? draft.paymentUrl,
      linkLabel: linkResultLabel[item?.linkStatus ?? 'NotApplicable'],
      emailLabel: emailResultLabel[item?.emailStatus ?? 'NotApplicable'],
      error: result.errors.find((error) => error.paganteId === draft.id)?.message
    }
  })
}

export function App() {
  const [operation, setOperation] = useState<OperationData | null>(null)
  const [state, dispatchDraft] = useReducer(draftReducer, emptyState)
  const [touched, setTouched] = useState(false)
  const [invalidAmounts, setInvalidAmounts] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [result, setResult] = useState<{ title: string; rows: ResultRow[] } | null>(null)
  const savedOnce = useRef(false)
  const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1'

  const dispatch = useCallback((action: DraftAction) => { setTouched(true); dispatchDraft(action) }, [])

  const load = useCallback(async () => {
    setLoading(true); setNotice(null); setResult(null)
    try {
      const id = getRecordIdFromLocation()
      if (!id && window.Xrm?.WebApi) throw new Error('Nenhuma OP foi recebida pela tela.')
      const data = await loadOperation(id ?? '00000000-0000-0000-0000-000000000001')
      setOperation(data)
      dispatchDraft({ type: 'reset', state: initialState(data.payers, data.people, data.totalCents) })
      setTouched(false); setInvalidAmounts(new Set())
    } catch (error) {
      console.error('[GerarPagantes] Não foi possível carregar a OP.', error)
      await logAppError(error, { source: 'React', action: 'refresh', phase: 'load-operation', component: 'App' })
      setNotice({ tone: 'error', text: errorMessage(error, 'Não foi possível carregar a OP.') })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const totalCents = operation?.totalCents ?? 0
  const { drafts, pendingEmails } = state
  const isEditMode = (operation?.payers.length ?? 0) > 0
  const validation = useMemo(() => validate(drafts, totalCents), [drafts, totalCents])
  const changes = useMemo(() => diffDrafts(operation?.payers ?? [], drafts), [operation, drafts])
  const changeTotal = changeCount(changes)
  const pendingEmailCount = Object.keys(pendingEmails).length
  const active = activeDrafts(drafts)
  const hasFailures = active.some((draft) => draft.existingPayerId && (draft.linkStatus === 'Failed' || draft.emailStatus === 'Failed'))
  const blocking = validation.blocking || invalidAmounts.size > 0
  const hasWork = isEditMode ? changeTotal > 0 || pendingEmailCount > 0 || hasFailures : active.length > 0
  const canSubmit = !blocking && hasWork
  const dirty = touched && !result
  const rowChange = useMemo(() => {
    const map = new Map<string, RowChange>()
    if (!isEditMode) return map
    changes.added.forEach((draft) => map.set(draft.key, 'new'))
    changes.edited.forEach(({ after }) => map.set(after.key, 'edited'))
    return map
  }, [changes, isEditMode])
  const suggestions = useMemo(() => {
    const people = operation?.people ?? []
    return [...people, ...(operation?.payers ?? []).filter((payer) => !people.some((person) => person.id === payer.id))]
  }, [operation])
  const activeIds = useMemo(() => new Set(active.map((draft) => draft.id)), [active])
  const emailCount = active.filter((draft) => draft.generateLink && draft.sendEmail && (rowChange.has(draft.key) || draft.resendEmail || draft.emailStatus === 'Failed')).length

  const dirtyRef = useRef(dirty); const savingRef = useRef(saving)
  useEffect(() => { dirtyRef.current = dirty; savingRef.current = saving }, [dirty, saving])

  const postClose = useCallback((refresh: boolean) => {
    if (!isEmbedded || window.parent === window) return
    window.parent.postMessage({ type: CLOSE_MESSAGE, refresh }, window.location.origin)
  }, [isEmbedded])

  const requestClose = useCallback(() => {
    if (savingRef.current) return
    if (dirtyRef.current) { setPendingAction('close'); return }
    postClose(savedOnce.current)
  }, [postClose])

  // Esc e clique fora no Dynamics pedem o fechamento; a tela decide se precisa confirmar.
  useEffect(() => {
    if (!isEmbedded) return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== REQUEST_CLOSE_MESSAGE) return
      window.parent.postMessage({ type: REQUEST_CLOSE_ACK }, window.location.origin)
      requestClose()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isEmbedded, requestClose])

  function reload() {
    if (dirty) { setPendingAction('reload'); return }
    void load()
  }

  function discard() {
    const action = pendingAction
    setPendingAction(null)
    if (action === 'close') postClose(savedOnce.current)
    if (action === 'reload') void load()
  }

  const markAmountInvalid = useCallback((key: string, invalid: boolean) => {
    setInvalidAmounts((current) => {
      if (current.has(key) === invalid) return current
      const next = new Set(current); if (invalid) next.add(key); else next.delete(key); return next
    })
  }, [])

  function focusFirstError() {
    const key = [...invalidAmounts][0] ?? [...validation.rowErrors.keys()][0]
    const row = key ? document.querySelector<HTMLElement>(`[data-payer-key="${CSS.escape(key)}"]`) : null
    row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    row?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')?.focus({ preventScroll: true })
  }

  function save() {
    if (!operation || saving) return
    if (blocking) { focusFirstError(); return }
    if (!canSubmit) return
    if (isEditMode && changeTotal > 0) { setSummaryOpen(true); return }
    void executeSave()
  }

  async function executeSave() {
    if (!operation) return
    setSaving(true); setNotice(null)
    try {
      // O plugin confere o e-mail do cadastro; por isso os e-mails novos são gravados antes.
      for (const [personId, email] of Object.entries(pendingEmails)) await updatePersonEmail(personId, email)
      const response = await submitOperation(operation.id, {
        requestId: crypto.randomUUID(),
        expectedFinanceiroVersion: operation.version,
        financeiroDisplayId: operation.displayId,
        totalCents,
        allowTotalMismatch: validation.differenceCents !== 0,
        replaceExisting: false,
        serviceStartDate: operation.serviceStartDate,
        serviceEndDate: operation.serviceEndDate,
        pagantes: toSubmitPayers(drafts)
      })
      savedOnce.current = true
      const general = response.errors.filter((error) => !error.paganteId).map((error) => error.message).join(' ')
      setResult({ title: response.success ? (isEditMode ? 'Alterações salvas' : 'Pagantes gerados') : 'Salvo com falhas', rows: toResultRows(drafts, response) })
      if (general) setNotice({ tone: 'error', text: general })
      setTouched(false); setSummaryOpen(false)
    } catch (error) {
      console.error('[GerarPagantes] Não foi possível salvar os pagantes.', { financeiroId: operation.id, error })
      await logAppError(error, { source: 'React', action: 'save', phase: 'submit-operation', component: 'App', detailId: operation.id, detailType: 'cr40f_financeiro' })
      setSummaryOpen(false)
      setNotice({ tone: 'error', text: `${errorMessage(error, 'Não foi possível salvar.')} Suas alterações continuam na tela; corrija e tente de novo.` })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="popup-loading" aria-busy="true"><Stack gap="4"><Skeleton height={56} shape="rect" /><Skeleton height={96} shape="rect" /><Skeleton height={220} shape="rect" /></Stack></div>
  if (!operation) return <div className="state-screen"><EmptyState tone="danger" title="Não foi possível abrir esta OP." action={<Button variant="secondary" onClick={() => void load()}>Tentar novamente</Button>}>{notice?.text}</EmptyState></div>

  const difference = validation.differenceCents
  const differenceText = difference ? ` · diferença de ${formatCurrency(Math.abs(difference))}` : ''
  const errorCount = validation.rowErrors.size + invalidAmounts.size
  const hint = !active.length ? 'Adicione pelo menos um pagante'
    : blocking ? `Corrija ${plural(errorCount, 'pendência', 'pendências')} para salvar`
    : isEditMode ? (changeTotal ? `${plural(changeTotal, 'alteração', 'alterações')} · Pronto para salvar${differenceText}` : pendingEmailCount ? `E-mail a cadastrar · Pronto para salvar` : hasFailures ? 'Falhas de link ou e-mail · Pronto para reprocessar' : 'Nenhuma alteração para salvar')
    : `${plural(active.length, 'pagante', 'pagantes')} · Pronto para gerar${differenceText}`
  const label = isEditMode
    ? (changeTotal || pendingEmailCount ? `Salvar alterações${changeTotal ? ` (${changeTotal})` : ''}` : hasFailures ? 'Reprocessar falhas' : 'Salvar alterações')
    : difference ? `Gerar com diferença de ${formatCurrency(Math.abs(difference))}` : 'Gerar pagantes'

  return <PopupShell onBackdropClick={isEmbedded ? requestClose : undefined}>
    <div className="popup-content">
      <OperationHeader editing={isEditMode} displayId={operation.displayId} serviceCount={operation.serviceCount} balanced={difference === 0} onRefresh={reload} onClose={isEmbedded ? requestClose : undefined} />
      {notice ? <FeedbackNotice {...notice} /> : null}
      {result ? <ResultView title={result.title} rows={result.rows} /> : <>
        <Surface flush className="payers-panel">
          <PageToolbar variant="filters" label="Pagantes" className="payers-panel__toolbar"
            start={<PersonSelect ariaLabel="Adicionar pagante" placeholder="Adicionar pagante" suggestions={suggestions} excludedIds={activeIds} onSearch={searchDirectoryPeople}
              onSelect={(person: Person) => dispatch({ type: 'add', person, saved: operation.payers.find((payer) => payer.id === person.id), totalCents })} />}
            end={<Button variant="secondary" size="compact" icon={<Scale size={15} />} disabled={active.filter((draft) => !draft.settled).length === 0} onClick={() => dispatch({ type: 'splitEvenly', totalCents })}>Dividir igualmente</Button>} />
          {drafts.length ? <div className="payers-panel__list">
            <div className="payers-panel__columns" aria-hidden="true"><span>Pagante</span><span>Forma</span><span>Valor</span><span>Envio</span></div>
            {drafts.map((draft) => <PayerEditorRow key={draft.key} draft={draft} change={rowChange.get(draft.key)} errors={validation.rowErrors.get(draft.key) ?? []} totalCents={totalCents} people={suggestions} onSearch={searchDirectoryPeople} dispatch={dispatch} onAmountInvalid={markAmountInvalid} />)}
          </div> : <EmptyState compact icon={<UsersRound size={32} />} title="Nenhum pagante ainda">Use a busca acima para adicionar quem vai pagar esta OP.</EmptyState>}
          <AllocationSummary totalCents={totalCents} allocatedCents={validation.allocatedCents} remainingCents={difference} />
        </Surface>
      </>}
    </div>
    {result
      ? <ResultActions failures={result.rows.filter((row) => row.error).length} onClose={isEmbedded ? () => postClose(true) : undefined} onEditAgain={() => void load()} />
      : <StickyActionBar hint={hint} ready={canSubmit} label={label} saving={saving} onSave={save} />}
    <SaveSummaryDialog open={summaryOpen} changes={changes} emailCount={emailCount} differenceCents={difference} saving={saving} onReview={() => setSummaryOpen(false)} onConfirm={() => void executeSave()} />
    <DiscardDialog open={pendingAction !== null} onKeepEditing={() => setPendingAction(null)} onDiscard={discard} />
  </PopupShell>
}
