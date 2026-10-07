import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Field, Input, Select, Textarea, type InputProps, type SelectOption } from '@betinhos/ui'
import type { Source } from '../data/source'
import { duplicateMessage, type DuplicateHit } from '../domain/duplicates'
import { MAX_LENGTH, maskPhone, type FormErrors, type FormKey, type PessoaForm as FormValues } from '../domain/form'
import type { ChoiceSet, Cliente } from '../domain/types'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  choices: ChoiceSet
  source: Source
  duplicates: DuplicateHit[]
  onSeeDuplicate: (id: string) => void
  disabled: boolean
}

type TextOptions = Omit<InputProps, 'value' | 'onChange' | 'name'> & { name: FormKey; label: string; mask?: (v: string) => string; wide?: boolean; required?: boolean }
const toOptions = (list: { value: number; label: string }[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Cliente por busca no servidor (a base de clientes não é carregada inteira). */
function ClientePicker({ source, value, label, onChange, disabled }: { source: Source; value: string; label: string; onChange: (c: Cliente | null) => void; disabled: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const current = ++seq.current
    setLoading(true)
    const timer = setTimeout(() => {
      source.searchClientes(query)
        .then((list) => { if (current === seq.current) { setResults(list); setError(null) } })
        .catch((reason) => { if (current === seq.current) setError(reason instanceof Error ? reason.message : String(reason)) })
        .finally(() => { if (current === seq.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, source])
  const options: SelectOption[] = results.map((c) => ({ value: c.id, label: c.nome }))
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: label || 'Cliente atual' })
  return (
    <Field label="Cliente" error={error ? `Não foi possível buscar clientes. ${error}` : undefined}>
      <Select options={options} value={value || null} clearable searchable disabled={disabled} placeholder="Buscar cliente"
        searchPlaceholder="Digite o nome do cliente" onSearchChange={setQuery} loading={loading} emptyText="Nenhum cliente encontrado"
        onChange={(id) => { if (!id) { onChange(null); return } const hit = results.find((c) => c.id === id) ?? (id === value ? { id, nome: label } : null); onChange(hit) }} />
    </Field>
  )
}

/** Cadastro e edição da pessoa em seções; controlado pelo drawer. */
export function PessoaForm({ formId, form, errors, onChange, onSubmit, choices, source, duplicates, onSeeDuplicate, disabled }: Props) {
  const set = (key: FormKey, value: string) => onChange({ ...form, [key]: value })

  // Funções que devolvem JSX (não componentes), para não remontar o input e perder o foco.
  function text({ name, label, mask, wide, required, ...input }: TextOptions) {
    return (
      <Field key={name} label={label} required={required} error={errors[name]} className={wide ? 'ps-form__wide' : undefined}>
        <Input name={name} value={form[name]} maxLength={MAX_LENGTH[name]} disabled={disabled} onChange={(e) => set(name, mask ? mask(e.target.value) : e.target.value)} {...input} />
      </Field>
    )
  }
  function choice(name: FormKey, label: string, options: SelectOption[], required = false) {
    return (
      <Field key={name} label={label} required={required} error={errors[name]}>
        <Select options={options} searchable={false} clearable={!required} disabled={disabled} value={form[name] || null} onChange={(v) => set(name, v ?? '')} placeholder="Selecionar" />
      </Field>
    )
  }
  function area(name: FormKey, label: string) {
    return (
      <Field key={name} label={label} error={errors[name]} className="ps-form__wide">
        <Textarea name={name} rows={3} value={form[name]} maxLength={MAX_LENGTH[name]} disabled={disabled} onChange={(e) => set(name, e.target.value)} />
      </Field>
    )
  }

  return (
    <form id={formId} className="ps-form" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      {duplicates.map((d) => (
        <Alert key={d.id} tone="warning" action={<Button variant="ghost" size="compact" onClick={() => onSeeDuplicate(d.id)}>Ver</Button>}>{duplicateMessage(d)}</Alert>
      ))}
      <fieldset className="ps-form__section">
        <legend className="ps-form__legend">Identificação</legend>
        <div className="ps-form__grid">
          {text({ name: 'nome', label: 'Nome', required: true, wide: true, autoComplete: 'name' })}
          <div className="ps-form__wide">
            <ClientePicker source={source} value={form.clienteId} label={form.clienteNome} disabled={disabled}
              onChange={(c) => onChange({ ...form, clienteId: c?.id ?? '', clienteNome: c?.nome ?? '' })} />
          </div>
          {choice('cargo', 'Cargo', toOptions(choices.cargo))}
          {text({ name: 'departamento', label: 'Departamento' })}
          {text({ name: 'cr', label: 'Centro de resultado (CR)' })}
          {choice('classificacao', 'Classificação', toOptions(choices.classificacao))}
          {choice('status', 'Status', toOptions(choices.status), true)}
        </div>
      </fieldset>
      <fieldset className="ps-form__section">
        <legend className="ps-form__legend">Contato</legend>
        <div className="ps-form__grid">
          {text({ name: 'telefone', label: 'Celular', mask: maskPhone, type: 'tel', autoComplete: 'tel', placeholder: '(11) 99999-0000' })}
          {text({ name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' })}
          {choice('idioma', 'Idioma', toOptions(choices.idioma), true)}
        </div>
      </fieldset>
      <fieldset className="ps-form__section">
        <legend className="ps-form__legend">Perfil</legend>
        <div className="ps-form__grid">
          {choice('sexo', 'Sexo', toOptions(choices.sexo))}
          {text({ name: 'nascimento', label: 'Data de nascimento', type: 'date' })}
          {choice('tipoVeiculo', 'Veículo preferido', toOptions(choices.tipoVeiculo))}
          {area('preferencias', 'Preferências do passageiro')}
          {area('endereco', 'Endereço de saída')}
        </div>
      </fieldset>
    </form>
  )
}
