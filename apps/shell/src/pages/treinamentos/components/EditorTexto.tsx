import { useRef, useState, type KeyboardEvent } from 'react'
import { Field, Textarea } from '@betinhos/ui'
import { Bold, Heading2, List } from 'lucide-react'
import { Conteudo } from './Conteudo'
import { aplicarFormato, type Formato } from '../domain/formatoTexto'

type Props = { value: string; max: number; disabled?: boolean; onChange: (valor: string) => void }

const BOTOES: { formato: Formato; rotulo: string; atalho?: string; Icone: typeof Bold }[] = [
  { formato: 'titulo', rotulo: 'Título', Icone: Heading2 },
  { formato: 'negrito', rotulo: 'Negrito', atalho: 'Ctrl+B', Icone: Bold },
  { formato: 'lista', rotulo: 'Lista', Icone: List },
]

/** Texto do treinamento com barra de formatação, atalho de negrito e prévia de como o motorista lê. */
export function EditorTexto({ value, max, disabled, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [previa, setPrevia] = useState(false)

  const formatar = (formato: Formato) => {
    const el = ref.current
    if (!el) return
    const r = aplicarFormato(value, el.selectionStart, el.selectionEnd, formato)
    onChange(r.texto)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.inicio, r.fim) })
  }
  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); formatar('negrito') }
  }

  return (
    <Field label="Texto" hint={`${value.length.toLocaleString('pt-BR')}/${max.toLocaleString('pt-BR')}`}>
      <div className="tr-editor">
        <div className="tr-editor__bar" role="toolbar" aria-label="Formatação do texto">
          {BOTOES.map(({ formato, rotulo, atalho, Icone }) => (
            <button key={formato} type="button" className="tr-editor__btn" disabled={disabled || previa} title={atalho ? `${rotulo} (${atalho})` : rotulo} onClick={() => formatar(formato)}>
              <Icone size={16} aria-hidden /><span>{rotulo}</span>
            </button>
          ))}
          <div className="tr-editor__tabs" role="group" aria-label="Modo">
            <button type="button" aria-pressed={!previa} className="tr-editor__tab" onClick={() => setPrevia(false)}>Escrever</button>
            <button type="button" aria-pressed={previa} className="tr-editor__tab" onClick={() => setPrevia(true)}>Prévia</button>
          </div>
        </div>
        {previa ? (
          <div className="tr-editor__previa">
            {value.trim() ? <Conteudo texto={value} className="tr-conteudo" /> : <p className="tr-hint">Nada escrito ainda.</p>}
          </div>
        ) : (
          <Textarea ref={ref} name="conteudo" value={value} maxLength={max} rows={12} disabled={disabled} placeholder="Escreva o conteúdo do treinamento. Selecione um trecho e use a barra para dar formato." onKeyDown={aoTeclar} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    </Field>
  )
}
