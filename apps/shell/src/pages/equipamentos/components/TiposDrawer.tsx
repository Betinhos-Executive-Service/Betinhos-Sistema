import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Drawer, Field, Input, StatusBadge, useToast } from '@betinhos/ui'
import { Archive, ArchiveRestore, Check, Pencil, Plus, X } from 'lucide-react'
import type { Source } from '../data/source'
import { MAX_TIPO, validateTipo } from '../domain/cadastros'
import type { TipoEquipamento } from '../domain/types'

type Props = {
  open: boolean
  onClose: () => void
  tipos: TipoEquipamento[]
  /** Quantos itens usam cada tipo. */
  uso: Map<string, number>
  source: Source
  onSaved: (t: TipoEquipamento) => void
}

/** Operação em andamento: adicionar, renomear ou (in)ativar o tipo de id dado. */
type Busy = { acao: 'add' } | { acao: 'rename' | 'toggle'; id: string } | null
/** Para onde o foco volta depois de uma ação (o botão some ou muda de lugar na lista). */
type Foco = { alvo: 'novo' | 'edit' } | { alvo: 'renomear' | 'toggle'; id: string } | null

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const itens = (n: number) => (n === 1 ? '1 item' : `${n} itens`)
const ordem = (a: TipoEquipamento, b: TipoEquipamento) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR')

