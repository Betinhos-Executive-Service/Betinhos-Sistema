import { useEffect, useId, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, Drawer, Skeleton, useToast } from '@betinhos/ui'
import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import type { Source } from '../data/source'
import { COMPETENCIA, GRAVIDADE, RESPONSABILIDADE, label, labels } from '../domain/choices'
import { applyForm, buildPayload, emptyForm, isDirty, toForm, validateForm, type FormErrors, type InfracaoForm as FormValues } from '../domain/form'
import { resumoUso } from '../domain/uso'
import type { Infracao, MultaUso } from '../domain/types'
import { InfracaoForm } from './InfracaoForm'
import { Badges, money } from './InfracoesList'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Infracao[]
  uso: Map<string, MultaUso[]>
  /** Uso carregado, ainda carregando ou a mensagem da falha. */
  usoState: 'ok' | 'loading' | string
  source: Source
  onSaved: (i: Infracao) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDateTime = (d: Date | null) => (d ? dateTime.format(d).replace(',', '') : '')
const MAX_MULTAS = 30

function Item({ name, children }: { name: string; children: ReactNode }) {
  return <div className="if-ficha__item"><dt>{name}</dt><dd>{children || '—'}</dd></div>
}

function Uso({ multas, state }: { multas: MultaUso[]; state: Props['usoState'] }) {
  const r = resumoUso(multas)
  return (
    <section className="if-ficha__block">
      <header className="if-ficha__head">
        <h3>Multas com esta infração</h3>
        {state === 'ok' ? <span className="if-muted if-num">{r.total} no total · {r.ultimos12} nos últimos 12 meses</span> : null}
      </header>
      {state === 'loading' ? <div className="if-ficha__loading" role="status" aria-label="Carregando multas"><Skeleton height={18} /><Skeleton height={18} /></div>
        : state !== 'ok' ? <Alert tone="danger" title="Não foi possível carregar as multas">{state}</Alert>
        : multas.length ? (
          <>
            <ul className="if-rows">
              {multas.slice(0, MAX_MULTAS).map((m) => (
                <li key={m.id} className="if-row">
                  <span className="if-num">{fmtDateTime(m.data) || 'Sem data'}</span>
                  <span>{m.placa || 'Sem placa'}<span className="if-muted"> · {m.motorista || 'Sem motorista'}</span></span>
                  <span className="if-muted">{m.status || '—'}</span>
                </li>
              ))}
            </ul>
            {multas.length > MAX_MULTAS ? <p className="if-muted">Mostrando as {MAX_MULTAS} mais recentes de {multas.length}. As multas ficam no Painel da Frota.</p> : null}
          </>
        ) : <p className="if-muted">Nenhuma multa registrada com esta infração.</p>}
    </section>
  )
}

function Ficha({ i, multas, usoState }: { i: Infracao; multas: MultaUso[]; usoState: Props['usoState'] }) {
  return (
    <div className="if-ficha">
      <div className="if-ficha__hero">
        <Badges i={i} />
        <p className="if-ficha__desc">{i.descricao || 'Sem descrição'}</p>
      </div>
      {i.ativo ? null : <Alert tone="info" title="Infração inativa">Não aparece para novas multas. As multas já registradas continuam com ela.</Alert>}
      <section className="if-ficha__block">
        <header className="if-ficha__head"><h3>Penalidade e aplicação</h3></header>
        <dl className="if-ficha__grid">
          <Item name="Enquadramento no CTB">{i.enquadramento}</Item>
          <Item name="Gravidade">{label(GRAVIDADE, i.gravidade)}</Item>
          <Item name="Pontos na CNH">{i.pontos == null ? '' : String(i.pontos)}</Item>
          <Item name="Valor da multa">{i.valor == null ? '' : money.format(i.valor)}</Item>
          <Item name="Competência">{labels(COMPETENCIA, i.competencia)}</Item>
          <Item name="Responsável">{label(RESPONSABILIDADE, i.responsabilidade)}</Item>
          <Item name="Última alteração">{fmtDateTime(i.modificadoEm)}</Item>
        </dl>
      </section>
      <Uso multas={multas} state={usoState} />
    </div>
  )
}

