import { Field, Input, Textarea } from '@betinhos/ui'
import { MAX_LENGTH, type ProjetoErrors, type ProjetoForm as FormValues } from '../domain/form'

type Props = { formId: string; form: FormValues; errors: ProjetoErrors; onChange: (form: FormValues) => void; onSubmit: () => void; disabled: boolean }

/** Cabeçalho do projeto, briefing do gestor e instruções de uso; controlado pelo drawer. */
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
          <Field label="Área" error={errors.area}>
            <Input name="area" value={form.area} maxLength={MAX_LENGTH.area} disabled={disabled} onChange={(e) => set('area', e.target.value)} />
          </Field>
          <Field label="Responsável" error={errors.responsavel}>
            <Input name="responsavel" value={form.responsavel} maxLength={MAX_LENGTH.responsavel} disabled={disabled} onChange={(e) => set('responsavel', e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="pj-form__section">
        <legend className="pj-form__legend">Briefing</legend>
        <Field label="O que precisa" error={errors.briefing} hint="O pedido em texto. Prints e áudios entram logo abaixo, em Anexos do briefing.">
          <Textarea name="briefing" rows={4} value={form.briefing} disabled={disabled} onChange={(e) => set('briefing', e.target.value)} />
        </Field>
      </fieldset>
      <fieldset className="pj-form__section">
        <legend className="pj-form__legend">Instruções de uso</legend>
        <Field label="Como usar" error={errors.instrucoes} hint="Passo a passo para quem vai usar o que o projeto entrega.">
          <Textarea name="instrucoes" rows={4} value={form.instrucoes} disabled={disabled} onChange={(e) => set('instrucoes', e.target.value)} />
        </Field>
      </fieldset>
    </form>
  )
}
