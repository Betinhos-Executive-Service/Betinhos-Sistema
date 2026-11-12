import { useEffect, useId, useMemo, useState } from 'react'
import { Button, Dialog, Drawer, Field, Input, Select, StatusBadge, Table, useToast, type TableColumn } from '@betinhos/ui'
import { fmtData } from '../../equipamentos/components/EquipamentosList'
import { opcoesAtivas } from '../../equipamentos/domain/cadastros'
import { dateKey } from '../../operacional/domain/time'
import { openFromRow, openRowActions } from '../../pagantes/components/PagantesList'
import { cartaoParaForm, validarCartao, vigenteEm, type CartaoErros, type CartaoForm } from '../../despesas/conciliacao/domain/regras'
import { message, type Source } from '../../despesas/conciliacao/data/source'
import type { Cartao, Pessoa } from '../../despesas/conciliacao/domain/types'

const vigencia = (c: Cartao) => `${fmtData(c.inicio) || '—'} a ${c.fim ? fmtData(c.fim) : 'em uso'}`

function Vigencia({ c }: { c: Cartao }) {
  return <span className="cc-badges"><span className="cc-num">{vigencia(c)}</span>{vigenteEm(c, dateKey(new Date())) ? null : <StatusBadge tone="neutral">Fora da vigência</StatusBadge>}</span>
}

type ListaProps = { list: Cartao[]; onOpen: (id: string) => void; mobile: boolean }