/** Ficha, edição e cadastro no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function InfracaoDrawer({ target, onTarget, list, uso, usoState, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const current = target && target.mode !== 'create' ? list.find((i) => i.id === target.id) ?? null : null
  const editing = target?.mode === 'edit' || target?.mode === 'create'
  const editKey = target?.mode === 'edit' ? `edit:${target.id}` : target?.mode === 'create' ? 'create' : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState<{ next: DrawerTarget } | null>(null)
  const [confirmInativar, setConfirmInativar] = useState(false)

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
  const multas = current ? uso.get(current.id) ?? [] : []

  function go(next: DrawerTarget) {
    if (saving) return
    if (dirty) { setPendingExit({ next }); return }
    onTarget(next)
  }

  async function save() {
    if (saving) return
    const selfId = target?.mode === 'edit' ? target.id : null
    const found = validateForm(form, list, selfId, target?.mode === 'edit' ? base : null)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) { document.querySelector<HTMLElement>(`.if-form [name="${first}"]:not([type="hidden"])`)?.focus(); return }
    setSaving(true)
    try {
      if (target?.mode === 'create') {
        const id = await source.create(buildPayload(null, form))
        const saved = applyForm({ ...emptyInfracao(), id }, form)
        onSaved(saved)
        toast({ tone: 'success', message: `Infração ${saved.codigo} cadastrada.` })
        setBase(form)
        onTarget({ mode: 'view', id })
      } else if (target?.mode === 'edit' && current) {
        const payload = buildPayload(base, form)
        if (Object.keys(payload).length) await source.update(current.id, payload)
        const saved = applyForm(current, form)
        onSaved(saved)
        toast({ tone: 'success', message: `Infração ${saved.codigo} salva.` })
        setBase(form)
        onTarget({ mode: 'view', id: current.id })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  async function setAtivo(ativo: boolean) {
    if (!current || saving) return
    setConfirmInativar(false)
    setSaving(true)
    try {
      await source.setAtivo(current.id, ativo)
      onSaved({ ...current, ativo, modificadoEm: new Date() })
      toast({ tone: 'success', message: `Infração ${current.codigo} ${ativo ? 'reativada' : 'inativada'}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível ${ativo ? 'reativar' : 'inativar'}. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const title = target?.mode === 'create' ? 'Nova infração' : current ? `Infração ${current.codigo}` : 'Infração'
  const footer = editing ? (
    <>
      <Button variant="secondary" disabled={saving} onClick={() => go(target?.mode === 'edit' ? { mode: 'view', id: target.id } : null)}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{target?.mode === 'create' ? 'Cadastrar infração' : 'Salvar alterações'}</Button>
    </>
  ) : current ? (
    <>
      {current.ativo
        ? <Button variant="secondary" icon={<Archive size={16} />} disabled={saving} onClick={() => setConfirmInativar(true)}>Inativar</Button>
        : <Button variant="secondary" icon={<ArchiveRestore size={16} />} loading={saving} onClick={() => void setAtivo(true)}>Reativar</Button>}
      <Button icon={<Pencil size={16} />} disabled={saving} onClick={() => onTarget({ mode: 'edit', id: current.id })}>Editar infração</Button>
    </>
  ) : undefined

  const n = multas.length
  return (
    <>
      <Drawer open={target != null} onClose={() => go(null)} size="wide" eyebrow={target?.mode === 'create' ? 'Cadastros' : 'Infração de trânsito'} title={title} footer={footer}>
        {target == null ? null
          : editing ? (ready === editKey ? <InfracaoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} disabled={saving} /> : null)
          : current ? <Ficha i={current} multas={multas} usoState={usoState} />
          : <Alert tone="warning" title="Infração não encontrada">Atualize a lista; ela pode ter sido alterada por outra pessoa.</Alert>}
      </Drawer>
      <Dialog open={pendingExit != null} onClose={() => setPendingExit(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { const next = pendingExit?.next ?? null; setPendingExit(null); setForm(base); onTarget(next) }}>Descartar</Button>
        </>}>
        As alterações desta infração ainda não foram salvas.
      </Dialog>
      <Dialog open={confirmInativar} onClose={() => setConfirmInativar(false)} title={`Inativar a infração ${current?.codigo ?? ''}?`}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmInativar(false)}>Voltar</Button>
          <Button variant="danger" icon={<Archive size={16} />} onClick={() => void setAtivo(false)}>Inativar infração</Button>
        </>}>
        Ela deixa de aparecer para novas multas. {n === 1 ? 'A multa já registrada continua com ela.' : n ? `As ${n} multas já registradas continuam com ela.` : 'Nenhuma multa usa esta infração.'} Dá para reativar depois.
      </Dialog>
    </>
  )
}

function emptyInfracao(): Infracao {
  return { id: '', codigo: '', descricao: '', enquadramento: '', gravidade: null, pontos: null, valor: null, competencia: [], responsabilidade: null, ativo: true, modificadoEm: null }
}
