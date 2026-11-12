import { useMemo, useState } from 'react'
import { Button, Checkbox, Dialog, Field, Input, PageHeader, SearchBox, SegmentedControl, StatusBadge, Surface, Switch, useToast } from '@betinhos/ui'
import { AlertTriangle, Save, Send, Trash2, Users } from 'lucide-react'
import { useEscVoltar } from '../../../app/useEscVoltar'
import { FUNCAO } from '../../funcionarios/data/schema'
import type { Source } from '../data/source'
import {
  CONTEUDO_MAX, PUBLICO, TITULO_MAX, VIDEO_MAX, erroTexto, isPublicado, plural, publicoLabel, resolverPublico, validarComConteudo, validarPublicacao, validarRascunho,
  type Anexo, type Funcionario, type PublicoTipo, type Treinamento,
} from '../domain/treinamentos'
import { AnexosSecao } from './AnexosSecao'
import { Conteudo } from './Conteudo'
import { EditorTexto } from './EditorTexto'
import { NavTopo } from '../../../app/NavTopo'
import { QuizEditor } from './QuizEditor'

type Props = {
  initial: Treinamento
  funcionarios: Funcionario[]
  source: Source
  onBack: () => void
  /** Rascunho salvo ou publicado: a página recarrega e abre o id. */
  onSaved: (id: string) => Promise<void>
  /** Anexo enviado ou excluído (já gravado): a lista reflete sem remontar o editor. */
  onAnexos: (id: string, anexos: Anexo[]) => void
  onDeleted?: () => Promise<void>
}

type Confirm = 'publish' | 'delete' | 'discard' | null

const semAnexos = ({ anexos: _anexos, ...rest }: Treinamento) => rest
const sameDraft = (a: Treinamento, b: Treinamento) => JSON.stringify(semAnexos(a)) === JSON.stringify(semAnexos(b))

