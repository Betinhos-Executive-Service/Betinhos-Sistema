import { useEffect, useMemo, useState } from 'react'
import { Breadcrumb, Button, Checkbox, Dialog, Field, Input, PageHeader, SearchBox, SegmentedControl, StatusBadge, Surface, Textarea, useToast } from '@betinhos/ui'
import { AlertTriangle, ArrowLeft, Bell, Copy, PenLine, Save, Send, Trash2, Users } from 'lucide-react'
import type { Source } from '../data/source'
import {
  COMUNICADO_ESCOPO, COMUNICADO_TIPO, CORPO_MAX, TITULO_MAX, duplicateComunicado, plural, validateDraft,
  type Comunicado, type ComunicadoEscopo, type ComunicadoTipo, type Motorista,
} from '../domain/comunicados'

type Props = {
  initial: Comunicado
  motoristas: Motorista[]
  source: Source
  onBack: () => void
  /** Rascunho salvo ou disparado: a página recarrega e abre o id. */
  onSaved: (id: string) => Promise<void>
  onDuplicate: (draft: Comunicado) => void
  onDeleted?: () => Promise<void>
}

type Confirm = 'dispatch' | 'delete' | 'discard' | null

const sameDraft = (a: Comunicado, b: Comunicado) =>
  a.titulo === b.titulo && a.corpo === b.corpo && a.tipo === b.tipo && a.escopo === b.escopo && a.alvoIds.join() === b.alvoIds.join()

