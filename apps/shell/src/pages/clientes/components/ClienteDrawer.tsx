import { useEffect, useId, useState } from 'react'
import { Alert, Button, Dialog, Drawer, Field, Input, Textarea, useToast } from '@betinhos/ui'
import { Pencil, Users } from 'lucide-react'
import type { AlvoGaveta } from '../../../nav/queryState'
import type { Source } from '../data/source'
import { MAX_LENGTH, applyForm, buildPayload, emptyForm, isDirty, toForm, validateForm, type ClienteForm, type FormErrors, type FormKey } from '../domain/form'
import type { Cliente } from '../domain/types'
import { fmtDay } from './ClientesList'

type Props = {
  target: AlvoGaveta
  onTarget: (target: AlvoGaveta) => void
  list: Cliente[]
  source: Source
  onSaved: (c: Cliente) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Ficha({ c }: { c: Cliente }) {
  return (
    <div className="cl-ficha">
      <section className="cl-ficha__block">
        <dl className="cl-ficha__grid">
          <div className="cl-ficha__item"><dt>Registro</dt><dd>{c.registro || '—'}</dd></div>
          <div className="cl-ficha__item"><dt>Cadastro</dt><dd className="cl-num">{fmtDay(c.criadoEm)}</dd></div>
          <div className="cl-ficha__item cl-ficha__wide"><dt>Endereço</dt><dd>{c.endereco || '—'}</dd></div>
        </dl>
      </section>
      <a className="cl-link" href={`#/pessoas?cliente=${encodeURIComponent(c.id)}`}><Users size={16} aria-hidden /> Ver pessoas deste cliente</a>
    </div>
  )
}

/** Ficha, edição e cadastro no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function ClienteDrawer({ target, onTarget, list, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const current = target && target.mode !== 'create' ? list.find((c) => c.id === target.id) ?? null : null
  const editing = target?.mode === 'edit' || target?.mode === 'create'
  const editKey = target?.mode === 'edit' ? `edit:${target.id}` : target?.mode === 'create' ? 'create' : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<ClienteForm>(emptyForm)
  const [form, setForm] = useState<ClienteForm>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState<{ next: AlvoGaveta } | null>(null)

  // Prepara o formulário só ao entrar em edição ou cadastro (não a cada atualização da lista).
  useEffect(() => {
    if (!editKey) { setReady(null); return }
    const start = target?.mode === 'edit' && current ? toForm(current) : emptyForm()
    setBase(start)
    setForm(start)
    setErrors({})
    setReady(editKey)
  }, [editKey])

  const dirty = editing && ready === editKey && isDirty(base, form)

  function go(next: AlvoGaveta) {
    if (saving) return
    if (dirty) { setPendingExit({ next }); return }
    onTarget(next)
  }

  async function save() {
    if (saving) return
    const found = validateForm(form)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) { document.querySelector<HTMLElement>(`.cl-form [name="${first}"]`)?.focus(); return }
    setSaving(true)
    try {
      if (target?.mode === 'create') {
        const id = await source.create(buildPayload(null, form))
        const saved = applyForm({ id, nome: '', registro: '', endereco: '', criadoEm: new Date() }, form)
        onSaved(saved)
        toast({ tone: 'success', message: `${saved.nome} cadastrado.` })
        setBase(form)
        onTarget({ mode: 'view', id })
      } else if (target?.mode === 'edit' && current) {
        const payload = buildPayload(base, form)
        if (Object.keys(payload).length) await source.update(current.id, payload)
        const saved = applyForm(current, form)
        onSaved(saved)
        toast({ tone: 'success', message: `Cadastro de ${saved.nome} salvo.` })
        setBase(form)
        onTarget({ mode: 'view', id: current.id })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const set = (key: FormKey, value: string) => setForm({ ...form, [key]: value })
  const title = target?.mode === 'create' ? 'Novo cliente' : current?.nome || 'Cliente'
  const footer = editing ? (
    <>
      <Button variant="secondary" disabled={saving} onClick={() => go(target?.mode === 'edit' ? { mode: 'view', id: target.id } : null)}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{target?.mode === 'create' ? 'Cadastrar cliente' : 'Salvar alterações'}</Button>
    </>
  ) : current ? <Button icon={<Pencil size={16} />} onClick={() => onTarget({ mode: 'edit', id: current.id })}>Editar cadastro</Button> : undefined

  return (
    <>
      <Drawer open={target != null} onClose={() => go(null)} eyebrow={target?.mode === 'create' ? 'Cadastros' : current?.registro || 'Cliente'} title={title} footer={footer}>
        {target == null ? null
          : editing ? (ready === editKey ? (
            <form id={formId} className="cl-form" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
              <Field label="Nome do cliente" required error={errors.nome}>
                <Input name="nome" value={form.nome} maxLength={MAX_LENGTH.nome} disabled={saving} autoFocus onChange={(e) => set('nome', e.target.value)} />
              </Field>
              <Field label="Registro" required error={errors.registro}>
                <Input name="registro" value={form.registro} maxLength={MAX_LENGTH.registro} disabled={saving} placeholder="Ex.: SJCampos" onChange={(e) => set('registro', e.target.value)} />
              </Field>
              <Field label="Endereço" error={errors.endereco}>
                <Textarea name="endereco" rows={3} value={form.endereco} maxLength={MAX_LENGTH.endereco} disabled={saving} onChange={(e) => set('endereco', e.target.value)} />
              </Field>
            </form>
          ) : null)
          : current ? <Ficha c={current} />
          : <Alert tone="warning" title="Cliente não encontrado">Ele pode ter sido inativado. Atualize a lista.</Alert>}
      </Drawer>
      <Dialog open={pendingExit != null} onClose={() => setPendingExit(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { const next = pendingExit?.next ?? null; setPendingExit(null); setForm(base); onTarget(next) }}>Descartar</Button>
        </>}>
        As alterações deste cadastro ainda não foram salvas.
      </Dialog>
    </>
  )
}
