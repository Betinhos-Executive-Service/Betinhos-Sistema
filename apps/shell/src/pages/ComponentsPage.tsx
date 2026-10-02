import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'
import { Button, Cluster, Field, Grid, Input, SearchBox, Select, Stack, Textarea, filterOptions, type ButtonSize, type ButtonVariant, type ControlSize, type SelectOption } from '@betinhos/ui'
import { PageLayout } from '../app/PageLayout'

const CLIENTES: SelectOption[] = ['Embraer', 'Tenaris', 'Kenvue', 'Johnson & Johnson'].map((label) => ({ value: label, label }))
const VEICULOS: SelectOption[] = [
  { value: 'v1', label: 'Corolla · ABC1D23', group: 'Sedan' },
  { value: 'v2', label: 'Civic · EFG4H56', group: 'Sedan' },
  { value: 'v3', label: 'SW4 · IJK7L89', group: 'SUV' },
  { value: 'v4', label: 'Commander · MNO1P23', group: 'SUV' },
  { value: 'v5', label: 'Sprinter · QRS4T56', group: 'Van' },
]
const STATUS: SelectOption[] = ['Aberto', 'Em andamento', 'Concluído', 'Cancelado'].map((label) => ({ value: label, label, disabled: label === 'Cancelado' }))
const MOTORISTAS: SelectOption[] = ['André Luís', 'Bruno Araújo', 'Cláudio Ferraz', 'Érica Nunes', 'João Conceição', 'Márcio Sá', 'Patrícia Gusmão', 'Sérgio Antônio'].map((label) => ({ value: label, label }))
const PESSOAS: SelectOption[] = [
  { value: 'p1', label: 'Marina Lopes', subtitle: 'Embraer', search: 'mari' },
  { value: 'p2', label: 'Carlos Prado', subtitle: 'Tenaris' },
  { value: 'p3', label: 'Ana Ribeiro', subtitle: 'Kenvue' },
  { value: 'p4', label: 'João Araújo', subtitle: 'Embraer' },
  { value: 'p5', label: 'Renata Sá', subtitle: 'Johnson & Johnson' },
]

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'action', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['compact', 'default', 'touch']
const CONTROLS = ['Input', 'Textarea'] as const
/** Componentes do Design System que ainda não são React; entram aqui conforme forem revisados. */
const PENDING = ['StatusBadge', 'Alert', 'EmptyState', 'SegmentedControl', 'Surface', 'PageHeader', 'MetricCard', 'DateTile', 'Table']

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
    <Section name="Field" summary="Rótulo, controle, ajuda e erro ligados por id. Controles: Input e Textarea.">
      <div className="showcase__stage showcase__stage--form">
        <Field
          label={label || 'Rótulo'}
          hint={hint ? 'Como aparece no contrato.' : undefined}
          error={error ? 'Informe o cliente para salvar a ocorrência.' : undefined}
          required={required}
          disabled={disabled}
        >
          {control === 'Input' ? <Input size={size} placeholder="Ex.: Embraer" prefix={affix ? 'R$' : undefined} suffix={affix ? 'km' : undefined} /> : null}
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
            <Field label="Cliente" required error={submitted && missing.gravidade ? 'Informe o cliente.' : undefined}>
              <Input value={form.gravidade} onChange={update('gravidade')} placeholder="Ex.: Embraer" />
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

