import { useState, type ReactNode } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'
import { Button, Cluster, Stack, type ButtonSize, type ButtonVariant } from '@betinhos/ui'
import { PageLayout } from '../app/PageLayout'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'action', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['compact', 'default', 'touch']
/** Componentes do Design System que ainda não são React; entram aqui conforme forem revisados. */
const PENDING = ['Field', 'SearchBox', 'StatusBadge', 'Alert', 'EmptyState', 'SegmentedControl', 'Surface', 'PageHeader', 'MetricCard', 'DateTile', 'Table']

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

/** Vitrine dos componentes de `@betinhos/ui`, só no `pnpm dev`. */
export function ComponentsPage() {
  return (
    <PageLayout eyebrow="Design System" title="Componentes">
      <Stack gap="4">
        <ButtonShowcase />
        <Section name="Em revisão" summary="Ainda não são componentes React. Entram nesta página um a um, depois de revisados.">
          <ul className="showcase__pending">
            {PENDING.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
      </Stack>
    </PageLayout>
  )
}
