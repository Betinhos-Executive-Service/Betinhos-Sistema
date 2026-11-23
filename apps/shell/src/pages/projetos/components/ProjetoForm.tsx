import { Alert, Field, Input, Select, Textarea, type SelectOption } from '@betinhos/ui'
import { STATUS_OPTIONS } from '../domain/choices'
import { MAX_LENGTH, type FormErrors, type ProjetoForm as FormValues } from '../domain/form'

type Props = { formId: string; form: FormValues; errors: FormErrors; onChange: (form: FormValues) => void; onSubmit: () => void; disabled: boolean }

const STATUS_SELECT: SelectOption[] = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

/** Cabeçalho do projeto (nome, status, andamento, prazo, PR) e Instruções de uso; controlado pelo drawer. */
export function ProjetoForm({ formId, form, errors, onChange, onSubmit, disabled }: Props) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...form, [key]: value })
  return (
    <form id={formId} className="pj-form" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <p className="pj-muted">Campos com * são obrigatórios.</p>
      <fieldset className="pj-form__section">
        <legend className="pj-form__legend">Projeto</legend>
        <div className="pj-form__grid">
          <Field label="Nome" required error={errors.nome} className="pj-form__wide">
            <Input name="nome" value={form.nome} maxLength={MAX_LENGTH.nome} disabled={disabled} onChange={(e) => set('nome', e.target.value)} />
          </Field>
          <Field label="Status" required error={errors.status}>
            <Select name="status" options={STATUS_SELECT} searchable={false} clearable={false} disabled={disabled} value={form.status || null} onChange={(v) => set('status', v ?? '')} placeholder="Selecionar" />
          </Field>
          <Field label="Andamento (%)" required error={errors.andamento}>
            <Input name="andamento" type="number" inputMode="numeric" min={0} max={100} value={form.andamento} disabled={disabled} onChange={(e) => set('andamento', e.target.value)} />
          </Field>
          <Field label="Prazo" error={errors.prazo}>
            <Input name="prazo" type="date" value={form.prazo} disabled={disabled} onChange={(e) => set('prazo', e.target.value)} />
          </Field>
          <Field label="Área" error={errors.area}>
            <Input name="area" value={form.area} maxLength={MAX_LENGTH.area} disabled={disabled} onChange={(e) => set('area', e.target.value)} />
          </Field>
          <Field label="Responsável" error={errors.responsavel}>
            <Input name="responsavel" value={form.responsavel} maxLength={MAX_LENGTH.responsavel} disabled={disabled} onChange={(e) => set('responsavel', e.target.value)} />
          </Field>
          <Field label="Link do PR" error={errors.linkPr} className="pj-form__wide">
            <Input name="linkPr" type="url" inputMode="url" value={form.linkPr} maxLength={MAX_LENGTH.linkPr} disabled={disabled} placeholder="https://github.com/..." onChange={(e) => set('linkPr', e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="pj-form__section">
        <legend className="pj-form__legend">Instruções de uso</legend>
        <Field label="Como usar" error={errors.instrucoes} hint="Passo a passo para quem vai usar o que o projeto entrega.">
          <Textarea name="instrucoes" rows={5} value={form.instrucoes} disabled={disabled} onChange={(e) => set('instrucoes', e.target.value)} />
        </Field>
      </fieldset>
      {errors.status ? <Alert tone="warning" title="Concluído bloqueado">{errors.status}</Alert> : null}
    </form>
  )
}
