import { useEffect, useId, useMemo, useState } from 'react'
import { Alert, Button, Dialog, Drawer, EmptyState, Menu, useToast } from '@betinhos/ui'
import { ArrowRightLeft, Pencil, SearchX } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { FORM_KEYS, changePayload, createPayload, emptyForm, isDirty, toForm, validateForm, type CurriculoForm as FormValues, type FormErrors } from '../domain/form'
import { findDuplicates } from '../domain/duplicates'
import { stageFor, type Stage } from '../domain/funnel'
import { clearDraft, readDraft, writeDraft } from '../domain/submission'
import { mapCurriculo } from '../data/queries'
import { fileProblem } from '../data/upload'
import { saveExisting, submitNew } from '../data/submit'
import type { Source } from '../data/source'
import { CurriculoForm } from './CurriculoForm'
import { CurriculoView } from './CurriculoView'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Curriculo[]
  choices: ChoiceSet
  stages: Stage[]
  source: Source
  onSaved: (c: Curriculo) => void
  onMove: (c: Curriculo, stage: Stage) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Visão, edição e cadastro no mesmo drawer largo; fechar com alteração pede confirmação e salvar trava o fechamento. */
export function CurriculoDrawer({ target, onTarget, list, choices, stages, source, onSaved, onMove }: Props) {
  const toast = useToast()
  const formId = useId()
  const current = target && target.mode !== 'create' ? list.find((c) => c.id === target.id) ?? null : null
  const editing = target?.mode === 'edit' || target?.mode === 'create'
  const editKey = target?.mode === 'edit' ? `edit:${target.id}` : target?.mode === 'create' ? 'create' : null
  const defaultStatus = stages[0]?.value ?? null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(() => emptyForm(defaultStatus))
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [pendingExit, setPendingExit] = useState<{ next: DrawerTarget } | null>(null)

  // Prepara o formulário só ao entrar em edição ou cadastro (não a cada atualização da lista).
  useEffect(() => {
    if (!editKey) { setReady(null); return }
    const start = target?.mode === 'edit' && current ? toForm(current) : emptyForm(defaultStatus)
    const draft = target?.mode === 'create' ? readDraft(source.kv, start) : null
    setBase(start)
    setForm(draft ?? start)
    setRestored(draft != null)
    setErrors({})
    setFile(null)
    setFileError(null)
    setCreatedId(null)
    setReady(editKey)
  }, [editKey])

  // Rascunho automático só do cadastro novo, depois que o formulário foi preparado.
  useEffect(() => {
    if (target?.mode !== 'create' || ready !== 'create') return
    if (isDirty(base, form)) writeDraft(source.kv, form)
    else clearDraft(source.kv)
  }, [form, base, ready, target?.mode, source.kv])

  const dirty = editing && ready === editKey && (isDirty(base, form) || file != null)
  const selfId = target?.mode === 'edit' ? target.id : createdId
  const duplicates = useMemo(() => (editing ? findDuplicates(form, list, selfId) : []), [editing, form, list, selfId])

  function requestClose(next: DrawerTarget) {
    if (saving) return
    if (dirty) { setPendingExit({ next }); return }
    onTarget(next)
  }

  function discard() {
    const next = pendingExit?.next ?? null
    setPendingExit(null)
    if (target?.mode === 'create') clearDraft(source.kv)
    setForm(base)
    setFile(null)
    onTarget(next)
  }

  function clearForm() {
    clearDraft(source.kv)
    setForm(base)
    setFile(null)
    setRestored(false)
  }

  function chooseFile(next: File | null) {
    if (!next) { setFile(null); setFileError(null); return }
    const problem = fileProblem(next)
    setFileError(problem)
    if (!problem) setFile(next)
  }

  async function save() {
    const found = validateForm(form)
    setErrors(found)
    const first = FORM_KEYS.find((key) => found[key])
    if (first) { document.querySelector<HTMLElement>(`.cv-form [name="${first}"]`)?.focus(); return }
    if (fileError) return
    setSaving(true)
    try {
      if (target?.mode === 'create') {
        const payload = createPayload(form)
        const result = await submitNew(source, payload, file)
        const saved = mapCurriculo({ ...payload, ...(result.link ? { new_linkcurriculo: result.link } : {}), new_curriculoid: result.recordId, createdon: new Date().toISOString() })
        onSaved(saved)
        if (result.uploadFailed) { setCreatedId(saved.id); toast({ tone: 'danger', message: result.message }); return }
        clearDraft(source.kv)
        toast({ tone: 'success', message: result.message })
        onTarget({ mode: 'view', id: saved.id })
      } else if (target?.mode === 'edit' && current) {
        const full = createPayload(form)
        const result = await saveExisting(source, current.id, changePayload(base, form), file, full)
        const saved: Curriculo = { ...mapCurriculo({ ...full, new_curriculoid: current.id }), criadoEm: current.criadoEm }
        if (result.link) saved.link = result.link
        onSaved(saved)
        if (result.uploadFailed) { setBase(form); toast({ tone: 'danger', message: result.message }); return }
        toast({ tone: 'success', message: result.message })
        onTarget({ mode: 'view', id: current.id })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const stage = current ? stageFor(current, stages) : undefined
  const title = target?.mode === 'create' ? 'Novo currículo' : current?.nome || 'Currículo'
  const eyebrow = target?.mode === 'create' ? 'Cadastro' : target?.mode === 'edit' ? 'Editar currículo' : stage?.label

  let footer
  if (editing && target) {
    footer = (
      <div className="cv-drawer__actions">
        <Button variant="secondary" disabled={saving} onClick={() => requestClose(target.mode === 'edit' ? { mode: 'view', id: target.id } : null)}>Cancelar</Button>
        <Button key="submit" type="submit" form={formId} loading={saving}>{target.mode === 'create' ? 'Salvar currículo' : 'Salvar alterações'}</Button>
      </div>
    )
  } else if (current && stage) {
    footer = (
      <div className="cv-drawer__actions">
        <Menu
          align="start"
          trigger={(props) => <Button variant="secondary" icon={<ArrowRightLeft size={16} />} {...props}>Mover para…</Button>}
          actions={stages.filter((s) => s.value !== stage.value).map((s) => ({ id: String(s.value), label: s.short, onSelect: () => onMove(current, s) }))}
        />
        <Button key="edit" icon={<Pencil size={16} />} onClick={() => onTarget({ mode: 'edit', id: current.id })}>Editar</Button>
      </div>
    )
  }

  let body
  if (editing) {
    body = (
      <>
        {restored && target?.mode === 'create'
          ? <Alert tone="info" action={<Button variant="ghost" size="compact" onClick={clearForm}>Limpar formulário</Button>}>Rascunho restaurado.</Alert>
          : null}
        <CurriculoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} choices={choices} stages={stages}
          file={file} onFile={chooseFile} fileError={fileError} uploadEnabled={source.uploadEnabled} duplicates={duplicates}
          onSeeDuplicate={(id) => requestClose({ mode: 'view', id })} disabled={saving} />
      </>
    )
  } else if (current) {
    body = <CurriculoView c={current} choices={choices} />
  } else if (target) {
    body = <EmptyState align="start" icon={<SearchX size={36} />} title="Currículo não encontrado">Ele pode ter sido inativado. Atualize a página.</EmptyState>
  }

  return (
    <>
      <Drawer open={target != null} onClose={() => requestClose(null)} size="wide" title={title} eyebrow={eyebrow} footer={footer}>
        {body}
      </Drawer>
      <Dialog open={pendingExit != null} onClose={() => setPendingExit(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={discard}>Descartar</Button>
        </>}>
        As alterações feitas neste currículo serão perdidas.
      </Dialog>
    </>
  )
}
