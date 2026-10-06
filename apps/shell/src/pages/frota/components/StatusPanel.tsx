import { useRef, useState } from 'react'
import { Button, Field, Input, Textarea } from '@betinhos/ui'
import type { DataSource, FlowResult } from '../data/source'
import type { Kind } from '../data/types'
import { errorMessage } from '../data/xrm'
import { applyTransition, bloqueio, StaleError, transitionsFor, validate, type FieldSpec, type RegistroStatus, type Transition } from '../domain/transitions'
import { useNotify } from './Toasts'

const INPUT_TYPE: Record<FieldSpec['type'], string> = { text: 'text', textarea: 'text', date: 'date', datetime: 'datetime-local', money: 'number' }

type Props = {
  source: DataSource
  kind: Kind
  record: RegistroStatus
  initial?: Record<string, string>
  /** Só em sucesso: resultado do Flow, ou null em transição direta. */
  onDone: (result: FlowResult | null) => void
  /** Registro desatualizado ou Flow que falhou: a tela precisa mostrar o estado real. */
  onReload: () => void
}

export function StatusPanel({ source, kind, record, initial, onDone, onReload }: Props) {
  const notify = useNotify()
  const options = transitionsFor(kind, record.status)
  const [active, setActive] = useState<Transition | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  if (!options.length) return <p className="frota-muted">Sem ações de status para este registro.</p>

  function pick(transition: Transition) {
    const start: Record<string, string> = {}
    for (const field of transition.fields) {
      const value = initial?.[field.key]
      if (value) start[field.key] = value
    }
    setActive(transition)
    setValues(start)
    setErrors({})
  }

  async function confirm() {
    if (!active || busy.current) return
    const found = validate(active, values)
    setErrors(found)
    if (Object.keys(found).length) return
    busy.current = true
    setSaving(true)
    try {
      const result = await applyTransition(source, kind, record, active, values)
      notify('success', result?.message ?? `${active.label}: concluído.`)
      setActive(null)
      onDone(result)
    } catch (reason) {
      notify('error', errorMessage(reason))
      // Depois de falha em Flow o resultado pode ser incerto: volta à lista para exigir nova escolha deliberada.
      if (active.flow) setActive(null)
      if (reason instanceof StaleError || active.flow) onReload()
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (!active) {
    const motivos = options.map((transition) => ({ transition, motivo: bloqueio(transition, record) }))
    const avisos = [...new Set(motivos.flatMap((item) => (item.motivo ? [item.motivo] : [])))]
    return (
      <>
        <div className="frota-cluster">
          {motivos.map(({ transition, motivo }) => (
            <Button key={transition.id} variant="secondary" disabled={Boolean(motivo)} title={motivo ?? undefined} onClick={() => pick(transition)}>{transition.label}</Button>
          ))}
        </div>
        {avisos.map((aviso) => <p key={aviso} className="frota-muted">{aviso}</p>)}
      </>
    )
  }

  return (
    <form className="frota-stack" onSubmit={(event) => { event.preventDefault(); void confirm() }} noValidate>
      <strong>{active.label}</strong>
      {active.fields.length > 0 && (
        <div className="frota-fields">
          {active.fields.map((field) => {
            const common = { value: values[field.key] ?? '', maxLength: field.maxLength, onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [field.key]: event.target.value })) }
            return (
              <Field key={field.key} className={field.type === 'textarea' ? 'frota-fields__wide' : undefined} label={field.label} required={field.required} disabled={saving} error={errors[field.key]}>
                {field.type === 'textarea'
                  ? <Textarea rows={3} {...common} />
                  : <Input type={INPUT_TYPE[field.type]} step={field.type === 'money' ? '0.01' : undefined} min={field.type === 'money' ? '0' : undefined} {...common} />}
              </Field>
            )
          })}
        </div>
      )}
      {active.flow && <p className="frota-muted">Esta ação dispara o Flow "{active.label}" e pode levar até um minuto.</p>}
      <div className="frota-cluster">
        <Button type="submit" variant={active.danger ? 'danger' : 'primary'} loading={saving}>{saving && active.flow ? 'Aguardando o Flow…' : 'Confirmar'}</Button>
        <Button variant="secondary" disabled={saving} onClick={() => setActive(null)}>Voltar</Button>
      </div>
    </form>
  )
}
