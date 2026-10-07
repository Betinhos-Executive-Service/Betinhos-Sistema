import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Alert, Avatar, Button, Dialog, Drawer, Skeleton, StatusBadge, useToast } from '@betinhos/ui'
import { Pencil } from 'lucide-react'
import type { Source } from '../data/source'
import { STATUS, label } from '../domain/choices'
import { duplicatesFor, type DuplicateHit } from '../domain/duplicates'
import { applyForm, buildPayload, emptyForm, isDirty, toForm, validateForm, type FormErrors, type PessoaForm as FormValues } from '../domain/form'
import { resumo } from '../domain/history'
import type { ChoiceSet, Historico, Pessoa } from '../domain/types'
import { ContatoActions } from './ContatoActions'
import { PessoaForm } from './PessoaForm'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Pessoa[]
  dups: Map<string, DuplicateHit[]>
  choices: ChoiceSet
  source: Source
  onSaved: (p: Pessoa) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDateTime = (d: Date | null) => (d ? dateTime.format(d).replace(',', '') : '—')
const fmtDay = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function Item({ name, children }: { name: string; children: ReactNode }) {
  return <div className="ps-ficha__item"><dt>{name}</dt><dd>{children || '—'}</dd></div>
}
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="ps-ficha__block"><header className="ps-ficha__head"><h3>{title}</h3>{aside}</header>{children}</section>
}

function useHistorico(source: Source, id: string | null) {
  const [data, setData] = useState<Historico | { error: string } | null>(null)
  useEffect(() => {
    if (!id) { setData(null); return }
    let cancelled = false
    setData(null)
    source.historico(id).then((h) => { if (!cancelled) setData(h) }, (r) => { if (!cancelled) setData({ error: reasonText(r) }) })
    return () => { cancelled = true }
  }, [source, id])
  return data
}

