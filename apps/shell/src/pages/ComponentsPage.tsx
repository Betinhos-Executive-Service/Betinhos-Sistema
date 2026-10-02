import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'
import { Button, Cluster, Field, Grid, Input, Select, Stack, Textarea, type ButtonSize, type ButtonVariant, type ControlSize } from '@betinhos/ui'
import { PageLayout } from '../app/PageLayout'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'action', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['compact', 'default', 'touch']
const CONTROLS = ['Input', 'Select', 'Textarea'] as const
/** Componentes do Design System que ainda não são React; entram aqui conforme forem revisados. */
const PENDING = ['SearchBox', 'StatusBadge', 'Alert', 'EmptyState', 'SegmentedControl', 'Surface', 'PageHeader', 'MetricCard', 'DateTile', 'Table']

function Section({ name, summary, children }: { name: string; summary: string; children: ReactNode }) {
  return (
    <section className="surface showcase" aria-labelledby={`showcase-${name}`}>
      <header>
        <h2 id={`showcase-${name}`} className="showcase__title">{name}</h2>
        <p className="showcase__summary">{summary}</p>
      </header>
      {children}
    </section>
  )
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (value: T) => void }) {
  return (
    <label className="showcase__control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="showcase__toggle">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function ButtonShowcase() {
  const [variant, setVariant] = useState<ButtonVariant>('primary')
  const [size, setSize] = useState<ButtonSize>('default')
  const [label, setLabel] = useState('Registrar ocorrência')
  const [icon, setIcon] = useState(true)
  const [iconEnd, setIconEnd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [fullWidth, setFullWidth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(0)

  const save = () => {
    setSaving(true)
    setTimeout(() => { setSaving(false); setSaved((count) => count + 1) }, 1400)
  }

  return (
    <Section name="Button" summary="Botão de ação com cinco variantes, três alturas, ícones, carregamento e largura total.">
      <div className="showcase__stage">
        <Button
          variant={variant}
          size={size}
          loading={loading}
          disabled={disabled}
          fullWidth={fullWidth}
          icon={icon ? <Plus size={16} /> : undefined}
          iconEnd={iconEnd ? <ChevronRight size={14} /> : undefined}
          aria-label={label ? undefined : 'Adicionar'}
        >
          {label || undefined}
        </Button>
      </div>
      <Cluster gap="4">
        <Choice label="variant" value={variant} options={VARIANTS} onChange={setVariant} />
        <Choice label="size" value={size} options={SIZES} onChange={setSize} />
        <label className="showcase__control">
          <span>children</span>
          <input type="text" value={label} placeholder="vazio = só ícone" onChange={(event) => setLabel(event.target.value)} />
        </label>
        <Toggle label="icon" value={icon} onChange={setIcon} />
        <Toggle label="iconEnd" value={iconEnd} onChange={setIconEnd} />
        <Toggle label="loading" value={loading} onChange={setLoading} />
        <Toggle label="disabled" value={disabled} onChange={setDisabled} />
        <Toggle label="fullWidth" value={fullWidth} onChange={setFullWidth} />
      </Cluster>

      <p className="showcase__label">Variantes</p>
      <Cluster gap="3">
        <Button icon={<Plus size={16} />}>Registrar ocorrência</Button>
        <Button variant="secondary">Exportar lista</Button>
        <Button variant="action" size="compact" icon={<Plus size={14} />}>Adicionar nota</Button>
        <Button variant="ghost" iconEnd={<ChevronRight size={14} />}>Ver ocorrência</Button>
        <Button variant="danger">Excluir opção</Button>
        <Button variant="secondary" icon={<X size={16} />} aria-label="Fechar painel" />
      </Cluster>

      <p className="showcase__label">Em uso: clique para salvar</p>
      <Cluster gap="3">
        <Button loading={saving} onClick={save}>{saving ? 'Salvando' : 'Salvar alterações'}</Button>
        <span className="showcase__summary" role="status">{saved ? `Alterações salvas ${saved} ${saved > 1 ? 'vezes' : 'vez'}.` : ''}</span>
      </Cluster>
    </Section>
  )
}

function FieldShowcase() {
  const [control, setControl] = useState<(typeof CONTROLS)[number]>('Input')
  const [size, setSize] = useState<ControlSize>('default')
  const [label, setLabel] = useState('Cliente')
  const [hint, setHint] = useState(true)
  const [error, setError] = useState(false)
  const [required, setRequired] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [affix, setAffix] = useState(false)

  const [form, setForm] = useState({ titulo: '', gravidade: '', valor: '', descricao: '' })
  const [submitted, setSubmitted] = useState(false)
  const [saved, setSaved] = useState(false)
  const missing = { titulo: !form.titulo.trim(), gravidade: !form.gravidade }
  const update = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
    setSaved(false)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setSaved(!missing.titulo && !missing.gravidade)
  }

  return (
    <Section name="Field" summary="Rótulo, controle, ajuda e erro ligados por id. Controles: Input, Select e Textarea.">
      <div className="showcase__stage showcase__stage--form">
        <Field
          label={label || 'Rótulo'}
          hint={hint ? 'Como aparece no contrato.' : undefined}
          error={error ? 'Informe o cliente para salvar a ocorrência.' : undefined}
          required={required}
          disabled={disabled}
        >
          {control === 'Input' ? <Input size={size} placeholder="Ex.: Embraer" prefix={affix ? 'R$' : undefined} suffix={affix ? 'km' : undefined} /> : null}
          {control === 'Select' ? (
            <Select size={size} placeholder="Selecione" defaultValue="">
              <option value="embraer">Embraer</option>
              <option value="tenaris">Tenaris</option>
              <option value="kenvue">Kenvue</option>
            </Select>
          ) : null}
          {control === 'Textarea' ? <Textarea placeholder="Descreva o que aconteceu" /> : null}
        </Field>
      </div>
      <Cluster gap="4">
        <Choice label="controle" value={control} options={[...CONTROLS]} onChange={setControl} />
        <Choice label="size" value={size} options={SIZES} onChange={setSize} />
        <label className="showcase__control">
          <span>label</span>
          <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <Toggle label="hint" value={hint} onChange={setHint} />
        <Toggle label="error" value={error} onChange={setError} />
        <Toggle label="required" value={required} onChange={setRequired} />
        <Toggle label="disabled" value={disabled} onChange={setDisabled} />
        <Toggle label="prefix / suffix" value={affix} onChange={setAffix} />
      </Cluster>

      <p className="showcase__label">Em uso: envie vazio para ver a validação</p>
      <form onSubmit={submit} noValidate>
        <Stack gap="3">
          <Grid gap="3" min={220}>
            <Field label="Título" required error={submitted && missing.titulo ? 'Informe um título para a ocorrência.' : undefined}>
              <Input value={form.titulo} onChange={update('titulo')} placeholder="Ex.: Atraso na apresentação" />
            </Field>
            <Field label="Gravidade" required error={submitted && missing.gravidade ? 'Escolha a gravidade.' : undefined}>
              <Select value={form.gravidade} onChange={update('gravidade')} placeholder="Selecione">
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </Select>
            </Field>
            <Field label="Valor do reembolso" hint="Opcional.">
              <Input value={form.valor} onChange={update('valor')} inputMode="decimal" prefix="R$" placeholder="0,00" />
            </Field>
          </Grid>
          <Field label="Descrição" hint="O que aconteceu, em poucas linhas.">
            <Textarea value={form.descricao} onChange={update('descricao')} />
          </Field>
          <Cluster gap="3">
            <Button type="submit">Registrar ocorrência</Button>
            <span className="showcase__summary" role="status">{saved ? 'Ocorrência registrada.' : ''}</span>
          </Cluster>
        </Stack>
      </form>
    </Section>
  )
}

/** Vitrine dos componentes de `@betinhos/ui`, só no `pnpm dev`. */
export function ComponentsPage() {
  return (
    <PageLayout eyebrow="Design System" title="Componentes">
      <Stack gap="4">
        <ButtonShowcase />
        <FieldShowcase />
        <Section name="Em revisão" summary="Ainda não são componentes React. Entram nesta página um a um, depois de revisados.">
          <ul className="showcase__pending">
            {PENDING.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
      </Stack>
    </PageLayout>
  )
}