export function CartoesLista({ list, onOpen, mobile }: ListaProps) {
  const abrir = (c: Cartao, className: string) => <button type="button" className={className} onClick={() => onOpen(c.id)}><strong>{c.nome || 'Sem nome'}</strong></button>
  if (mobile) {
    return (
      <ul className="cc-cards" aria-label="Cartões" onClick={(event) => openFromRow(event, '.cc-card', '.cc-card__open')}>
        {list.map((c) => (
          <li key={c.id} className="cc-card">
            {abrir(c, 'cc-card__open')}
            <div className="cc-card__foot"><span className="cc-muted">{[c.final ? `Final ${c.final}` : 'Conta toda', c.motoristaNome].join(' · ')}</span><Vigencia c={c} /></div>
          </li>
        ))}
      </ul>
    )
  }
  const columns: TableColumn<Cartao>[] = [
    { key: 'nome', header: 'Cartão', width: 'minmax(200px, 2fr)', cell: (c) => abrir(c, 'cc-open') },
    { key: 'final', header: 'Final', width: '110px', cell: (c) => (c.final ? <span className="cc-num">{c.final}</span> : <span className="cc-muted">Conta toda</span>) },
    { key: 'motorista', header: 'Motorista', width: 'minmax(150px, 1.2fr)', cell: (c) => c.motoristaNome || '—' },
    { key: 'conta', header: 'Conta no banco', width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (c) => <span className="cc-num cc-muted">{c.conta}</span> },
    { key: 'vigencia', header: 'Vigência', width: 'minmax(200px, 1.2fr)', cell: (c) => <Vigencia c={c} /> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.cc-open')}>
      <Table className="cc-table" columns={columns} rows={list} rowKey={(c) => c.id} rowActions={openRowActions(onOpen)} />
    </div>
  )
}

/** `create` pode vir com conta, final e início de uma transação sem motorista. */
export type CartaoTarget = { mode: 'edit'; id: string } | { mode: 'create'; inicial?: Partial<CartaoForm> } | null

type DrawerProps = {
  target: CartaoTarget
  onClose: () => void
  cartoes: Cartao[]
  motoristas: Pessoa[]
  source: Source
  onSaved: (c: Cartao) => void
}

/** Cadastro e edição do cartão; fechar com alteração pede confirmação; salvando não fecha. */
export function CartaoDrawer({ target, onClose, cartoes, motoristas, source, onSaved }: DrawerProps) {
  const toast = useToast()
  const formId = useId()
  const atual = target?.mode === 'edit' ? cartoes.find((c) => c.id === target.id) ?? null : null
  const chave = target == null ? null : target.mode === 'create' ? `novo:${JSON.stringify(target.inicial ?? {})}` : target.id
  const [base, setBase] = useState<CartaoForm>(cartaoParaForm(null))
  const [form, setForm] = useState<CartaoForm>(base)
  const [erros, setErros] = useState<CartaoErros>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  useEffect(() => {
    if (!chave) return
    const start = target?.mode === 'create' ? { ...cartaoParaForm(null), ...target.inicial } : cartaoParaForm(atual)
    setBase(start); setForm(start); setErros({})
  }, [chave])

  // Só motoristas ativos para escolher; o atual continua na lista mesmo inativo.
  const opcoes = useMemo(() => opcoesAtivas(motoristas, atual?.motoristaId), [motoristas, atual?.motoristaId])
  const dirty = JSON.stringify(base) !== JSON.stringify(form)
  const set = <K extends keyof CartaoForm>(k: K, v: CartaoForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setErros((e) => ({ ...e, [k]: undefined })) }

  function close() {
    if (saving) return
    if (dirty) { setPendingExit(true); return }
    onClose()
  }

  async function save() {
    if (saving) return
    // Id do alvo, não do cartão achado na lista: se ele sumir numa recarga, salvar não vira cadastro duplicado.
    const idAtual = target?.mode === 'edit' ? target.id : null
    const found = validarCartao(form, cartoes, idAtual)
    setErros(found)
    if (Object.values(found).some(Boolean)) return
    setSaving(true)
    try {
      const id = await source.salvarCartao(idAtual, form)
      const motorista = motoristas.find((m) => m.id === form.motoristaId)
      const salvo: Cartao = { id, nome: form.nome.trim(), conta: form.conta.trim(), final: form.final, motoristaId: form.motoristaId ?? '', motoristaNome: motorista?.nome ?? '', inicio: form.inicio, fim: form.fim || null }
      onSaved(salvo)
      toast({ tone: 'success', message: idAtual ? `Cartão ${salvo.nome} salvo.` : `Cartão ${salvo.nome} cadastrado. Reprocesse as transações sem motorista dele.` })
      onClose()
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${message(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const criando = target?.mode === 'create'
  const footer = (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{criando ? 'Cadastrar cartão' : 'Salvar alterações'}</Button>
    </>
  )
  return (
    <>
      <Drawer open={target != null} onClose={close} eyebrow="Cartões corporativos" title={criando ? 'Novo cartão' : atual?.nome || 'Cartão'} footer={footer}>
        <form id={formId} className="cc-form" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Field label="Nome" required error={erros.nome} hint="Ex.: Itaú final 1234 · Nome do motorista">
            <Input name="nome" value={form.nome} maxLength={200} disabled={saving} onChange={(e) => set('nome', e.target.value)} />
          </Field>
          <Field label="Motorista" required error={erros.motoristaId}>
            <Select options={opcoes} value={form.motoristaId} disabled={saving} placeholder="Escolha o motorista" searchable onChange={(v) => set('motoristaId', v)} />
          </Field>
          <div className="cc-form__grid">
            <Field label="Conta no Banco MCP" required error={erros.conta} hint="Id da conta do cartão; vem da transação.">
              <Input name="conta" value={form.conta} maxLength={100} disabled={saving} onChange={(e) => set('conta', e.target.value)} />
            </Field>
            <Field label="Final do cartão" error={erros.final} hint="Vazio = vale para a conta toda.">
              <Input name="final" value={form.final} inputMode="numeric" maxLength={4} disabled={saving} onChange={(e) => set('final', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Início da vigência" required error={erros.inicio}>
              <Input name="inicio" type="date" value={form.inicio} disabled={saving} onChange={(e) => set('inicio', e.target.value)} />
            </Field>
            <Field label="Fim da vigência" error={erros.fim} hint="Vazio = em uso.">
              <Input name="fim" type="date" value={form.fim} disabled={saving} onChange={(e) => set('fim', e.target.value)} />
            </Field>
          </div>
        </form>
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); onClose() }}>Descartar</Button>
        </>}>
        {criando ? 'O cadastro deste cartão ainda não foi salvo.' : 'As alterações deste cartão ainda não foram salvas.'}
      </Dialog>
    </>
  )
}
