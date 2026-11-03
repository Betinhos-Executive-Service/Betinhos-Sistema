import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Bold, Heading2, List, Redo2, Undo2 } from 'lucide-react'
import { htmlParaTexto, textoParaHtml } from '../domain/formatoTexto'

type Props = { value: string; max: number; disabled?: boolean; onChange: (valor: string) => void }
type Estado = { negrito: boolean; titulo: boolean; lista: boolean }

const exec = (cmd: string, arg?: string) => document.execCommand(cmd, false, arg)

/** Editor visual do texto do treinamento: formata enquanto escreve e grava no mesmo formato de sempre (# título, - item, **negrito**). */
export function EditorTexto({ value, max, disabled, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const ultimo = useRef(value)
  const valido = useRef('')
  const rotuloId = useId()
  const [ativo, setAtivo] = useState<Estado>({ negrito: false, titulo: false, lista: false })

  useEffect(() => {
    const el = ref.current
    if (!el || (value === ultimo.current && el.innerHTML)) return
    ultimo.current = value
    el.innerHTML = textoParaHtml(value)
    valido.current = el.innerHTML
  }, [value])
  useEffect(() => { try { exec('defaultParagraphSeparator', 'p') } catch { /* navegador sem suporte */ } }, [])

  const atualizarEstado = useCallback(() => {
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return
    const no = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement
    setAtivo({ negrito: document.queryCommandState('bold'), titulo: Boolean(no?.closest('h3')), lista: Boolean(no?.closest('li')) })
  }, [])
  useEffect(() => {
    document.addEventListener('selectionchange', atualizarEstado)
    return () => document.removeEventListener('selectionchange', atualizarEstado)
  }, [atualizarEstado])

  const sincronizar = () => {
    const el = ref.current
    if (!el) return
    const texto = htmlParaTexto(el)
    if (texto.length > max) { el.innerHTML = valido.current; return }
    valido.current = el.innerHTML
    ultimo.current = texto
    onChange(texto)
  }

  /** "# " e "- " no começo da linha viram título e lista, como nos editores modernos. */
  const atalhoMarkdown = () => {
    const sel = window.getSelection()
    const bloco = (sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest('p,div')
    if (!bloco || bloco === ref.current) return false
    const m = /^(#{1,3}|[-*])[\s ]$/.exec(bloco.textContent ?? '')
    if (!m) return false
    bloco.innerHTML = '<br>'
    if (m[1][0] === '#') exec('formatBlock', 'h3')
    else exec('insertUnorderedList')
    return true
  }

  const aoDigitar = () => { atalhoMarkdown(); sincronizar() }
  const aplicar = (acao: () => void) => { ref.current?.focus(); acao(); sincronizar(); atualizarEstado() }
  const alternarTitulo = () => aplicar(() => exec('formatBlock', ativo.titulo ? 'p' : 'h3'))
  const aoTeclar = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); alternarTitulo() }
    else if (mod && e.shiftKey && e.key === '8') { e.preventDefault(); aplicar(() => exec('insertUnorderedList')) }
  }
  const aoColar = (e: ClipboardEvent) => {
    e.preventDefault()
    exec('insertText', e.clipboardData.getData('text/plain'))
  }

  const botoes = [
    { rotulo: 'Desfazer', dica: 'Desfazer (Ctrl+Z)', Icone: Undo2, acao: () => exec('undo') },
    { rotulo: 'Refazer', dica: 'Refazer (Ctrl+Shift+Z)', Icone: Redo2, acao: () => exec('redo') },
    null,
    { rotulo: 'Formatar como título', dica: 'Título (Ctrl+Shift+H ou "# ")', Icone: Heading2, acao: alternarTitulo, on: ativo.titulo },
    { rotulo: 'Aplicar negrito', dica: 'Negrito (Ctrl+B)', Icone: Bold, acao: () => exec('bold'), on: ativo.negrito },
    { rotulo: 'Formatar como lista', dica: 'Lista (Ctrl+Shift+8 ou "- ")', Icone: List, acao: () => exec('insertUnorderedList'), on: ativo.lista },
  ] as const

  return (
    <div className="tr-editorwrap">
      <div className="tr-editorwrap__head">
        <span className="tr-label" id={rotuloId}>Texto</span>
        <span className="tr-hint">{value.length.toLocaleString('pt-BR')}/{max.toLocaleString('pt-BR')}</span>
      </div>
      <div className={`tr-editor${disabled ? ' is-disabled' : ''}`}>
        <div className="tr-editor__bar" role="toolbar" aria-label="Formatação do texto">
          {botoes.map((b, i) => b === null
            ? <span key={i} className="tr-editor__sep" aria-hidden />
            : (
              <button key={b.rotulo} type="button" className="tr-editor__btn" aria-label={b.rotulo} aria-pressed={'on' in b ? b.on : undefined} title={b.dica} disabled={disabled}
                onMouseDown={(e) => e.preventDefault()} onClick={() => aplicar(b.acao)}>
                <b.Icone size={16} aria-hidden />
              </button>
            ))}
        </div>
        <div ref={ref} className="tr-editor__area" role="textbox" aria-multiline="true" aria-labelledby={rotuloId} contentEditable={!disabled} suppressContentEditableWarning
          data-placeholder="Escreva o conteúdo. Digite # para título ou - para lista; selecione um trecho e use Ctrl+B para negrito."
          onInput={aoDigitar} onKeyDown={aoTeclar} onPaste={aoColar} />
      </div>
    </div>
  )
}
