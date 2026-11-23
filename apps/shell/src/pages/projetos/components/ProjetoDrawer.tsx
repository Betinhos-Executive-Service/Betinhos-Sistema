import { useEffect, useId, useState } from 'react'
import { cleanId } from '@betinhos/dataverse'
import { Alert, Button, Dialog, Drawer, useToast } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import type { Source } from '../data/source'
import { applyProjeto, diffProjeto, emptyProjetoForm, hasChanges, projetoSujo, toProjetoForm, validateProjeto, type ProjetoErrors, type ProjetoForm as FormValues } from '../domain/form'
import type { Projeto } from '../domain/types'
import { ProjetoForm } from './ProjetoForm'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  /** `novo=1` cadastra; `editar=<id>` edita. `ver` é do painel lateral e não abre o drawer. */
  target: DrawerTarget
  onClose: () => void
  /** Depois de salvar: o id do projeto (o painel passa a mostrar ele). */
  onDone: (id: string) => void
  projetos: Projeto[]
  source: Source
  onSaved: (p: Projeto) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const vazioProjeto = (id: string, codigo: string): Projeto => ({ id, codigo, nome: '', area: '', responsavel: '', briefing: '', instrucoes: '' })

/** Cadastro e edição do projeto (nome, área, responsável, briefing, instruções). O detalhe fica no painel lateral. */
export function ProjetoDrawer({ target, onClose, onDone, projetos, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const creating = target?.mode === 'create'
  const targetId = target?.mode === 'edit' ? cleanId(target.id) : null
  const current = targetId ? projetos.find((p) => cleanId(p.id) === targetId) ?? null : null
  const aberto = target != null && target.mode !== 'view'
  const key = !aberto ? null : creating ? 'create' : current ? `item:${current.id}` : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyProjetoForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<ProjetoErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  useEffect(() => {
    if (!key) { setReady(null); return }
    const start = current ? toProjetoForm(current) : emptyProjetoForm()
    setBase(start); setForm(start); setErrors({}); setReady(key)
  }, [key])

  const open = key != null && ready === key
  const dirty = open && projetoSujo(base, form)

  function close() {
    if (saving) return
    if (dirty) { setPendingExit(true); return }
    onClose()
  }

  async function save() {
    if (saving) return
    const found = validateProjeto(form)
    setErrors(found)
    if (Object.keys(found).length) { document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return }
    setSaving(true)
    try {
      if (creating) {
        const { id, codigo } = await source.createProjeto(diffProjeto(null, form))
        const saved = applyProjeto(vazioProjeto(id, codigo), form)
        onSaved(saved)
        setBase(form)
        toast({ tone: 'success', message: `Projeto ${saved.codigo} cadastrado. Agora anexe prints ou grave um áudio no briefing.` })
        onDone(id)
      } else if (current) {
        const changes = diffProjeto(base, form)
        if (hasChanges(changes)) await source.updateProjeto(current.id, changes)
        onSaved(applyProjeto(current, form))
        setBase(form)
        toast({ tone: 'success', message: `Projeto ${current.codigo} salvo.` })
        onDone(current.id)
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally { setSaving(false) }
  }

  const missing = aberto && !creating && !current
  const title = creating ? 'Novo projeto' : current ? `${current.codigo} · ${current.nome || 'Projeto'}` : 'Projeto'
  const footer = missing ? <Button variant="secondary" onClick={onClose}>Voltar à lista</Button> : (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>{creating || projetoSujo(base, form) ? 'Cancelar' : 'Fechar'}</Button>
      <Button type="submit" form={formId} loading={saving}>{creating ? 'Cadastrar projeto' : 'Salvar alterações'}</Button>
    </>
  )

  return (
    <>
      <Drawer actions={<BotaoAuditoria entity="cr40f_projeto" ids={[current?.id]} name={title} />} open={aberto} onClose={close} size="wide" eyebrow="Projetos" title={title} footer={footer}>
        {missing
          ? <Alert tone="warning" title="Projeto não encontrado">O link pode ser de um projeto de outro ambiente ou já removido. Atualize a lista e procure pela busca.</Alert>
          : open ? <ProjetoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} disabled={saving} /> : null}
        {open && !missing && creating ? <p className="pj-muted">Prints, áudio e etapas ficam no painel do projeto depois de cadastrar.</p> : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); setForm(base); onClose() }}>Descartar</Button>
        </>}>
        {creating ? 'O cadastro deste projeto ainda não foi salvo.' : 'Há alterações neste projeto que ainda não foram salvas.'}
      </Dialog>
    </>
  )
}
