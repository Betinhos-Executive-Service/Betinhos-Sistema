import { Button } from '@betinhos/ui'
import { AlertCircle, Download, FileText } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Funcionario } from '../data/types'
import { validateAditivo } from '../data/source'

type Props = {
  atual: Funcionario['aditivo']
  /** PDF escolhido e ainda não enviado (vai junto com "Salvar"). */
  pendente: File | null
  disabled?: boolean
  onPick: (file: File | null) => void
}

/** Upload do PDF do aditivo de assinatura eletrônica; o arquivo só sobe quando a ficha é salva. */
export function AditivoAssinatura({ atual, pendente, disabled, onPick }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function handle(file: File | undefined) {
    if (!file) return
    const problem = validateAditivo(file)
    setError(problem)
    if (!problem) onPick(file)
  }

  return (
    <div className="aditivo field--wide">
      <p className="hint">Sem o aditivo, o motorista não assina termos pelo app.</p>
      <div className="cluster">
        <Button variant="secondary" size="compact" icon={<FileText size={16} />} disabled={disabled} onClick={() => input.current?.click()}>
          {atual || pendente ? 'Substituir PDF' : 'Enviar PDF'}
        </Button>
        {atual && !pendente && (
          <a className="aditivo-link" href={atual.url} target="_blank" rel="noopener noreferrer"><Download size={16} aria-hidden /> Baixar {atual.nome}</a>
        )}
        {pendente && (
          <span className="aditivo-pendente">
            {pendente.name} · será enviado ao salvar{' '}
            <button type="button" className="aditivo-remover" onClick={() => { setError(null); onPick(null) }}>Remover</button>
          </span>
        )}
      </div>
      <span className="hint">PDF até 10 MB</span>
      {error && <span className="bt-field__error" role="alert"><AlertCircle size={14} aria-hidden />{error}</span>}
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden aria-label="Arquivo do aditivo (PDF)" onChange={(event) => { handle(event.target.files?.[0]); event.target.value = '' }} />
    </div>
  )
}
