import { useEffect, useId, useState } from 'react'
import { cleanId } from '@betinhos/dataverse'
import { Alert, Button, Dialog, Drawer, Field, Input, Select, Textarea, useToast } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { formatDay } from '../../../app/format'
import { reasonText, type Source } from '../data/source'
import { STATUS, STATUS_OPTIONS } from '../domain/choices'
import { MAX_LENGTH, applyEtapa, diffEtapa, emptyEtapaForm, etapaSuja, hasChanges, toEtapaForm, validateEtapa, type EtapaErrors, type EtapaForm } from '../domain/form'
import { AVISO_SO_RENAN, daEtapa, provas, proximaEtapa } from '../domain/regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from '../domain/types'

type Props = {
  /** id da etapa, `nova` para cadastrar, null fechado. */
  alvo: string | null
  onClose: () => void
  onCriada: (id: string) => void
  projeto: Projeto
  etapas: Etapa[]
  atualizacoes: Atualizacao[]
  perfil: Perfil
  source: Source
  onSaved: (e: Etapa) => void
}

const STATUS_SELECT = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))
const quando = (iso: string) => `${formatDay(iso)} ${iso.slice(11, 16)}`

/** Cadastro e edição da etapa: nome, status (só o Renan), prazo, andamento, PR e descrição. Provas e atualizações ficam no painel. */
export function EtapaDrawer({ alvo, onClose, onCriada, projeto, etapas, atualizacoes, perfil, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const creating = alvo === 'nova'
  const current = alvo && !creating ? etapas.find((e) => cleanId(e.id) === cleanId(alvo)) ?? null : null
  const key = alvo == null ? null : creating ? 'nova' : current ? `item:${current.id}` : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<EtapaForm>(emptyEtapaForm)
  const [form, setForm] = useState<EtapaForm>(base)
  const [errors, setErrors] = useState<EtapaErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  useEffect(() => {
    if (!key) { setReady(null); return }
    const start = current ? toEtapaForm(current) : emptyEtapaForm()
    setBase(start); setForm(start); setErrors({}); setReady(key)
  }, [key])

  const open = key != null && ready === key
  const formSujo = open && etapaSuja(base, form)
  const itens = current ? daEtapa(atualizacoes, current.id) : []
  const nProvas = provas(itens).length
  const renan = perfil === 'renan'
  const proxima = proximaEtapa(projeto, etapas)
  const set = <K extends keyof EtapaForm>(k: K, v: EtapaForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  function close() {
    if (saving) return
    if (formSujo) { setPendingExit(true); return }
    onClose()
  }

  async function save() {
    if (saving) return
    const found = validateEtapa(form, { base: creating ? null : base, perfil, etapaId: current?.id ?? null, atualizacoes })
    setErrors(found)
    if (Object.keys(found).length) { document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return }
    setSaving(true)
    try {
      if (creating) {
        if (!proxima.codigo) throw new Error('O projeto ainda não tem código (PRJ-n). Atualize a lista e tente de novo.')
        const changes = { ...diffEtapa(null, form), cr40f_status: STATUS.ideia }
        const id = await source.createEtapa(changes, { projetoId: projeto.id, numero: proxima.numero, codigo: proxima.codigo })
        const nova: Etapa = { id, projetoId: projeto.id, numero: proxima.numero, codigo: proxima.codigo, nome: '', status: STATUS.ideia, descricao: '', prazo: null, andamento: 0, linkPr: '', publicadoProd: null }
        onSaved(applyEtapa(nova, { ...form, status: String(STATUS.ideia) }))
        setBase(form)
        toast({ tone: 'success', message: `Etapa ${proxima.codigo} cadastrada em Ideia.` })
        onCriada(id)
      } else if (current) {
        const changes = diffEtapa(base, form)
        if (hasChanges(changes)) await source.updateEtapa(current.id, changes)
        onSaved(applyEtapa(current, form))
        setBase(form)
        toast({ tone: 'success', message: `Etapa ${current.codigo} salva.` })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar a etapa. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally { setSaving(false) }
  }

  const missing = alvo != null && !creating && !current
  const title = creating ? `Nova etapa ${proxima.codigo}` : current ? `${current.codigo} · ${current.nome || 'Etapa'}` : 'Etapa'
  const footer = missing ? <Button variant="secondary" onClick={onClose}>Voltar ao projeto</Button> : (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>{creating || formSujo ? 'Cancelar' : 'Fechar'}</Button>
      <Button type="submit" form={formId} loading={saving}>{creating ? 'Cadastrar etapa' : 'Salvar etapa'}</Button>
    </>
  )

  return (
    <>
      <Drawer actions={<BotaoAuditoria entity="cr40f_projetoetapa" ids={[current?.id]} name={title} />} open={alvo != null} onClose={close} size="wide" eyebrow={`Projeto ${projeto.codigo}`} title={title} footer={footer}>
        {missing ? <Alert tone="warning" title="Etapa não encontrada">A etapa pode ter sido removida ou ser de outro projeto. Volte ao projeto e atualize a lista.</Alert> : null}
        {open ? (
          <form id={formId} className="pj-form" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
            <p className="pj-muted">Campos com * são obrigatórios.{creating ? ' A etapa nasce em Ideia.' : ''}</p>
            {errors.status ? <Alert tone="warning" title="Status não alterado">{errors.status}</Alert> : null}
            <div className="pj-form__grid">
              <Field label="Nome" required error={errors.nome} className="pj-form__wide">
                <Input value={form.nome} maxLength={MAX_LENGTH.nome} disabled={saving} onChange={(e) => set('nome', e.target.value)} />
              </Field>
              {creating ? null : (
                <Field label="Status" hint={renan ? `${nProvas} ${nProvas === 1 ? 'prova registrada' : 'provas registradas'} nesta etapa.` : AVISO_SO_RENAN}>
                  <Select options={STATUS_SELECT} value={form.status} searchable={false} disabled={saving || !renan} onChange={(v) => set('status', v ?? '')} />
                </Field>
              )}
              <Field label="Prazo" error={errors.prazo}>
                <Input type="date" value={form.prazo} disabled={saving} onChange={(e) => set('prazo', e.target.value)} />
              </Field>
              <Field label="Andamento (%)" error={errors.andamento}>
                <Input inputMode="numeric" value={form.andamento} disabled={saving} onChange={(e) => set('andamento', e.target.value)} />
              </Field>
              <Field label="Link do PR" error={errors.linkPr}>
                <Input type="url" value={form.linkPr} maxLength={MAX_LENGTH.linkPr} placeholder="https://github.com/…" disabled={saving} onChange={(e) => set('linkPr', e.target.value)} />
              </Field>
              <Field label="Descrição" error={errors.descricao} className="pj-form__wide">
                <Textarea rows={4} value={form.descricao} maxLength={MAX_LENGTH.descricao} disabled={saving} onChange={(e) => set('descricao', e.target.value)} />
              </Field>
              {current ? <p className="pj-muted pj-form__wide">Publicado no PROD: {current.publicadoProd ? quando(current.publicadoProd) : 'ainda não'}</p> : null}
            </div>
          </form>
        ) : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); setForm(base); onClose() }}>Descartar</Button>
        </>}>
        {creating ? 'O cadastro desta etapa ainda não foi salvo.' : 'Há alterações nesta etapa que ainda não foram salvas.'}
      </Dialog>
    </>
  )
}