function SelectShowcase() {
  const [motorista, setMotorista] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>('Aberto')
  const [solicitante, setSolicitante] = useState<string | null>(null)
  const [passageiros, setPassageiros] = useState<string[]>(['p1', 'p4'])
  const [remoto, setRemoto] = useState<string | null>(null)
  const [found, setFound] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [bloqueado] = useState<string | null>('Embraer')
  const [veiculo, setVeiculo] = useState<string | null>(null)
  const [centros, setCentros] = useState<SelectOption[]>(['Operação', 'Comercial', 'Frota'].map((label) => ({ value: label, label })))
  const [centro, setCentro] = useState<string | null>(null)
  const [compacto, setCompacto] = useState<string | null>(null)

  // Simula a busca no Dataverse: responde depois de 600 ms, como o seletor de passageiros do Formulário Geral.
  const search = (query: string) => {
    setLoading(true)
    setTimeout(() => { setFound(filterOptions(PESSOAS, query)); setLoading(false) }, 600)
  }

  return (
    <Section name="Select" summary="Um componente, nove usos: com busca, sem busca, pessoa com subtítulo, múltiplo, busca remota, agrupado, criável, compacto e desabilitado.">
      <Grid gap="4" min={240}>
        <Field label="Motorista" hint="Com busca: ignora acento e caixa.">
          <Select options={MOTORISTAS} value={motorista} onChange={setMotorista} />
        </Field>
        <Field label="Status" required hint="Sem busca; obrigatório não mostra o limpar.">
          <Select options={STATUS} searchable={false} value={status} onChange={setStatus} />
        </Field>
        <Field label="Solicitante" hint="Opção com subtítulo; a busca também acha pelo cliente.">
          <Select options={PESSOAS} placeholder="Selecionar solicitante" value={solicitante} onChange={setSolicitante} />
        </Field>
        <Field label="Passageiros" hint="Múltiplo: o painel fica aberto e o gatilho mostra +N.">
          <Select multiple options={PESSOAS} placeholder="Selecione passageiros" value={passageiros} onChange={setPassageiros} />
        </Field>
        <Field label="Passageiro (busca remota)" hint="As opções chegam de fora, com estado de carregamento.">
          <Select options={found} loading={loading} loadingText="Pesquisando passageiros…" emptyText="Nenhum passageiro encontrado." onSearchChange={search} placeholder="Selecionar passageiro" value={remoto} onChange={setRemoto} />
        </Field>
        <Field label="Veículo" hint="Opções agrupadas por categoria.">
          <Select options={VEICULOS} value={veiculo} onChange={setVeiculo} />
        </Field>
        <Field label="Centro de custo" hint="Criável: digite um nome novo e escolha “Adicionar”.">
          <Select options={centros} value={centro} onChange={setCentro} onCreate={(label) => { setCentros((list) => [...list, { value: label, label }]); setCentro(label) }} />
        </Field>
        <Field label="Tamanho compacto" hint="32px, para filtros e áreas densas.">
          <Select size="compact" options={CLIENTES} value={compacto} onChange={setCompacto} />
        </Field>
        <Field label="Cliente" disabled hint="Desabilitado.">
          <Select options={CLIENTES} value={bloqueado} onChange={() => {}} />
        </Field>
      </Grid>
    </Section>
  )
}

function SearchBoxShowcase() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SelectOption[] | null>(null)
  const [compact, setCompact] = useState('')

  // Simula a busca no Dataverse: só roda depois da pausa de digitação.
  const search = (text: string) => {
    if (!text.trim()) { setResults(null); return }
    setSearching(true)
    setTimeout(() => { setResults(filterOptions([...MOTORISTAS, ...PESSOAS], text)); setSearching(false) }, 500)
  }

  return (
    <Section name="SearchBox" summary="Busca de página: lupa, campo, limpar e espera de digitação antes de buscar.">
      <Stack gap="3">
        <SearchBox value={query} onChange={setQuery} onSearch={search} loading={searching} placeholder="Buscar por nome, cliente ou motorista" aria-label="Buscar pessoas" />
        <p className="showcase__summary" role="status">
          {searching ? 'Buscando…' : results === null ? 'Digite para buscar; a busca dispara 250 ms depois da última tecla. Esc limpa.' : results.length ? `${results.length} resultado(s): ${results.map((item) => item.label).join(', ')}` : 'Nenhum resultado encontrado para estes termos.'}
        </p>
        <p className="showcase__label">Compacto, para filtros</p>
        <div style={{ maxWidth: 320 }}>
          <SearchBox size="compact" value={compact} onChange={setCompact} placeholder="Filtrar lista" aria-label="Filtrar lista" />
        </div>
      </Stack>
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
        <SelectShowcase />
        <SearchBoxShowcase />
        <Section name="Em revisão" summary="Ainda não são componentes React. Entram nesta página um a um, depois de revisados.">
          <ul className="showcase__pending">
            {PENDING.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </Section>
      </Stack>
    </PageLayout>
  )
}
