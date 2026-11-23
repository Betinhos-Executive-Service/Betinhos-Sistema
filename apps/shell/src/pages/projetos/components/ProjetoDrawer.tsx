import { useEffect, useId, useState } from 'react'
import { cleanId } from '@betinhos/dataverse'
import { Alert, Button, Dialog, Drawer, useToast } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import type { Source } from '../data/source'
import { applyForm, diffForm, emptyForm, emptyProjeto, hasChanges, isDirty, toForm, validateForm, type FormErrors, type ProjetoForm as FormValues } from '../domain/form'
import { doProjeto } from '../domain/regras'
import type { Atualizacao, Projeto } from '../domain/types'
import { NovaAtualizacao } from './NovaAtualizacao'
import { ProjetoForm } from './ProjetoForm'
import { Timeline } from './Timeline'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Projeto[]
  atualizacoes: Atualizacao[]
  source: Source
  onSaved: (p: Projeto) => void
  onAtualizacao: (a: Atualizacao) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Cadastro, edição e acompanhamento no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function ProjetoDrawer({ target, onTarget, list, atualizacoes, source, onSaved, onAtualizacao }: Props) {
  const toast = useToast()
  const formId = useId()
  const creating = target?.mode === 'create'
  const targetId = target && target.mode !== 'create' ? cleanId(target.id) : null
  const current = targetId ? list.find((p) => cleanId(p.id) === targetId) ?? null : null
  const key = target == null ? null : target.mode === 'create' ? 'create' : current ? `item:${current.id}` : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  useEffect(() => {
    if (!key) { setReady(null); return }
    const start = current ? toForm(current) : emptyForm()
    setBase(start); setForm(start); setErrors({}); setReady(key)
  }, [key])

  const open = key != null && ready === key
  const dirty = open && isDirty(base, form)
  const doProj = current ? doProjeto(atualizacoes, current.id) : []

  function close() {
    if (saving) return
    if (busy) { toast({ tone: 'info', message: 'Aguarde o envio da atualização terminar.' }); return }
    if (dirty) { setPendingExit(true); return }
    onTarget(null)
  }

  async function save() {
    if (saving) return
    const found = validateForm(form, doProj)
    setErrors(found)
    if (Object.keys(found).length) { document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return }
    setSaving(true)
    try {
      if (creating) {
        const id = await source.create(diffForm(null, form))
        const saved = applyForm(emptyProjeto(id), form)
        onSaved(saved)
        toast({ tone: 'success', message: `Projeto ${saved.nome} cadastrado.` })
      } else if (current) {
        const changes = diffForm(base, form)
        if (hasChanges(changes)) await source.update(current.id, changes)
        const saved = applyForm(current, form)
        onSaved(saved)
        toast({ tone: 'success', message: `Projeto ${saved.nome} salvo.` })
      }
      setBase(form)
      onTarget(null)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally { setSaving(false) }
  }

  const missing = target != null && !creating && !current
  const title = creating ? 'Novo projeto' : current?.nome || 'Projeto'
  const footer = missing ? <Button variant="secondary" onClick={() => onTarget(null)}>Voltar à lista</Button> : (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{creating ? 'Cadastrar projeto' : 'Salvar alterações'}</Button>
    </>
  )

  return (
    <>
      <Drawer actions={<BotaoAuditoria entity="cr40f_projeto" ids={[current?.id]} name={title} />} open={target != null} onClose={close} size="wide" eyebrow="Projetos" title={title} footer={footer}>
        {missing
          ? <Alert tone="warning" title="Projeto não encontrado">O link pode ser de um projeto de outro ambiente ou já removido. Atualize a lista e procure pela busca.</Alert>
          : open ? <ProjetoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} disabled={saving} /> : null}
        {open && !missing ? (
          <section className="pj-sec" aria-labelledby={`${formId}-hist`}>
            <h3 id={`${formId}-hist`} className="pj-form__legend">Linha do tempo</h3>
            {creating ? <p className="pj-muted">As atualizações ficam disponíveis depois de cadastrar o projeto.</p> : current ? (
              <>
                <NovaAtualizacao projetoId={current.id} source={source} onSaved={onAtualizacao} onBusy={setBusy} />
                <Timeline itens={doProj} source={source} />
              </>
            ) : null}
          </section>
        ) : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); setForm(base); onTarget(null) }}>Descartar</Button>
        </>}>
        {creating ? 'O cadastro deste projeto ainda não foi salvo.' : 'As alterações deste projeto ainda não foram salvas.'}
      </Dialog>
    </>
  )
}