export function ComunicadoEditor({ initial, motoristas, source, onBack, onSaved, onDuplicate, onDeleted }: Props) {
  const toast = useToast()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState<'save' | 'dispatch' | 'delete' | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  const ciencia = draft.tipo === COMUNICADO_TIPO.ciencia
  const selecionados = draft.escopo === COMUNICADO_ESCOPO.selecionados
  const dirty = !draft.id || !sameDraft(draft, initial)
  const aptos = motoristas.filter((m) => !m.problema)
  const semAcesso = motoristas.length - aptos.length
  const alvos = selecionados ? motoristas.filter((m) => draft.alvoIds.includes(m.id)) : aptos
  const alvosInvalidos = alvos.filter((m) => m.problema)
  const todosMarcados = aptos.length > 0 && aptos.every((m) => draft.alvoIds.includes(m.id))
  const termo = busca.trim().toLowerCase()
  const filtrados = useMemo(() => motoristas.filter((m) => `${m.nome} ${m.email}`.toLowerCase().includes(termo)), [motoristas, termo])

  const set = (patch: Partial<Comunicado>) => { setDraft((d) => ({ ...d, ...patch })); setErro('') }
  const toggle = (id: string, on: boolean) => set({ alvoIds: on ? [...draft.alvoIds, id] : draft.alvoIds.filter((x) => x !== id) })

  const voltar = () => { if (busy) return; if (draft.titulo || draft.corpo ? dirty : false) setConfirm('discard'); else onBack() }

  // Esc fora de campos volta para a lista (com a mesma proteção de alterações).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirm || event.defaultPrevented) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      voltar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const salvar = async () => {
    const problema = validateDraft(draft)
    if (problema) { setErro(problema); return }
    setBusy('save')
    try {
      const id = await source.salvar(draft)
      toast({ tone: 'success', message: 'Rascunho salvo.' })
      await onSaved(id)
    } catch (error) {
      toast({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.' })
    } finally {
      setBusy(null)
    }
  }

  const pedirDisparo = () => {
    const problema = validateDraft(draft)
      || (alvosInvalidos.length ? `Corrija o cadastro de ${alvosInvalidos.map((m) => m.nome || m.email).join(', ')} antes de disparar.` : '')
      || (alvos.length ? '' : 'Nenhum motorista com acesso ao app para receber o comunicado.')
    if (problema) { setErro(problema); return }
    setConfirm('dispatch')
  }

  const disparar = async () => {
    setConfirm(null)
    setBusy('dispatch')
    let id = draft.id
    try {
      id = await source.salvar(draft)
      setDraft((d) => ({ ...d, id }))
      await source.disparar(id)
      toast({ tone: 'success', message: 'Comunicado disparado. Acompanhe a entrega do push.' })
      await onSaved(id)
    } catch (error) {
      toast({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível disparar o comunicado.' })
      // Salvou mas não disparou: o rascunho existe e continua aberto para tentar de novo.
      if (id && !draft.id) await onSaved(id).catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  const excluir = async () => {
    setConfirm(null)
    setBusy('delete')
    try {
      await source.excluir(draft.id)
      toast({ tone: 'success', message: 'Rascunho excluído.' })
      await onDeleted?.()
    } catch (error) {
      toast({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível excluir o rascunho.' })
      setBusy(null)
    }
  }

  const lock = busy !== null

  return (
    <>
      <PageHeader
        className="page__header"
        breadcrumb={<Breadcrumb items={[{ label: 'Comunicados', href: '#/comunicados' }, { label: draft.id ? 'Editar rascunho' : 'Novo' }]} />}
        title={draft.id ? 'Editar comunicado' : 'Novo comunicado'}
        meta={<StatusBadge tone="neutral">Rascunho</StatusBadge>}
        description="Escreva o aviso, escolha os motoristas e acompanhe cada confirmação de ciência."
        actions={<Button variant="secondary" icon={<ArrowLeft size={16} />} disabled={lock} onClick={voltar}>Voltar</Button>}
      />

      <div className="cm-columns">
        <Surface eyebrow="Conteúdo" title="Dados do comunicado" className="cm-form">
          <div className="cm-form__body">
            <Field label="Título" required hint={`${draft.titulo.length}/${TITULO_MAX}`}>
              <Input value={draft.titulo} maxLength={TITULO_MAX} disabled={lock} placeholder="Ex.: Atualização da operação" onChange={(e) => set({ titulo: e.target.value })} />
            </Field>
            <Field label="Mensagem" required hint={`${draft.corpo.length.toLocaleString('pt-BR')}/4.000`}>
              <Textarea value={draft.corpo} maxLength={CORPO_MAX} rows={7} disabled={lock} placeholder="Escreva a mensagem que o motorista verá no aplicativo." onChange={(e) => set({ corpo: e.target.value })} />
            </Field>
            <div className="cm-form__pair">
              <div className="cm-form__group">
                <span className="cm-label" id="cm-tipo">Confirmação</span>
                <SegmentedControl<string> aria-label="Confirmação" fullWidth value={String(draft.tipo)} onChange={(v) => set({ tipo: Number(v) as ComunicadoTipo })}
                  options={[{ value: String(COMUNICADO_TIPO.informativo), label: 'Informativo', disabled: lock }, { value: String(COMUNICADO_TIPO.ciencia), label: 'Com assinatura', disabled: lock }]} />
              </div>
              <div className="cm-form__group">
                <span className="cm-label" id="cm-escopo">Destinatários</span>
                <SegmentedControl<string> aria-label="Destinatários" fullWidth value={String(draft.escopo)} onChange={(v) => set({ escopo: Number(v) as ComunicadoEscopo })}
                  options={[{ value: String(COMUNICADO_ESCOPO.todos), label: 'Todos', disabled: lock }, { value: String(COMUNICADO_ESCOPO.selecionados), label: 'Selecionar', disabled: lock }]} />
              </div>
            </div>
            <p className="cm-hint">{ciencia ? 'O motorista assina para confirmar ciência. O aviso também aparece em Serviços até a assinatura.' : 'O motorista confirma ciência tocando em Seguinte na aba Comunicados, sem assinatura.'}</p>

            {selecionados ? (
              <div className="cm-targets">
                <SearchBox value={busca} onChange={setBusca} placeholder="Buscar por nome ou e-mail" aria-label="Buscar motorista" />
                <ul className="cm-targets__list">
                  {filtrados.map((m) => (
                    <li key={m.id} className={m.problema ? 'is-invalid' : undefined}>
                      <Checkbox checked={draft.alvoIds.includes(m.id)} disabled={lock || Boolean(m.problema)} onChange={(e) => toggle(m.id, e.target.checked)}
                        label={m.nome} description={m.problema || m.email} />
                      {m.problema ? <AlertTriangle size={16} className="cm-targets__alert" aria-label="Sem acesso ao app" /> : null}
                    </li>
                  ))}
                  {!filtrados.length ? <li className="cm-targets__empty">{motoristas.length ? 'Nenhum motorista encontrado para esta busca.' : 'Nenhum motorista ativo carregado.'}</li> : null}
                </ul>
                <div className="cm-targets__foot">
                  <span>{draft.alvoIds.length} de {aptos.length} {plural(aptos.length, 'apto selecionado', 'aptos selecionados')}</span>
                  <Button variant="ghost" size="compact" disabled={lock || !aptos.length} onClick={() => set({ alvoIds: todosMarcados ? [] : aptos.map((m) => m.id) })}>
                    {todosMarcados ? 'Limpar seleção' : 'Selecionar todos os aptos'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="cm-count">
              <span className="cm-count__icon" aria-hidden="true"><Users size={20} /></span>
              <div>
                <p><strong>{alvos.length}</strong> {plural(alvos.length, 'motorista apto a receber', 'motoristas aptos a receber')}</p>
                <small className={alvosInvalidos.length ? 'is-error' : undefined}>
                  {!selecionados ? `${semAcesso} sem acesso ao app, ${plural(semAcesso, 'excluído', 'excluídos')} do envio.` : alvosInvalidos.length ? `${alvosInvalidos.length} com cadastro pendente.` : 'Apenas os motoristas marcados recebem o comunicado.'}
                </small>
              </div>
            </div>
            {erro ? <p className="cm-error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{erro}</p> : null}
          </div>
          <div className="cm-form__actions">
            {draft.id ? <Button variant="danger" className="cm-form__start" icon={<Trash2 size={16} />} disabled={lock} loading={busy === 'delete'} onClick={() => setConfirm('delete')}>Excluir rascunho</Button> : null}
            {draft.id ? <Button variant="secondary" icon={<Copy size={16} />} disabled={lock} onClick={() => onDuplicate(duplicateComunicado(draft))}>Duplicar</Button> : null}
            <Button variant="secondary" icon={<Save size={16} />} disabled={lock} loading={busy === 'save'} onClick={() => void salvar()}>Salvar rascunho</Button>
            <Button icon={<Send size={16} />} disabled={lock} loading={busy === 'dispatch'} onClick={pedirDisparo}>Disparar comunicado</Button>
          </div>
        </Surface>

        <Surface eyebrow="Prévia" title="Como o motorista verá" className="cm-preview">
          <div className="cm-device" aria-hidden="true">
            <div className="cm-device__bar"><Bell size={16} /><strong>Comunicados</strong><span>1 novo</span></div>
            <div className="cm-device__content">
              <article className="cm-device__card">
                <StatusBadge tone="info">{ciencia ? 'Assinatura obrigatória' : 'Informativo'}</StatusBadge>
                <h3 className={draft.titulo.trim() ? undefined : 'is-empty'}>{draft.titulo || 'Título do comunicado'}</h3>
                <p className={draft.corpo.trim() ? undefined : 'is-empty'}>{draft.corpo || 'O texto do comunicado aparece aqui.'}</p>
              </article>
              {ciencia ? <div className="cm-device__sign"><PenLine size={16} />Assine aqui para confirmar</div> : null}
              <span className="cm-device__button">{ciencia ? 'Confirmar ciência' : 'Seguinte'}</span>
            </div>
          </div>
          <p className="cm-hint">{ciencia ? 'Motorista confirma com assinatura.' : 'Motorista confirma ao tocar em Seguinte.'}</p>
        </Surface>
      </div>

      <Dialog open={confirm === 'dispatch'} title={`Disparar para ${alvos.length} ${plural(alvos.length, 'motorista', 'motoristas')}?`} onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Voltar</Button><Button icon={<Send size={16} />} onClick={() => void disparar()}>Disparar agora</Button></>}>
        O texto não poderá ser alterado depois. Cada motorista recebe um push e o aviso aparece na aba Comunicados do app.
      </Dialog>
      <Dialog open={confirm === 'delete'} tone="danger" title="Excluir este rascunho?" onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Voltar</Button><Button variant="danger" icon={<Trash2 size={16} />} onClick={() => void excluir()}>Excluir rascunho</Button></>}>
        “{draft.titulo || 'Sem título'}” será removido. Esta ação não pode ser desfeita.
      </Dialog>
      <Dialog open={confirm === 'discard'} title="Descartar alterações?" onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { setConfirm(null); onBack() }}>Descartar</Button></>}>
        As mudanças deste comunicado ainda não foram salvas.
      </Dialog>
    </>
  )
}
