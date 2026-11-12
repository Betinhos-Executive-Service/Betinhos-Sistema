import { Button, Field, Textarea } from '@betinhos/ui'
import { MOTIVOS_RAPIDOS } from '../domain/regras'

type Props = { value: string; onChange: (v: string) => void; error: string | null; disabled?: boolean; label?: string }

/** Motivo para ignorar: texto livre com os motivos mais comuns a um clique (o texto continua editável). */
export function MotivoIgnorar({ value, onChange, error, disabled, label = 'Motivo para ignorar' }: Props) {
  return (
    <div className="cc-motivo">
      <div className="cc-motivos-rapidos" role="group" aria-label="Motivos prontos">
        {MOTIVOS_RAPIDOS.map((m) => (
          <Button key={m} size="compact" variant={value.trim() === m ? 'action' : 'secondary'} aria-pressed={value.trim() === m} disabled={disabled} onClick={() => onChange(m)}>{m}</Button>
        ))}
      </div>
      <Field label={label} error={error} hint="Escolha um motivo pronto ou escreva o seu.">
        <Textarea value={value} disabled={disabled} maxLength={400} rows={2} onChange={(e) => onChange(e.target.value)} />
      </Field>
    </div>
  )
}
