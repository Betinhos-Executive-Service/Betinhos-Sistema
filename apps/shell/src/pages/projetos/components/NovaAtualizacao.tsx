import { useRef, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, Field, Select, Textarea, useToast, type SelectOption } from '@betinhos/ui'
import { Paperclip, X } from 'lucide-react'
import type { Source } from '../data/source'
import { AUTOR, AUTOR_OPTIONS } from '../domain/choices'
import { MAX_ANEXOS, erroDoAnexo } from '../domain/anexos'
import type { Atualizacao } from '../domain/types'

type Props = { projetoId: string; source: Source; onSaved: (a: Atualizacao) => void; onBusy: (busy: boolean) => void }

const AUTOR_SELECT: SelectOption[] = AUTOR_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))
const agoraIso = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00` }
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** "Nova atualização": texto, autor, marca de prova e anexos (imagem, vídeo ou PDF, até 5 MB cada). */
export function NovaAtualizacao({ projetoId, source, onSaved, onBusy }: Props) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [autor, setAutor] = useState(String(AUTOR.renan))
  const [prova, setProva] = useState(false)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [descartar, setDescartar] = useState(false)

  const sujo = Boolean(texto.trim() || arquivos.length || prova)
  const reset = () => { setTexto(''); setAutor(String(AUTOR.renan)); setProva(false); setArquivos([]); setAvisos([]); setErro(null); setAberto(false) }

  function escolher(files: FileList | null) {
    const novos: File[] = []
    const problemas: string[] = []
    for (const f of Array.from(files ?? [])) {
      const e = erroDoAnexo(f)
      if (e) problemas.push(e)
      else if (arquivos.length + novos.length >= MAX_ANEXOS) { problemas.push(`Máximo de ${MAX_ANEXOS} arquivos por atualização.`); break }
      else novos.push(f)
    }
    setAvisos(problemas)
    if (novos.length) setArquivos((cur) => [...cur, ...novos])
    if (input.current) input.current.value = ''
  }

  async function salvar() {
    if (salvando) return
    if (!texto.trim() && !arquivos.length) { setErro('Escreva o texto da atualização ou anexe um arquivo.'); return }
    if (prova && !arquivos.length) { setErro('Uma prova precisa de ao menos um anexo (print, foto ou vídeo).'); return }
    setErro(null); setSalvando(true); onBusy(true)
    try {
      const a = await source.addAtualizacao({ projetoId, data: agoraIso(), autor: Number(autor), texto: texto.trim(), prova }, arquivos)
      onSaved(a)
      toast({ tone: 'success', message: 'Atualização registrada.' })
      reset()
    } catch (reason) {
      setErro(`Não foi possível registrar. O que você digitou foi mantido. ${reasonText(reason)}`)
    } finally { setSalvando(false); onBusy(false) }
  }

  if (!aberto) return <Button variant="secondary" icon={<Paperclip size={16} />} onClick={() => setAberto(true)}>Nova atualização</Button>
  return (
    <div className="pj-nova" role="group" aria-label="Nova atualização">
      <Field label="Texto" hint="O que mudou, o que foi provado ou o que falta.">
        <Textarea name="atualizacaoTexto" rows={3} value={texto} disabled={salvando} onChange={(e) => setTexto(e.target.value)} />
      </Field>
      <Field label="Autor">
        <Select name="atualizacaoAutor" options={AUTOR_SELECT} searchable={false} clearable={false} disabled={salvando} value={autor} onChange={(v) => setAutor(v ?? String(AUTOR.renan))} />
      </Field>
      <Checkbox checked={prova} disabled={salvando} onChange={(e) => setProva(e.target.checked)} label="É prova (libera o Concluído)" />
      <div className="pj-nova__arquivos">
        <input ref={input} type="file" multiple hidden accept="image/*,video/*,application/pdf" aria-label="Escolher anexos" onChange={(e) => escolher(e.target.files)} />
        <Button variant="secondary" icon={<Paperclip size={16} />} disabled={salvando} onClick={() => input.current?.click()}>Anexar arquivos</Button>
        <span className="pj-muted">Imagem, vídeo ou PDF, até 5 MB cada.</span>
      </div>
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
