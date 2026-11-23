import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, Field, Textarea, useToast } from '@betinhos/ui'
import { Paperclip, X } from 'lucide-react'
import { reasonText, type Source } from '../data/source'
import { autorLabel } from '../domain/choices'
import { MAX_ANEXOS, erroDoAnexo } from '../domain/anexos'
import type { Atualizacao } from '../domain/types'
import { GravadorAudio } from './GravadorAudio'

type Props = {
  projetoId: string
  /** null = briefing/comentário do projeto (sem marca de prova). */
  etapaId: string | null
  /** Autor gravado: o do perfil de quem usa a tela. */
  autor: number
  source: Source
  onSaved: (a: Atualizacao) => void
  onBusy: (busy: boolean) => void
  /** Avisa o drawer que há texto ou anexo não registrado (para pedir "Descartar alterações?"). */
  onDirty?: (dirty: boolean) => void
  /** Rótulo do botão que abre o formulário. */
  rotulo?: string
  /** Pedido de fora (ações do painel): cada `n` novo abre o formulário, com a prova marcada ou já gravando. */
  pedido?: { n: number; prova?: boolean; gravar?: boolean }
  /** Sem o botão próprio: o formulário só abre pelo `pedido`. */
  semBotao?: boolean
}

const agoraIso = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00` }

/** "Nova atualização": texto, marca de prova (só em etapa), anexos e áudio gravado (até 5 MB cada). */
export function NovaAtualizacao({ projetoId, etapaId, autor, source, onSaved, onBusy, onDirty, rotulo = 'Nova atualização', pedido, semBotao }: Props) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [prova, setProva] = useState(false)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [audio, setAudio] = useState<File | null>(null)
  const [gravador, setGravador] = useState(0)
  const [avisos, setAvisos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const [autoGravar, setAutoGravar] = useState(false)

  useEffect(() => {
    if (!pedido?.n) return
    setAberto(true)
    if (pedido.prova && etapaId) setProva(true)
    if (pedido.gravar) { setAutoGravar(true); setGravador((n) => n + 1) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.n])

  const todos = audio ? [...arquivos, audio] : arquivos
  const sujo = Boolean(texto.trim() || todos.length || prova)
  useEffect(() => { onDirty?.(sujo) }, [sujo, onDirty])
  useEffect(() => () => onDirty?.(false), [onDirty])

  const reset = () => {
    setTexto(''); setProva(false); setArquivos([]); setAudio(null); setGravador((n) => n + 1); setAutoGravar(false); setAvisos([]); setErro(null); setAberto(false)
  }

  function escolher(files: FileList | null) {
    const novos: File[] = []
    const problemas: string[] = []
    for (const f of Array.from(files ?? [])) {
      const e = erroDoAnexo(f)
      if (e) problemas.push(e)
      else if (todos.length + novos.length >= MAX_ANEXOS) { problemas.push(`Máximo de ${MAX_ANEXOS} arquivos por atualização.`); break }
      else novos.push(f)
    }
    setAvisos(problemas)
    if (novos.length) setArquivos((cur) => [...cur, ...novos])
    if (input.current) input.current.value = ''
  }

  function gravado(f: File | null) {
    const e = !f ? null : erroDoAnexo(f) ?? (arquivos.length >= MAX_ANEXOS ? `Máximo de ${MAX_ANEXOS} arquivos por atualização; remova um para guardar o áudio.` : null)
    setAvisos(e ? [e] : [])
    setAudio(e ? null : f)
  }

  async function salvar() {
    if (salvando) return
    if (!texto.trim() && !todos.length) { setErro('Escreva o texto da atualização, anexe um arquivo ou grave um áudio.'); return }
    if (prova && !todos.length) { setErro('Uma prova precisa de ao menos um anexo (print, foto ou vídeo).'); return }
    setErro(null); setSalvando(true); onBusy(true)
    try {
      const a = await source.addAtualizacao({ projetoId, etapaId, data: agoraIso(), autor, texto: texto.trim(), prova: etapaId ? prova : false }, todos)
      onSaved(a)
      toast({ tone: 'success', message: 'Atualização registrada.' })
      reset()
    } catch (reason) {
      setErro(`Não foi possível registrar. O que você digitou foi mantido. ${reasonText(reason)}`)
    } finally { setSalvando(false); onBusy(false) }
  }

  if (!aberto) return semBotao ? null : <Button variant="secondary" icon={<Paperclip size={16} />} onClick={() => setAberto(true)}>{rotulo}</Button>
  return (
    <div className="pj-nova" role="group" aria-label={rotulo}>
      <Field label="Texto" hint={etapaId ? 'O que mudou, o que foi provado ou o que falta.' : 'Complemento do briefing: explique o pedido, anexe prints ou grave um áudio.'}>
        <Textarea name="atualizacaoTexto" rows={3} value={texto} disabled={salvando} onChange={(e) => setTexto(e.target.value)} />
      </Field>
      <p className="pj-muted">Registrado como <strong>{autorLabel(autor)}</strong>.</p>
      {etapaId ? <Checkbox checked={prova} disabled={salvando} onChange={(e) => setProva(e.target.checked)} label="É prova (libera o Pronto do projeto)" /> : null}
      <div className="pj-nova__arquivos">
        <input ref={input} type="file" multiple hidden accept="image/*,video/*,audio/*,application/pdf" aria-label="Escolher anexos" onChange={(e) => escolher(e.target.files)} />
        <Button variant="secondary" icon={<Paperclip size={16} />} disabled={salvando} onClick={() => input.current?.click()}>Anexar arquivos</Button>
        <span className="pj-muted">Imagem, vídeo, áudio ou PDF, até 5 MB cada.</span>
      </div>
      <GravadorAudio key={gravador} onChange={gravado} disabled={salvando} autoIniciar={autoGravar} />
      {arquivos.length ? (
        <ul className="pj-nova__lista" aria-label="Arquivos escolhidos">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`}><span>{f.name}</span><button type="button" className="pj-nova__rm" aria-label={`Remover ${f.name}`} disabled={salvando} onClick={() => setArquivos((cur) => cur.filter((_, j) => j !== i))}><X size={14} /></button></li>
          ))}
        </ul>
      ) : null}
      {avisos.length ? <Alert tone="warning" title="Arquivo não aceito">{avisos.map((a) => <div key={a}>{a}</div>)}</Alert> : null}
      {erro ? <Alert tone="danger" title="Atualização não registrada">{erro}</Alert> : null}
      <div className="pj-nova__acoes">
        <Button variant="secondary" disabled={salvando} onClick={() => (sujo ? setDescartar(true) : reset())}>Cancelar</Button>
        <Button loading={salvando} onClick={() => void salvar()}>Registrar atualização</Button>
      </div>
      <Dialog open={descartar} onClose={() => setDescartar(false)} title="Descartar alterações?"
        actions={<><Button variant="secondary" onClick={() => setDescartar(false)}>Continuar editando</Button><Button variant="danger" onClick={() => { setDescartar(false); reset() }}>Descartar</Button></>}>
        A atualização ainda não foi registrada.
      </Dialog>
    </div>
  )
}