export function TreinamentoEditor({ initial, funcionarios, source, onBack, onSaved, onAnexos, onDeleted }: Props) {
  const toast = useToast()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState<'save' | 'publish' | 'delete' | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  const ativos = useMemo(() => funcionarios.filter((f) => f.ativo), [funcionarios])
  const alvos = resolverPublico(draft, funcionarios)
  const termo = busca.trim().toLowerCase()
  const filtrados = useMemo(() => ativos.filter((f) => `${f.nome} ${f.apelido}`.toLowerCase().includes(termo)), [ativos, termo])
  const selecionados = draft.publicoTipo === PUBLICO.selecionados
  const todosMarcados = ativos.length > 0 && ativos.every((f) => draft.publico.includes(f.id))

  const set = (patch: Partial<Treinamento>) => { setDraft((d) => ({ ...d, ...patch })); setErro('') }
  const togglePublico = (valor: string, on: boolean) => set({ publico: on ? [...draft.publico, valor] : draft.publico.filter((x) => x !== valor) })
  const trocarPublico = (tipo: PublicoTipo) => set({ publicoTipo: tipo, publico: [] })

  const voltar = () => {
    if (busy) return
    if ((draft.titulo || draft.conteudo) && !sameDraft(draft, initial)) setConfirm('discard')
    else onBack()
  }
  useEscVoltar(voltar, confirm !== null)

  const salvar = async () => {
    const problema = validarRascunho(draft)
    if (problema) { setErro(problema); return }
    setBusy('save')
    try {
      const id = await source.salvar(draft)
      toast({ tone: 'success', message: 'Rascunho salvo.' })
      await onSaved(id)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível salvar o rascunho.') })
    } finally {
      setBusy(null)
    }
  }

  const salvarPublicado = async () => {
    const problema = validarComConteudo(draft)
    if (problema) { setErro(problema); return }
    setBusy('save')
    try {
      await source.salvarPublicado(draft)
      toast({ tone: 'success', message: 'Alterações salvas. As participações continuam como estavam.' })
      await onSaved(draft.id)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível salvar as alterações.') })
    } finally {
      setBusy(null)
    }
  }

  const pedirPublicacao = () => {
    const problema = validarPublicacao(draft, funcionarios)
    if (problema) { setErro(problema); return }
    setConfirm('publish')
  }

  const publicar = async () => {
    setConfirm(null)
    setBusy('publish')
    let id: string
    try {
      id = await source.salvar(draft)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível salvar o rascunho.') })
      setBusy(null)
      return
    }
    try {
      await source.publicar({ ...draft, id }, alvos)
      toast({ tone: 'success', message: `Treinamento publicado para ${alvos.length} ${plural(alvos.length, 'funcionário', 'funcionários')}.` })
    } catch (error) {
      // Salvou mas não publicou: o rascunho existe e reabre para tentar de novo.
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível publicar o treinamento.') })
    } finally {
      setBusy(null)
    }
    await onSaved(id)
  }

  const excluir = async () => {
    setConfirm(null)
    setBusy('delete')
    try {
      await source.excluir(draft.id)
      toast({ tone: 'success', message: 'Rascunho excluído.' })
      await onDeleted?.()
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível excluir o rascunho.') })
      setBusy(null)
    }
  }

  const anexosAlterados = async (anexos: Anexo[], id: string) => {
    set({ id, anexos })
    try {
      await source.salvarAnexos(id, anexos, isPublicado(initial))
      onAnexos(id, anexos)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'O arquivo foi enviado, mas a lista de anexos não foi gravada. Salve o rascunho.') })
    }
  }

  // Anexar antes do primeiro salvamento: salva o rascunho (campos travados até terminar) e segue com o envio.
  const garantirId = async () => {
    const problema = validarRascunho(draft)
    if (problema) {
      setErro(problema)
      toast({ tone: 'warning', message: draft.titulo.trim() ? problema : 'Preencha o título antes de anexar.' })
      return null
    }
    setBusy('save')
    try {
      return await source.salvar(draft)
    } catch (error) {
      toast({ tone: 'danger', message: erroTexto(error, 'Não foi possível salvar o rascunho.') })
      setBusy(null)
      return null
    }
  }
  const aposCriar = async (id: string) => { setBusy(null); await onSaved(id) }

  const lock = busy !== null
  const publicado = isPublicado(initial)
  // Publicado: quiz, assinatura e público ficam como foram publicados.
  const travado = lock || publicado
  const resumoPublico = draft.publicoTipo === PUBLICO.motoristas ? 'Todos os motoristas ativos recebem o treinamento.'
    : !draft.publico.length ? (draft.publicoTipo === PUBLICO.funcao ? 'Marque pelo menos uma função.' : 'Marque pelo menos um funcionário.')
      : `${publicoLabel(draft, funcionarios)}: só funcionários ativos.`

  return (
    <>
      <PageHeader
        className="page__header"
        breadcrumb={<NavTopo modulo="Treinamentos" href="#/treinamentos" onBack={voltar} disabled={lock} atual={publicado ? 'Editar publicado' : draft.id ? 'Editar rascunho' : 'Novo'} />}
        title={publicado ? 'Editar treinamento publicado' : draft.id ? 'Editar treinamento' : 'Novo treinamento'}
        meta={<StatusBadge tone={publicado ? 'success' : 'neutral'}>{publicado ? 'Publicado' : 'Rascunho'}</StatusBadge>}
        description={publicado ? 'Corrija texto, vídeo, anexos ou validade. Quiz, assinatura e público ficam como foram publicados, e quem já concluiu continua concluído.' : 'Monte o conteúdo, escolha quem recebe e defina se exige assinatura e quiz. Publicado, quiz, assinatura e público não mudam mais.'}
      />

      <div className="tr-columns">
        <div className="tr-main">
          <Surface eyebrow="Conteúdo" title="O que o motorista vai ver">
            <div className="tr-form__body">
              <Field label="Título" required hint={`${draft.titulo.length}/${TITULO_MAX}`}>
                <Input name="titulo" value={draft.titulo} maxLength={TITULO_MAX} disabled={lock} placeholder="Ex.: Embarque no GRU: novo procedimento" onChange={(e) => set({ titulo: e.target.value })} />
              </Field>
              <EditorTexto value={draft.conteudo} max={CONTEUDO_MAX} disabled={lock} onChange={(conteudo) => set({ conteudo })} />
              <Field label="Vídeo (link)" hint="YouTube, Vimeo ou Stream; o motorista abre no app.">
                <Input name="videoUrl" type="url" inputMode="url" value={draft.videoUrl} maxLength={VIDEO_MAX} disabled={lock} placeholder="https://" onChange={(e) => set({ videoUrl: e.target.value })} />
              </Field>
              <div>
                <span className="tr-label">Fotos e arquivos</span>
                <AnexosSecao treinamentoId={draft.id || null} anexos={draft.anexos} source={source} disabled={lock} garantirId={garantirId} aposCriar={aposCriar} onChange={(anexos, id) => void anexosAlterados(anexos, id)} />
              </div>
            </div>
          </Surface>

          <Surface eyebrow="Confirmação" title="O que o motorista precisa fazer">
            <div className="tr-form__body">
              <Switch label="Exige assinatura" checked={draft.exigeAssinatura} disabled={travado} onChange={(e) => set({ exigeAssinatura: e.target.checked })} />
              <p className="tr-hint">{draft.exigeAssinatura ? 'O motorista assina no app, como no termo de multa, para registrar que leu.' : 'O motorista só confirma a leitura no app.'}</p>
              <Switch label="Exige quiz" checked={draft.exigeQuiz} disabled={travado} onChange={(e) => set({ exigeQuiz: e.target.checked })} />
              {draft.exigeQuiz ? (
                <>
                  <Field label="Nota mínima para aprovar (%)" required className="tr-nota">
                    <Input name="notaMinima" type="number" inputMode="numeric" min={0} max={100} value={String(draft.notaMinima)} disabled={travado} onChange={(e) => set({ notaMinima: Number(e.target.value) })} />
                  </Field>
                  <QuizEditor perguntas={draft.perguntas} disabled={travado} onChange={(perguntas) => set({ perguntas })} />
                </>
              ) : null}
            </div>
          </Surface>
        </div>

        <aside className="tr-side">
          <Surface eyebrow="Público-alvo" title="Quem recebe">
            <div className="tr-form__body">
              <SegmentedControl<string> aria-label="Público-alvo" fullWidth value={String(draft.publicoTipo)} onChange={(v) => trocarPublico(Number(v) as PublicoTipo)}
                options={[{ value: String(PUBLICO.motoristas), label: 'Motoristas', disabled: travado }, { value: String(PUBLICO.funcao), label: 'Por função', disabled: travado }, { value: String(PUBLICO.selecionados), label: 'Selecionar', disabled: travado }]} />
              {draft.publicoTipo === PUBLICO.funcao ? (
                <div className="tr-targets">
                  {FUNCAO.map((f) => <Checkbox key={f.value} label={f.label} checked={draft.publico.includes(String(f.value))} disabled={travado} onChange={(e) => togglePublico(String(f.value), e.target.checked)} />)}
                </div>
              ) : null}
              {selecionados ? (
                <div className="tr-targets">
                  <SearchBox value={busca} onChange={setBusca} disabled={travado} placeholder="Buscar funcionário" aria-label="Buscar funcionário" />
                  <ul className="tr-targets__list">
                    {filtrados.map((f) => <li key={f.id}><Checkbox label={f.nome} description={FUNCAO.find((o) => o.value === f.funcao)?.label ?? 'Sem função'} checked={draft.publico.includes(f.id)} disabled={travado} onChange={(e) => togglePublico(f.id, e.target.checked)} /></li>)}
                    {!filtrados.length ? <li className="tr-targets__empty">{ativos.length ? 'Nenhum funcionário encontrado para esta busca.' : 'Nenhum funcionário ativo carregado.'}</li> : null}
                  </ul>
                  <div className="tr-targets__foot">
                    <span>{draft.publico.length} de {ativos.length} {plural(ativos.length, 'selecionado', 'selecionados')}</span>
                    <Button variant="ghost" size="compact" disabled={travado || !ativos.length} onClick={() => set({ publico: todosMarcados ? [] : ativos.map((f) => f.id) })}>{todosMarcados ? 'Limpar seleção' : 'Selecionar todos'}</Button>
                  </div>
                </div>
              ) : null}
              <div className="tr-count">
                <span className="tr-count__icon" aria-hidden="true"><Users size={20} /></span>
                <div>
                  <p><strong>{alvos.length}</strong> {plural(alvos.length, 'funcionário recebe', 'funcionários recebem')}</p>
                  <small>{resumoPublico} Desligados nunca entram.</small>
                </div>
              </div>
              <Field label="Validade (prazo para concluir)" hint="Depois desta data, quem não concluiu vira pendência do Assistente de Pessoas.">
                <Input name="validade" type="date" value={draft.validade} disabled={lock} onChange={(e) => set({ validade: e.target.value })} />
              </Field>
            </div>
          </Surface>

          <Surface eyebrow="Prévia" title="Como o motorista lê" className="tr-preview">
            <article className="tr-device">
              <h3 className={draft.titulo.trim() ? undefined : 'is-empty'}>{draft.titulo || 'Título do treinamento'}</h3>
              {draft.videoUrl ? <div className="tr-device__video">▶ Vídeo</div> : null}
              {draft.conteudo.trim() ? <Conteudo texto={draft.conteudo} className="tr-conteudo" /> : <p className="is-empty">O texto aparece aqui.</p>}
              {draft.anexos.length ? <small>{draft.anexos.length} {plural(draft.anexos.length, 'anexo', 'anexos')}</small> : null}
              <span className="tr-device__button">{draft.exigeQuiz ? 'Responder quiz' : draft.exigeAssinatura ? 'Assinar e confirmar' : 'Confirmar leitura'}</span>
            </article>
          </Surface>
        </aside>
      </div>

      {erro ? <p className="tr-error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{erro}</p> : null}
      <div className="tr-form__actions">
        {publicado ? <Button icon={<Save size={16} />} disabled={lock} loading={busy === 'save'} onClick={() => void salvarPublicado()}>Salvar alterações</Button> : <>
          {draft.id ? <Button variant="danger" className="tr-form__start" icon={<Trash2 size={16} />} disabled={lock} loading={busy === 'delete'} onClick={() => setConfirm('delete')}>Excluir rascunho</Button> : null}
          <Button variant="secondary" icon={<Save size={16} />} disabled={lock} loading={busy === 'save'} onClick={() => void salvar()}>Salvar rascunho</Button>
          <Button icon={<Send size={16} />} disabled={lock} loading={busy === 'publish'} onClick={pedirPublicacao}>Publicar treinamento</Button>
        </>}
      </div>

      <Dialog open={confirm === 'publish'} title={`Publicar para ${alvos.length} ${plural(alvos.length, 'funcionário', 'funcionários')}?`} onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Voltar</Button><Button icon={<Send size={16} />} onClick={() => void publicar()}>Publicar agora</Button></>}>
        Depois de publicado, dá para corrigir texto, vídeo, anexos e validade; quiz, assinatura e público ficam travados. Cada funcionário passa a ver o treinamento no App Motoristas e o painel acompanha quem leu, assinou e respondeu o quiz.
      </Dialog>
      <Dialog open={confirm === 'delete'} tone="danger" title="Excluir este rascunho?" onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Voltar</Button><Button variant="danger" icon={<Trash2 size={16} />} onClick={() => void excluir()}>Excluir rascunho</Button></>}>
        “{draft.titulo || 'Sem título'}” será removido. Esta ação não pode ser desfeita.
      </Dialog>
      <Dialog open={confirm === 'discard'} title="Descartar alterações?" onClose={() => setConfirm(null)}
        actions={<><Button variant="secondary" onClick={() => setConfirm(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { setConfirm(null); onBack() }}>Descartar</Button></>}>
        As mudanças deste treinamento ainda não foram salvas.
      </Dialog>
    </>
  )
}