/** Adicionar, renomear e inativar tipos; inativo some dos seletores, mas os itens mantêm o tipo. */
export function TiposDrawer({ open, onClose, tipos, uso, source, onSaved }: Props) {
  const toast = useToast()
  const [novo, setNovo] = useState('')
  const [erroNovo, setErroNovo] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ id: string; nome: string } | null>(null)
  const [erroEdit, setErroEdit] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [pendingExit, setPendingExit] = useState(false)
  const [foco, setFoco] = useState<Foco>(null)
  const novoRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const original = edit ? tipos.find((t) => t.id === edit.id)?.nome ?? '' : ''
  const editSujo = edit != null && edit.nome.trim() !== original
  const dirty = novo.trim() !== '' || editSujo
  const lista = [...tipos].sort(ordem)

  // O foco segue a ação: campo com erro, campo de renomear aberto ou o botão da linha depois de salvar/inativar.
  useEffect(() => {
    if (!foco) return
    setFoco(null)
    if ('id' in foco) listRef.current?.querySelector<HTMLElement>(`[data-tipo="${foco.id}"] [data-acao="${foco.alvo}"]`)?.focus()
    else (foco.alvo === 'novo' ? novoRef : editRef).current?.focus()
  }, [foco])
  useEffect(() => { if (edit) editRef.current?.focus() }, [edit?.id])

  function reset() { setNovo(''); setErroNovo(null); setEdit(null); setErroEdit(null) }
  function close() {
    if (busy) return
    if (dirty) { setPendingExit(true); return }
    reset()
    onClose()
  }

  /** Grava e avisa; na falha o que foi digitado fica onde está e a mensagem do Dataverse aparece no toast. */
  async function run(estado: Busy, action: () => Promise<void>, falha: string, depois: (ok: boolean) => Foco) {
    setBusy(estado)
    let ok = false
    try {
      await action()
      ok = true
    } catch (reason) {
      toast({ tone: 'danger', message: `${falha} ${reasonText(reason)}` })
    } finally {
      setBusy(null)
      setFoco(depois(ok))
    }
  }

  function add() {
    if (busy) return
    const erro = validateTipo(novo, tipos, null)
    setErroNovo(erro)
    if (erro) { novoRef.current?.focus(); return }
    const nome = novo.trim()
    void run({ acao: 'add' }, async () => {
      const id = await source.createTipo(nome)
      onSaved({ id, nome, ativo: true })
      setNovo('')
      toast({ tone: 'success', message: `Tipo ${nome} adicionado.` })
    }, 'Não foi possível adicionar o tipo.', () => ({ alvo: 'novo' }))
  }

  function rename() {
    if (!edit || busy) return
    const atual = tipos.find((t) => t.id === edit.id)
    if (!atual) { setEdit(null); return }
    const erro = validateTipo(edit.nome, tipos, edit.id)
    setErroEdit(erro)
    if (erro) { editRef.current?.focus(); return }
    const nome = edit.nome.trim()
    void run({ acao: 'rename', id: atual.id }, async () => {
      if (nome !== atual.nome) await source.renameTipo(atual.id, nome)
      onSaved({ ...atual, nome })
      setEdit(null)
      toast({ tone: 'success', message: `Tipo ${nome} salvo.` })
    }, 'Não foi possível renomear o tipo.', (ok) => (ok ? { alvo: 'renomear', id: atual.id } : { alvo: 'edit' }))
  }

  function cancelEdit() {
    if (!edit) return
    const id = edit.id
    setEdit(null)
    setErroEdit(null)
    setFoco({ alvo: 'renomear', id })
  }

  function toggle(t: TipoEquipamento) {
    if (busy) return
    void run({ acao: 'toggle', id: t.id }, async () => {
      await source.setTipoAtivo(t.id, !t.ativo)
      onSaved({ ...t, ativo: !t.ativo })
      toast({ tone: 'success', message: `Tipo ${t.nome} ${t.ativo ? 'inativado' : 'reativado'}.` })
    }, `Não foi possível ${t.ativo ? 'inativar' : 'reativar'} o tipo.`, () => ({ alvo: 'toggle', id: t.id }))
  }

  return (
    <>
      <Drawer open={open} onClose={close} eyebrow="Equipamentos" title="Tipos de equipamento">
        <div className="eq-tipos">
          <form className="eq-tipos__form" noValidate onSubmit={(e) => { e.preventDefault(); add() }}>
            <Field label="Novo tipo" error={erroNovo ?? undefined}>
              {/* readOnly (não disabled) enquanto grava: o campo não perde o foco. */}
              <Input ref={novoRef} name="novoTipo" value={novo} maxLength={MAX_TIPO} autoComplete="off" readOnly={busy != null}
                onChange={(e) => { setNovo(e.target.value); setErroNovo(null) }} />
            </Field>
            <Button type="submit" icon={<Plus size={16} />} loading={busy?.acao === 'add'} disabled={busy != null}>Adicionar</Button>
          </form>
          <p className="eq-muted">Tipo inativo deixa de aparecer para novos itens; os itens que já usam continuam com ele.</p>
          <ul ref={listRef} className="eq-tipos__list" aria-label="Tipos cadastrados">
            {lista.map((t) => (
              <li key={t.id} className="eq-tipos__item" data-tipo={t.id}>
                {edit?.id === t.id ? (
                  <form className="eq-tipos__form eq-tipos__rename" noValidate onSubmit={(e) => { e.preventDefault(); rename() }}
                    onKeyDown={(e) => { if (e.key === 'Escape' && edit.nome.trim() === original) { e.preventDefault(); cancelEdit() } }}>
                    <Field label={`Novo nome do tipo ${t.nome}`} error={erroEdit ?? undefined}>
                      <Input ref={editRef} name="renomearTipo" value={edit.nome} maxLength={MAX_TIPO} autoComplete="off" readOnly={busy != null}
                        onChange={(e) => { setEdit({ id: t.id, nome: e.target.value }); setErroEdit(null) }} />
                    </Field>
                    <div className="eq-tipos__actions">
                      <Button type="submit" icon={<Check size={16} />} loading={busy?.acao === 'rename'} disabled={busy != null}>Salvar nome</Button>
                      <Button variant="ghost" icon={<X size={16} />} aria-label="Cancelar renomeação" title="Cancelar" disabled={busy != null} onClick={cancelEdit} />
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="eq-tipos__label">
                      <span className="eq-tipos__name">{t.nome}</span>
                      {t.ativo ? null : <StatusBadge tone="neutral">Inativo</StatusBadge>}
                    </span>
                    <span className="eq-muted eq-num">{itens(uso.get(t.id) ?? 0)}</span>
                    <span className="eq-tipos__actions">
                      {/* Com outra renomeação por salvar, trocar de linha perderia o texto sem aviso: salve ou cancele antes. */}
                      <Button variant="ghost" icon={<Pencil size={16} />} data-acao="renomear" aria-label={`Renomear tipo ${t.nome}`}
                        title={editSujo ? 'Salve ou cancele a renomeação em andamento' : 'Renomear'}
                        disabled={busy != null || editSujo} onClick={() => { setErroEdit(null); setEdit({ id: t.id, nome: t.nome }) }} />
                      <Button variant="ghost" icon={t.ativo ? <Archive size={16} /> : <ArchiveRestore size={16} />} data-acao="toggle"
                        aria-label={`${t.ativo ? 'Inativar' : 'Reativar'} tipo ${t.nome}`} title={t.ativo ? 'Inativar' : 'Reativar'}
                        loading={busy?.acao === 'toggle' && busy.id === t.id} disabled={busy != null} onClick={() => toggle(t)} />
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); reset(); onClose() }}>Descartar</Button>
        </>}>
        O nome digitado ainda não foi salvo.
      </Dialog>
    </>
  )
}