function Ficha({ p, choices, dups, source, onOpen }: { p: Pessoa; choices: ChoiceSet; dups: DuplicateHit[]; source: Source; onOpen: (id: string) => void }) {
  const hist = useHistorico(source, p.id)
  const r = hist && !('error' in hist) ? resumo(hist.servicos) : null
  return (
    <div className="ps-ficha">
      <div className="ps-ficha__hero">
        <Avatar name={p.nome || '?'} size="lg" />
        <div className="ps-ficha__ident">
          <span className="ps-badges">
            <StatusBadge tone={p.status === STATUS.inativo ? 'neutral' : 'success'}>{label(choices.status, p.status, 'Sem status')}</StatusBadge>
            {p.classificacao != null ? <StatusBadge tone="info">{label(choices.classificacao, p.classificacao)}</StatusBadge> : null}
          </span>
          <span className="ps-muted">{[label(choices.cargo, p.cargo), p.departamento, p.cliente].filter(Boolean).join(' · ') || 'Sem cliente'}</span>
        </div>
      </div>

      <ContatoActions p={p} size="default" labels />

      {dups.length ? (
        <Alert tone="warning" title="Possível cadastro duplicado">
          <ul className="ps-dups">
            {dups.map((d) => <li key={d.id}><button type="button" className="ps-link" onClick={() => onOpen(d.id)}>{d.nome || 'Sem nome'}</button> <span className="ps-muted">(mesmo {d.motivo})</span></li>)}
          </ul>
          Confira antes de criar reservas; a mesclagem continua no formulário nativo.
        </Alert>
      ) : null}

      <Section title="Contato e perfil">
        <dl className="ps-ficha__grid">
          <Item name="Celular">{p.telefone}</Item>
          <Item name="E-mail">{p.email}</Item>
          <Item name="Idioma">{label(choices.idioma, p.idioma)}</Item>
          <Item name="Cliente">{p.cliente}</Item>
          <Item name="Centro de resultado">{p.cr}</Item>
          <Item name="Veículo preferido">{label(choices.tipoVeiculo, p.tipoVeiculo)}</Item>
          <Item name="Nascimento">{fmtDay(p.nascimento)}</Item>
          <Item name="Cadastro">{fmtDay(p.cadastro)}</Item>
        </dl>
        {p.preferencias ? <p className="ps-ficha__text"><strong>Preferências:</strong> {p.preferencias}</p> : null}
        {p.endereco ? <p className="ps-ficha__text"><strong>Endereço de saída:</strong> {p.endereco}</p> : null}
      </Section>

      <Section title="Serviços" aside={r ? <span className="ps-muted ps-num">{r.total} no total · {r.ultimos90} nos últimos 90 dias</span> : null}>
        {hist == null ? <div className="ps-ficha__loading" role="status" aria-label="Carregando histórico"><Skeleton height={18} /><Skeleton height={18} /><Skeleton height={18} /></div>
          : 'error' in hist ? <Alert tone="danger" title="Não foi possível carregar o histórico">{hist.error}</Alert>
          : (
            <>
              <dl className="ps-ficha__grid">
                <Item name="Próximo">{r?.proximo ? fmtDateTime(r.proximo) : ''}</Item>
                <Item name="Último">{r?.ultimo ? fmtDateTime(r.ultimo) : ''}</Item>
                <Item name="Primeiro">{r?.primeiro ? fmtDateTime(r.primeiro) : ''}</Item>
              </dl>
              {hist.servicos.length ? (
                <ul className="ps-rows">
                  {hist.servicos.slice(0, 30).map((s) => (
                    <li key={s.id} className="ps-row">
                      <span className="ps-num">{fmtDateTime(s.data)}</span>
                      <span>{s.destino || 'Sem destino'}<span className="ps-muted"> · {[s.codigo, s.tipo].filter(Boolean).join(' · ')}</span></span>
                      <span className="ps-muted">{s.papeis.join(' e ')} · {s.status || '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="ps-muted">Nenhum serviço com esta pessoa.</p>}
              {hist.servicos.length > 30 ? <p className="ps-muted">Mostrando os 30 mais recentes de {hist.servicos.length}.</p> : null}
            </>
          )}
      </Section>

      {hist && !('error' in hist) && hist.pagantes.length ? (
        <Section title="Pagamentos" aside={<span className="ps-muted">{hist.pagantes.length} {hist.pagantes.length === 1 ? 'parcela' : 'parcelas'}</span>}>
          <ul className="ps-rows">
            {hist.pagantes.map((g) => (
              <li key={g.id} className="ps-row">
                <span>{g.codigo}{g.op ? <span className="ps-muted"> · {g.op}</span> : null}</span>
                <span className="ps-num">{g.valor == null ? '—' : money.format(g.valor)}</span>
                <span className="ps-muted">{g.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}

/** Ficha, edição e cadastro no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function PessoaDrawer({ target, onTarget, list, dups, choices, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const current = target && target.mode !== 'create' ? list.find((p) => p.id === target.id) ?? null : null
  const editing = target?.mode === 'edit' || target?.mode === 'create'
  const editKey = target?.mode === 'edit' ? `edit:${target.id}` : target?.mode === 'create' ? 'create' : null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState<{ next: DrawerTarget } | null>(null)

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
  const formDups = useMemo(() => (editing ? duplicatesFor({ id: target?.mode === 'edit' ? target.id : '', nome: form.nome, telefone: form.telefone, email: form.email, clienteId: form.clienteId }, list) : []),
    [editing, form.nome, form.telefone, form.email, form.clienteId, list, target])

  function go(next: DrawerTarget) {
    if (saving) return
    if (dirty) { setPendingExit({ next }); return }
    onTarget(next)
  }

  async function save() {
    if (saving) return
    const found = validateForm(form, new Date(), target?.mode === 'edit' ? base : null)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) { document.querySelector<HTMLElement>(`.ps-form [name="${first}"]`)?.focus(); return }
    setSaving(true)
    try {
      const bind = await source.clienteBind()
      if (target?.mode === 'create') {
        const cadastro = hojeSaoPaulo()
        const id = await source.create({ ...buildPayload(null, form, bind), cr40f_datadecadastro: cadastro })
        const blank = { ...emptyPessoa(), id, criadoEm: new Date(), cadastro }
        const saved = applyForm(blank, form)
        onSaved(saved)
        toast({ tone: 'success', message: `${saved.nome} cadastrado.` })
        setBase(form)
        onTarget({ mode: 'view', id })
      } else if (target?.mode === 'edit' && current) {
        const payload = buildPayload(base, form, bind)
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

  const title = target?.mode === 'create' ? 'Nova pessoa' : current?.nome || 'Pessoa'
  const footer = editing ? (
    <>
      <Button variant="secondary" disabled={saving} onClick={() => go(target?.mode === 'edit' ? { mode: 'view', id: target.id } : null)}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{target?.mode === 'create' ? 'Cadastrar pessoa' : 'Salvar alterações'}</Button>
    </>
  ) : current ? <Button icon={<Pencil size={16} />} onClick={() => onTarget({ mode: 'edit', id: current.id })}>Editar cadastro</Button> : undefined

  return (
    <>
      <Drawer open={target != null} onClose={() => go(null)} size="wide" eyebrow={target?.mode === 'create' ? 'Cadastros' : current?.cliente || 'Pessoa'} title={title} footer={footer}>
        {target == null ? null
          : editing ? (ready === editKey ? <PessoaForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} choices={choices} source={source}
              duplicates={formDups} onSeeDuplicate={(id) => go({ mode: 'view', id })} disabled={saving} /> : null)
          : current ? <Ficha p={current} choices={choices} dups={dups.get(current.id) ?? []} source={source} onOpen={(id) => onTarget({ mode: 'view', id })} />
          : <Alert tone="warning" title="Pessoa não encontrada">Ela pode ter sido inativada. Atualize a lista.</Alert>}
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

/** Data de hoje (aaaa-mm-dd) no fuso de São Paulo, para colunas só-data. */
export function hojeSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function emptyPessoa(): Pessoa {
  return {
    id: '', nome: '', clienteId: '', cliente: '', telefone: '', email: '', cargo: null, classificacao: null, idioma: null, status: null, sexo: null, tipoVeiculo: null,
    departamento: '', cr: '', endereco: '', preferencias: '', nascimento: '', cadastro: '', ultimoServico: '', foto: '', criadoEm: null,
  }
}
