import { Alert, Field, Input, Select, Textarea, type SelectOption } from '@betinhos/ui'
import { STATUS, STATUS_OPTIONS } from '../domain/choices'
import { opcoesAtivas } from '../domain/cadastros'
import { MAX_LENGTH, withResponsavel, withStatus, type EquipamentoForm as FormValues, type FormErrors } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  disabled: boolean
  tipos: TipoEquipamento[]
  pessoas: Pessoa[]
  /** Valores gravados no item: continuam no seletor mesmo inativos (marcados). */
  tipoAtual: string | null
  responsavelAtual: string | null
  /** Outro item com o mesmo número de série (aviso que não bloqueia). */
  repetido: Equipamento | null
}

const STATUS_SELECT: SelectOption[] = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

/** Cadastro e edição do equipamento em seções; controlado pelo drawer. */
export function EquipamentoForm({ formId, form, errors, onChange, onSubmit, disabled, tipos, pessoas, tipoAtual, responsavelAtual, repetido }: Props) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...form, [key]: value })
  const baixado = form.status === String(STATUS.baixado)
  return (
    <form id={formId} className="eq-form" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <p className="eq-muted">Campos com * são obrigatórios.</p>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Item</legend>
        <div className="eq-form__grid">
          <Field label="Descrição" required error={errors.descricao} className="eq-form__wide" hint="Como o item é conhecido, ex.: Notebook do Financeiro.">
            <Input name="descricao" value={form.descricao} maxLength={MAX_LENGTH.descricao} disabled={disabled} onChange={(e) => set('descricao', e.target.value)} />
          </Field>
          <Field label="Tipo" required error={errors.tipoId}>
            <Select name="tipoId" options={opcoesAtivas(tipos, tipoAtual)} clearable={false} disabled={disabled} value={form.tipoId || null}
              onChange={(v) => set('tipoId', v ?? '')} placeholder="Selecionar" searchPlaceholder="Buscar tipo" emptyText="Nenhum tipo ativo com esse nome." />
          </Field>
          <Field label="Marca/modelo" error={errors.marcaModelo}>
            <Input name="marcaModelo" value={form.marcaModelo} maxLength={MAX_LENGTH.marcaModelo} disabled={disabled} onChange={(e) => set('marcaModelo', e.target.value)} />
          </Field>
          <Field label="Nº de série" error={errors.numeroSerie} className="eq-form__wide">
            <Input name="numeroSerie" value={form.numeroSerie} maxLength={MAX_LENGTH.numeroSerie} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(e) => set('numeroSerie', e.target.value)} />
          </Field>
          {repetido ? (
            <Alert tone="warning" title="Número de série repetido" className="eq-form__wide">
              Já usado em {repetido.descricao}{repetido.status === STATUS.baixado ? ' (baixado)' : ''}. Confira antes de salvar; dá para salvar assim mesmo.
            </Alert>
          ) : null}
        </div>
      </fieldset>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Com quem está</legend>
        <div className="eq-form__grid">
          <Field label="Status" required error={errors.status}>
            <Select name="status" options={STATUS_SELECT} searchable={false} clearable={false} disabled={disabled} value={form.status || null}
              onChange={(v) => onChange(withStatus(form, v ?? ''))} placeholder="Selecionar" />
          </Field>
          <Field label="Responsável" error={errors.responsavelId} disabled={baixado}
            hint={baixado ? 'Item baixado não fica com responsável.' : 'Vazio = item no escritório ou no estoque.'}>
            <Select name="responsavelId" options={opcoesAtivas(pessoas, responsavelAtual)} clearable disabled={disabled || baixado} value={form.responsavelId || null}
              onChange={(v) => onChange(withResponsavel(form, v ?? ''))} placeholder="Sem responsável" searchPlaceholder="Buscar funcionário" emptyText="Nenhum funcionário ativo com esse nome." />
          </Field>
        </div>
      </fieldset>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Compra</legend>
        <div className="eq-form__grid">
          <Field label="Data de compra" error={errors.dataCompra}>
            <Input name="dataCompra" type="date" value={form.dataCompra} disabled={disabled} onChange={(e) => set('dataCompra', e.target.value)} />
          </Field>
          <Field label="Valor de compra (R$)" error={errors.valorCompra}>
            <Input name="valorCompra" inputMode="decimal" placeholder="3.499,90" value={form.valorCompra} disabled={disabled} onChange={(e) => set('valorCompra', e.target.value)} />
          </Field>
          <Field label="Observações" error={errors.observacoes} className="eq-form__wide" hint="Acessórios e estado do item. Não anote senhas aqui.">
            <Textarea name="observacoes" rows={3} value={form.observacoes} maxLength={MAX_LENGTH.observacoes} disabled={disabled} onChange={(e) => set('observacoes', e.target.value)} />
          </Field>
        </div>
      </fieldset>
    </form>
  )
}
