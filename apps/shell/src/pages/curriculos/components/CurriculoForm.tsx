import { Alert, Button, Field, Input, Select, Textarea, Upload, type InputProps, type SelectOption } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import type { ChoiceSet } from '../domain/types'
import { MAX_LENGTH, type CurriculoForm as FormValues, type FormErrors, type FormKey } from '../domain/form'
import { duplicateMessage, type Duplicate } from '../domain/duplicates'
import type { Stage } from '../domain/funnel'
import { maskCpf, maskNota, maskPhone, maskUf } from '../domain/text'
import { ACCEPT, MAX_FILE_SIZE } from '../data/upload'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  choices: ChoiceSet
  stages: Stage[]
  file: File | null
  onFile: (file: File | null) => void
  fileError: string | null
  uploadEnabled: boolean
  duplicates: Duplicate[]
  onSeeDuplicate: (id: string) => void
  disabled: boolean
}

type TextOptions = Omit<InputProps, 'value' | 'onChange' | 'name'> & { name: FormKey; label: string; mask?: (value: string) => string; wide?: boolean; required?: boolean }

const toOptions = (list: ChoiceOption[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Formulário do candidato em seções (cadastro e edição); controlado pelo drawer. */
export function CurriculoForm({ formId, form, errors, onChange, onSubmit, choices, stages, file, onFile, fileError, uploadEnabled, duplicates, onSeeDuplicate, disabled }: Props) {
  const set = (key: FormKey, value: string) => onChange({ ...form, [key]: value })

  // Funções que devolvem JSX (não componentes), para não remontar o input e perder o foco a cada tecla.
  function text({ name, label, mask, wide, required, ...input }: TextOptions) {
    return (
      <Field key={name} label={label} required={required} error={errors[name]} className={wide ? 'cv-form__wide' : undefined}>
        <Input name={name} value={form[name]} maxLength={MAX_LENGTH[name]} disabled={disabled} onChange={(event) => set(name, mask ? mask(event.target.value) : event.target.value)} {...input} />
      </Field>
    )
  }
  function choice(name: FormKey, label: string, options: SelectOption[], clearable = true) {
    return (
      <Field key={name} label={label}>
        <Select options={options} searchable={false} clearable={clearable} disabled={disabled} value={form[name] || null} onChange={(value) => set(name, value ?? '')} placeholder="Selecionar" />
      </Field>
    )
  }
  function area(name: FormKey, label: string) {
    return (
      <Field key={name} label={label} className="cv-form__wide">
        <Textarea name={name} rows={4} value={form[name]} disabled={disabled} onChange={(event) => set(name, event.target.value)} />
      </Field>
    )
  }

  return (
    <form id={formId} className="cv-form" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      {duplicates.map((d) => (
        <Alert key={d.kind} tone="warning" action={<Button variant="ghost" size="compact" onClick={() => onSeeDuplicate(d.id)}>Ver</Button>}>{duplicateMessage(d)}</Alert>
      ))}
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Dados pessoais</legend>
        <div className="cv-form__grid">
          {text({ name: 'nome', label: 'Nome completo', required: true, wide: true, autoComplete: 'name' })}
          {text({ name: 'cpf', label: 'CPF', mask: maskCpf, inputMode: 'numeric', autoComplete: 'off' })}
          {text({ name: 'telefone', label: 'Telefone', mask: maskPhone, type: 'tel', autoComplete: 'tel' })}
          {text({ name: 'whatsapp', label: 'WhatsApp', mask: maskPhone, type: 'tel' })}
          {text({ name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' })}
          {text({ name: 'cidade', label: 'Cidade', autoComplete: 'address-level2' })}
          {text({ name: 'estado', label: 'UF', mask: maskUf, autoComplete: 'address-level1' })}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Perfil profissional</legend>
        <div className="cv-form__grid">
          {text({ name: 'cargo', label: 'Cargo de interesse', required: true, wide: true })}
          {text({ name: 'ultimoCargo', label: 'Último cargo' })}
          {text({ name: 'ultimaEmpresa', label: 'Última empresa' })}
          {text({ name: 'pretensao', label: 'Pretensão salarial (R$)', inputMode: 'decimal', placeholder: '3500,00' })}
          {text({ name: 'nota', label: 'Nota (0 a 10)', mask: maskNota, inputMode: 'numeric' })}
          {choice('disponibilidade', 'Disponibilidade', toOptions(choices.disponibilidade))}
          {choice('cnh', 'Categoria da CNH', toOptions(choices.cnh))}
          {area('experiencia', 'Experiência')}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Origem e etapa</legend>
        <div className="cv-form__grid">
          {choice('origem', 'Origem do currículo', toOptions(choices.origem))}
          {text({ name: 'indicadoPor', label: 'Indicado por' })}
          {choice('status', 'Etapa', stages.map((s) => ({ value: String(s.value), label: s.label })), false)}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Currículo</legend>
        <div className="cv-form__grid">
          {text({ name: 'link', label: 'Link do currículo', type: 'url', wide: true, placeholder: 'https://' })}
          <div className="cv-form__wide">
            <Upload
              files={file ? [{ name: file.name, size: file.size, type: file.type }] : []}
              onChange={(files, added) => onFile(added[0] ?? (files.length ? file : null))}
              accept={ACCEPT}
              maxSize={MAX_FILE_SIZE}
              maxFiles={1}
              disabled={disabled || !uploadEnabled}
              label="Arraste o currículo ou escolha o arquivo"
              hint={uploadEnabled ? 'PDF, DOC, DOCX, PNG ou JPG até 10 MB. Ao salvar, o link é preenchido.' : 'Envio de arquivo indisponível neste ambiente'}
              aria-label="Escolher arquivo do currículo"
            />
            {fileError ? <p className="cv-form__error" role="alert">{fileError}</p> : null}
          </div>
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Observações internas</legend>
        <div className="cv-form__grid">{area('observacoes', 'Observações')}</div>
      </fieldset>
    </form>
  )
}
