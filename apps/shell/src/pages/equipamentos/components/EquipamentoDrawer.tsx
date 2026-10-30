import { useEffect, useId, useRef, useState } from 'react'
import { cleanId } from '@betinhos/dataverse'
import { Alert, Button, Dialog, Drawer, useToast } from '@betinhos/ui'
import type { Source } from '../data/source'
import { applyForm, diffForm, emptyEquipamento, emptyForm, hasChanges, isDirty, serieRepetida, toForm, validateForm, type EquipamentoForm as FormValues, type FormErrors } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { EquipamentoForm } from './EquipamentoForm'
import { FotosSecao } from './FotosSecao'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Equipamento[]
  tipos: TipoEquipamento[]
  pessoas: Pessoa[]
  source: Source
  onSaved: (e: Equipamento) => void
  /** Caminho da capa na lista quando as fotos mudam. */
  onCapa: (equipamentoId: string, caminho: string | null) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Cadastro e edição no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function EquipamentoDrawer({ target, onTarget, list, tipos, pessoas, source, onSaved, onCapa }: Props) {
  const toast = useToast()
  const formId = useId()
  const creating = target?.mode === 'create'
  // Link colado pode trazer o GUID em maiúsculas ou com chaves.
  const targetId = target && target.mode !== 'create' ? cleanId(target.id) : null
  const current = targetId ? list.find((e) => cleanId(e.id) === targetId) ?? null : null
  const key = target == null ? null : target.mode === 'create' ? 'create' : current ? `item:${current.id}` : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)
  const [enviandoFotos, setEnviandoFotos] = useState(false)
  const focusError = useRef(false)

  // Prepara o formulário só ao abrir outro item ou o cadastro (não a cada atualização da lista).
  useEffect(() => {
    if (!key) { setReady(null); return }
    const start = current ? toForm(current) : emptyForm()
    setBase(start)
    setForm(start)
    setErrors({})
    setReady(key)
  }, [key])

  const field = (selector: string) => document.getElementById(formId)?.querySelector<HTMLElement>(selector) ?? null

  // Cadastro novo começa pela Descrição (o Drawer põe o foco no X ao abrir).
  useEffect(() => {
    if (ready === 'create') field('[name="descricao"]')?.focus()
  }, [ready])

  // Depois de validar, leva o foco ao primeiro campo com erro (o Select só ganha aria-invalid na renderização seguinte).
  useEffect(() => {
    if (!focusError.current) return
    focusError.current = false
    field('[aria-invalid="true"]')?.focus()
  }, [errors])

  const open = key != null && ready === key
  const dirty = open && isDirty(base, form)
  const repetido = open ? serieRepetida(form, list, current?.id ?? null) : null

  function close() {
    if (saving) return
    // Fechar no meio do envio perderia as fotos que ainda estão na fila.
    if (enviandoFotos) { toast({ tone: 'info', message: 'Aguarde o envio das fotos terminar.' }); return }
    if (dirty) { setPendingExit(true); return }
    onTarget(null)
  }

  async function save() {
    if (saving) return
    if (enviandoFotos) { toast({ tone: 'info', message: 'Aguarde o envio das fotos terminar para salvar.' }); return }
    const found = validateForm(form)
    focusError.current = Object.keys(found).length > 0
    setErrors(found)
    if (focusError.current) return
    setSaving(true)
    try {
      if (creating) {
        const id = await source.create(diffForm(null, form))
        const saved = applyForm(emptyEquipamento(id), form, tipos, pessoas)
        onSaved(saved)
        toast({ tone: 'success', message: `Equipamento ${saved.descricao} cadastrado.` })
      } else if (current) {
        const changes = diffForm(base, form)
        if (hasChanges(changes)) await source.update(current.id, changes)
        const saved = applyForm(current, form, tipos, pessoas)
        onSaved(saved)
        toast({ tone: 'success', message: `Equipamento ${saved.descricao} salvo.` })
      }
      setBase(form)
      onTarget(null)
    } catch (reason) {
      // O drawer continua aberto com o que foi digitado; o toast de erro fica até ser fechado.
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const missing = target != null && !creating && !current
  const title = creating ? 'Novo equipamento' : current?.descricao || 'Equipamento'
  const footer = missing ? <Button variant="secondary" onClick={() => onTarget(null)}>Voltar à lista</Button> : (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{creating ? 'Cadastrar equipamento' : 'Salvar alterações'}</Button>
    </>
  )

  return (
    <>
      <Drawer actions={<BotaoAuditoria entity="cr40f_equipamento" ids={[current?.id]} name={title} />} open={target != null} onClose={close} size="wide" eyebrow="Equipamentos" title={title} footer={footer}>
        {missing
          ? <Alert tone="warning" title="Equipamento não encontrado">O link pode ser de um item de outro ambiente ou já removido. Atualize a lista e procure pela busca.</Alert>
          : open ? (
            <EquipamentoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} disabled={saving}
              tipos={tipos} pessoas={pessoas} tipoAtual={current?.tipoId ?? null} responsavelAtual={current?.responsavelId ?? null} repetido={repetido} />
          ) : null}
        {/* Fotos gravam na hora, à parte do Salvar; no cadastro novo ficam desabilitadas até o primeiro salvamento. */}
        {open && !missing ? <FotosSecao equipamentoId={creating ? null : current?.id ?? null} source={source} onCapa={onCapa} onEnviando={setEnviandoFotos} /> : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); setForm(base); onTarget(null) }}>Descartar</Button>
        </>}>
        {creating ? 'O cadastro deste equipamento ainda não foi salvo.' : 'As alterações deste equipamento ainda não foram salvas.'}
      </Dialog>
    </>
  )
}
