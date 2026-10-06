import { Switch } from '@betinhos/ui'
import { AlertCircle } from 'lucide-react'
import { formatCpf, formatPhone } from '../data/format'
import type { FieldDef } from '../data/schema'
import type { FieldValue } from '../data/types'

type Props = {
  field: FieldDef
  value: FieldValue | undefined
  error?: string
  changed: boolean
  onChange: (value: FieldValue) => void
}

/** Campo no padrão `Field` do Design System: rótulo acima, caixa `.bt-control`, erro com ícone. */
export function FieldInput({ field, value, error, changed, onChange }: Props) {
  const id = `f-${field.key}`
  const describedBy = error ? `${id}-err` : undefined
  const common = { id, className: 'bt-control__input', 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, disabled: field.readonly }

  let control
  switch (field.kind) {
    case 'choice':
      control = (
        <select {...common} value={value === null || value === undefined ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}>
          {!field.required && <option value="">—</option>}
          {field.options!.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )
      break
    case 'bool':
      control = (
        <Switch id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} disabled={field.readonly} label={value === true ? 'Sim' : 'Não'} checked={value === true} onChange={(event) => onChange(event.target.checked)} />
      )
      break
    case 'textarea':
      control = <textarea {...common} rows={2} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
      break
    case 'date':
      control = <input {...common} type="date" value={String(value ?? '')} onChange={(event) => onChange(event.target.value || null)} />
      break
    case 'cpf':
      control = <input {...common} inputMode="numeric" placeholder="000.000.000-00" value={String(value ?? '')} onChange={(event) => onChange(formatCpf(event.target.value))} />
      break
    case 'phone':
      control = <input {...common} type="tel" inputMode="tel" placeholder="+55 12 99999-9999" value={String(value ?? '')} onChange={(event) => onChange(formatPhone(event.target.value))} />
      break
    default:
      control = <input {...common} type={field.kind === 'email' ? 'email' : field.kind === 'url' ? 'url' : 'text'} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
  }

  const box = field.kind === 'bool' ? control : (
    <div className={`bt-control bt-control--${field.kind === 'textarea' ? 'textarea' : 'input'}${error ? ' bt-control--invalid' : ''}`}>{control}</div>
  )

  return (
    <div className={`bt-field field${field.kind === 'textarea' ? ' field--wide' : ''}${changed ? ' field--changed' : ''}${field.readonly ? ' bt-field--disabled' : ''}`}>
      <label className="bt-field__label" htmlFor={id}>
        {field.label}
        {field.required && <span className="bt-field__required" aria-hidden> *</span>}
        {changed && <span className="dot" title="Alterado" aria-label="alterado" />}
      </label>
      {box}
      {error && <span id={describedBy} className="bt-field__error"><AlertCircle size={14} aria-hidden />{error}</span>}
    </div>
  )
}
