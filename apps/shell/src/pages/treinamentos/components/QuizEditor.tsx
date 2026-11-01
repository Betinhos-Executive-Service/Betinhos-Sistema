import { Button, Field, Input } from '@betinhos/ui'
import { Plus, Trash2 } from 'lucide-react'
import { novaAlternativa, novaPergunta, type Pergunta } from '../domain/treinamentos'

type Props = { perguntas: Pergunta[]; onChange: (perguntas: Pergunta[]) => void; disabled: boolean }

/** Perguntas de múltipla escolha com uma alternativa correta cada; a validação fica em `validarQuiz`. */
export function QuizEditor({ perguntas, onChange, disabled }: Props) {
  const update = (id: string, patch: (p: Pergunta) => Pergunta) => onChange(perguntas.map((p) => (p.id === id ? patch(p) : p)))
  return (
    <div className="tr-quiz">
      {perguntas.map((p, i) => (
        <fieldset key={p.id} className="tr-quiz__pergunta">
          <legend className="tr-quiz__legend">Pergunta {i + 1}</legend>
          <Field label="Enunciado" required>
            <Input value={p.texto} maxLength={500} disabled={disabled} placeholder="Ex.: Qual a porta de encontro no Terminal 3?" onChange={(e) => update(p.id, (q) => ({ ...q, texto: e.target.value }))} />
          </Field>
          <span className="tr-label">Alternativas (marque a correta)</span>
          <ul className="tr-quiz__alternativas">
            {p.alternativas.map((a, j) => (
              <li key={a.id}>
                <input type="radio" name={`correta-${p.id}`} aria-label={`Alternativa ${j + 1} da pergunta ${i + 1} é a correta`} checked={p.corretaId === a.id} disabled={disabled || !a.texto.trim()}
                  onChange={() => update(p.id, (q) => ({ ...q, corretaId: a.id }))} />
                <Input value={a.texto} maxLength={300} disabled={disabled} aria-label={`Texto da alternativa ${j + 1} da pergunta ${i + 1}`} placeholder={`Alternativa ${j + 1}`}
                  onChange={(e) => update(p.id, (q) => ({ ...q, alternativas: q.alternativas.map((x) => (x.id === a.id ? { ...x, texto: e.target.value } : x)) }))} />
                <Button variant="ghost" size="compact" icon={<Trash2 size={14} />} aria-label={`Remover alternativa ${j + 1} da pergunta ${i + 1}`} disabled={disabled || p.alternativas.length <= 2}
                  onClick={() => update(p.id, (q) => ({ ...q, alternativas: q.alternativas.filter((x) => x.id !== a.id), corretaId: q.corretaId === a.id ? '' : q.corretaId }))} />
              </li>
            ))}
          </ul>
          <div className="tr-quiz__acoes">
            <Button variant="ghost" size="compact" icon={<Plus size={14} />} disabled={disabled || p.alternativas.length >= 6} onClick={() => update(p.id, (q) => ({ ...q, alternativas: [...q.alternativas, novaAlternativa()] }))}>Alternativa</Button>
            <Button variant="ghost" size="compact" icon={<Trash2 size={14} />} disabled={disabled} onClick={() => onChange(perguntas.filter((q) => q.id !== p.id))}>Remover pergunta</Button>
          </div>
        </fieldset>
      ))}
      <Button variant="secondary" size="compact" icon={<Plus size={14} />} disabled={disabled || perguntas.length >= 20} onClick={() => onChange([...perguntas, novaPergunta()])}>Adicionar pergunta</Button>
    </div>
  )
}
