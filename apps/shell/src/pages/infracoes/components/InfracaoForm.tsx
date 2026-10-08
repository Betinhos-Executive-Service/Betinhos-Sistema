import { Field, Input, Select, Textarea, type SelectOption } from '@betinhos/ui'
import { COMPETENCIA, GRAVIDADE, RESPONSABILIDADE } from '../domain/choices'
import { MAX_LENGTH, withGravidade, type FormErrors, type InfracaoForm as FormValues } from '../domain/form'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  disabled: boolean
}

const toOptions = (list: { value: number; label: string }[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Cadastro e edição da infração em seções; controlado pelo drawer. */
export function InfracaoForm({ formId, form, errors, onChange, onSubmit, disabled }: Props) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...form, [key]: value })
  return (
    <form id={formId} className="if-form" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <p className="if-muted">Campos com * são obrigatórios.</p>
      <fieldset className="if-form__section">
        <legend className="if-form__legend">Identificação</legend>
        <div className="if-form__grid">
          <Field label="Código" required error={errors.codigo} hint="Código do CTB, como 7455.">
            <Input name="codigo" value={form.codigo} maxLength={MAX_LENGTH.codigo} disabled={disabled} inputMode="numeric" onChange={(e) => set('codigo', e.target.value)} />
          </Field>
          <Field label="Enquadramento no CTB" error={errors.enquadramento} hint="Artigo, como 218, I.">
            <Input name="enquadramento" value={form.enquadramento} maxLength={MAX_LENGTH.enquadramento} disabled={disabled} onChange={(e) => set('enquadramento', e.target.value)} />
          </Field>
          <Field label="Descrição" required error={errors.descricao} className="if-form__wide">
            <Textarea name="descricao" rows={3} value={form.descricao} maxLength={MAX_LENGTH.descricao} disabled={disabled} onChange={(e) => set('descricao', e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="if-form__section">
        <legend className="if-form__legend">Penalidade</legend>
        <div className="if-form__grid if-form__grid--3">
          <Field label="Gravidade" error={errors.gravidade}>
            <Select options={toOptions(GRAVIDADE)} searchable={false} clearable disabled={disabled} value={form.gravidade || null}
              onChange={(v) => onChange(withGravidade(form, v ?? ''))} placeholder="Selecionar" />
          </Field>
          <Field label="Pontos na CNH" error={errors.pontos}>
            <Input name="pontos" type="number" min={0} max={21} step={1} inputMode="numeric" value={form.pontos} disabled={disabled} onChange={(e) => set('pontos', e.target.value)} />
          </Field>
          <Field label="Valor da multa (R$)" error={errors.valor}>
            <Input name="valor" inputMode="decimal" placeholder="293,47" value={form.valor} disabled={disabled} onChange={(e) => set('valor', e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="if-form__section">
        <legend className="if-form__legend">Aplicação</legend>
        <div className="if-form__grid">
          <Field label="Competência" required error={errors.competencia} hint="Quem pode autuar; pode ser mais de uma.">
            <Select name="competencia" options={toOptions(COMPETENCIA)} multiple searchable={false} clearable disabled={disabled} value={form.competencia}
              onChange={(v) => set('competencia', v)} placeholder="Selecionar" />
          </Field>
          <Field label="Responsável" required error={errors.responsabilidade}>
            <Select name="responsabilidade" options={toOptions(RESPONSABILIDADE)} searchable={false} clearable={false} disabled={disabled} value={form.responsabilidade || null}
              onChange={(v) => set('responsabilidade', v ?? '')} placeholder="Selecionar" />
          </Field>
        </div>
      </fieldset>
    </form>
  )
}
