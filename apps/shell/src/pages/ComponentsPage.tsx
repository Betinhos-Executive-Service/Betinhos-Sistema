import { useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronRight, CircleCheck, Clock, Copy, EllipsisVertical, Home, Inbox, LayoutDashboard, Pencil, Plus, PlugZap, SearchX, Trash2, TriangleAlert, Truck, X } from 'lucide-react'
import {
  Alert, Avatar, BottomNav, Breadcrumb, Button, Checkbox, ChoiceGroup, Cluster, DateTile, Dialog, Drawer, EmptyState, Field, Grid, Input, Menu, MetricCard, PageHeader, Pagination, Progress, Radio, SearchBox, SegmentedControl, Select, Sheet, Skeleton, Spinner, Stack, StatusBadge, Surface, Switch, Table, TableTitle, Tabs, Textarea, ToastProvider, Tooltip, Upload,
  filterOptions, useToast, type AlertTone, type ButtonSize, type ButtonVariant, type ControlSize, type SelectOption, type StatusTone, type UploadFile,
} from '@betinhos/ui'
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
const PENDING: string[] = []

type Ocorrencia = { id: string; titulo: string; local: string; cliente: string; responsavel: string; prazo: string; status: StatusTone; statusLabel: string; gravidade: 'success' | 'warning' | 'danger'; gravidadeLabel: string }
const OCORRENCIAS: Ocorrencia[] = [
  { id: 'OC-0412', titulo: 'Atraso na apresentação do motorista', local: 'Aeroporto de Guarulhos', cliente: 'Embraer', responsavel: 'Marina Lopes', prazo: '2026-09-28', status: 'danger', statusLabel: 'Atrasado', gravidade: 'danger', gravidadeLabel: 'Gravidade crítica' },
  { id: 'OC-0409', titulo: 'Veículo diferente do confirmado', local: 'São José dos Campos', cliente: 'Johnson & Johnson', responsavel: 'Carlos Prado', prazo: '2026-10-06', status: 'info', statusLabel: 'Em andamento', gravidade: 'warning', gravidadeLabel: 'Gravidade média' },
  { id: 'OC-0403', titulo: 'Voucher enviado sem telefone do passageiro', local: 'Congonhas', cliente: 'Tenaris', responsavel: 'Ana Ribeiro', prazo: '2026-10-12', status: 'success', statusLabel: 'Concluído', gravidade: 'success', gravidadeLabel: 'Gravidade baixa' },
]
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')

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

const TONES: StatusTone[] = ['neutral', 'info', 'success', 'warning', 'danger']

function StatusBadgeShowcase() {
  const [tone, setTone] = useState<StatusTone>('info')
  const [label, setLabel] = useState('Em andamento')
  const [dot, setDot] = useState(false)
  const [icon, setIcon] = useState(false)
  const icons: Record<StatusTone, ReactNode> = { neutral: null, info: <Clock />, success: <Check />, warning: <Clock />, danger: <TriangleAlert /> }

  return (
    <Section name="StatusBadge" summary="Pílula de status com cinco tons; cada tom é um par de tokens, texto forte sobre fundo suave.">
      <div className="showcase__stage">
        <StatusBadge tone={tone} dot={dot} icon={icon ? icons[tone] : undefined}>{label || 'Status'}</StatusBadge>
      </div>
      <Cluster gap="4">
        <Choice label="tone" value={tone} options={TONES} onChange={setTone} />
        <label className="showcase__control">
          <span>children</span>
          <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <Toggle label="dot" value={dot} onChange={setDot} />
        <Toggle label="icon" value={icon} onChange={setIcon} />
      </Cluster>
      <p className="showcase__label">Os cinco estados do sistema</p>
      <Cluster gap="2">
        <StatusBadge>Rascunho</StatusBadge>
        <StatusBadge tone="info">Aberto</StatusBadge>
        <StatusBadge tone="success">Concluído</StatusBadge>
        <StatusBadge tone="warning">Em análise</StatusBadge>
        <StatusBadge tone="danger">Atrasado</StatusBadge>
      </Cluster>
      <p className="showcase__label">Com segundo sinal: ponto ou ícone</p>
      <Cluster gap="2">
        <StatusBadge tone="success" dot>Conectado</StatusBadge>
        <StatusBadge tone="warning" dot>Pendente</StatusBadge>
        <StatusBadge tone="danger" icon={<TriangleAlert />}>Atrasado</StatusBadge>
        <StatusBadge tone="success" icon={<Check />}>Confirmado</StatusBadge>
        <StatusBadge tone="info" icon={<Clock />}>Aguardando validação</StatusBadge>
      </Cluster>
    </Section>
  )
}

function EmptyStateShowcase() {
  const [filtered, setFiltered] = useState(true)
  return (
    <Section name="EmptyState" summary="Estado vazio ou de erro: ícone, título, explicação curta e a ação que leva ao próximo passo.">
      <Grid gap="4" min={300}>
        <div className="surface">
          {filtered
            ? <EmptyState icon={<Inbox />} title="Nenhuma ocorrência encontrada para estes filtros." action={<Button variant="secondary" onClick={() => setFiltered(false)}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros para ver mais resultados.</EmptyState>
            : <EmptyState icon={<Inbox />} title="Nenhuma ocorrência registrada ainda." action={<Button icon={<Plus size={16} />} onClick={() => setFiltered(true)}>Registrar ocorrência</Button>}>A primeira ocorrência aparece aqui assim que for registrada.</EmptyState>}
        </div>
        <div className="surface">
          <EmptyState tone="danger" icon={<PlugZap />} title="Dataverse sem resposta." action={<Button variant="secondary">Tentar de novo</Button>}>Verifique a conexão e tente de novo. Se continuar, avise a TI.</EmptyState>
        </div>
      </Grid>
      <p className="showcase__label">Alinhado à esquerda (páginas do shell) e compacto (blocos pequenos)</p>
      <Grid gap="4" min={300}>
        <div className="surface">
          <EmptyState align="start" icon={<SearchX />} title="Este endereço não corresponde a nenhuma tela">Escolha uma tela no menu.</EmptyState>
        </div>
        <div className="surface">
          <EmptyState compact icon={<Inbox />} title="Sem notas nesta ocorrência.">Adicione a primeira pelo botão acima.</EmptyState>
        </div>
      </Grid>
    </Section>
  )
}

function SegmentedShowcase() {
  const [periodo, setPeriodo] = useState('semana')
  const [modo, setModo] = useState('timeline')
  return (
    <Section name="SegmentedControl" summary="Seletor de opções mutuamente exclusivas (2 a 5), item ativo em navy; setas trocam a opção.">
      <Cluster gap="4">
        <SegmentedControl aria-label="Período" value={periodo} onChange={setPeriodo} options={[{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'todas', label: 'Todas' }]} />
        <SegmentedControl aria-label="Modo de exibição" size="compact" value={modo} onChange={setModo} options={[{ value: 'timeline', label: 'Linha do tempo' }, { value: 'motorista', label: 'Por motorista' }, { value: 'mapa', label: 'Mapa', disabled: true }]} />
      </Cluster>
      <p className="showcase__summary" role="status">Período: {periodo} · Modo: {modo}</p>
      <div style={{ maxWidth: 420 }}>
        <SegmentedControl aria-label="Período em largura total" fullWidth value={periodo} onChange={setPeriodo} options={[{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]} />
      </div>
    </Section>
  )
}

function SurfaceShowcase() {
  return (
    <Section name="Surface" summary="O card base: branco, borda, raio de 12px e sombra baixa, com cabeçalho opcional.">
      <Grid gap="4" min={280}>
        <Surface eyebrow="Prioridade" title="Próximas ações" action={<Button variant="ghost" size="compact" iconEnd={<ChevronRight size={14} />}>Ver todas</Button>}>
          <p className="showcase__summary" style={{ margin: 0 }}>Três ações vencem até sexta-feira. A mais antiga está atrasada há dois dias.</p>
        </Surface>
        <Surface compact title="Compacto">
          <p className="showcase__summary" style={{ margin: 0 }}>Padding menor, para blocos densos.</p>
        </Surface>
        <Surface flush title="Sem padding (flush)">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {['Listas e tabelas encostam na borda', 'Cada item com seu próprio padding'].map((item) => <li key={item} style={{ padding: '10px 16px', borderTop: '1px solid var(--bt-color-border)', fontSize: 13 }}>{item}</li>)}
          </ul>
        </Surface>
      </Grid>
    </Section>
  )
}

function PageHeaderShowcase() {
  return (
    <Section name="PageHeader" summary="Cabeçalho de página: eyebrow, título em Centabel Book, descrição e até duas ações.">
      <div className="showcase__stage showcase__stage--form" style={{ maxWidth: 'none' }}>
        <PageHeader eyebrow="Qualidade" title="Gestão de ocorrências" description="Registre, acompanhe e encerre as ocorrências da operação." actions={<><Button variant="secondary">Exportar lista</Button><Button icon={<Plus size={16} />}>Registrar ocorrência</Button></>} />
      </div>
    </Section>
  )
}

function MetricCardShowcase() {
  const [loading, setLoading] = useState(false)
  return (
    <Section name="MetricCard" summary="Card de KPI: ícone em fundo suave do tom, rótulo, valor em navy e linha de apoio.">
      <Grid gap="3" min={200}>
        <MetricCard tone="info" icon={<Inbox />} label="Ocorrências abertas" value="128" hint="Últimos 30 dias" loading={loading} />
        <MetricCard tone="danger" icon={<TriangleAlert />} label="Ações atrasadas" value="7" hint="3 críticas" loading={loading} />
        <MetricCard tone="warning" icon={<Clock />} label="Vencem esta semana" value="14" hint="Até 09/10/2026" loading={loading} />
        <MetricCard tone="success" icon={<CircleCheck />} label="Concluídas" value="96" hint="75% do total" loading={loading} />
      </Grid>
      <Cluster gap="3"><Toggle label="loading" value={loading} onChange={setLoading} /></Cluster>
    </Section>
  )
}

function DateTileShowcase() {
  return (
    <Section name="DateTile" summary="Bloco de data em navy, dia grande e mês abaixo, para linhas de agenda; atrasado vira danger.">
      <Cluster gap="4">
        <DateTile date="2026-10-06" />
        <DateTile date="2026-09-28" overdue />
        <DateTile date="2026-10-12" size="compact" />
        <DateTile date="2026-09-28" size="compact" overdue />
      </Cluster>
      <Surface compact>
        <Cluster gap="3">
          <DateTile date="2026-09-28" overdue />
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <Cluster gap="2"><span className="showcase__label">Ação corretiva</span><StatusBadge tone="danger">Atrasado</StatusBadge></Cluster>
            <strong style={{ fontSize: 13 }}>Contato com o cliente sobre o atraso</strong>
            <span className="showcase__summary" style={{ margin: 0 }}>Marina Lopes</span>
          </div>
        </Cluster>
      </Surface>
    </Section>
  )
}

function TableShowcase() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)
  return (
    <Section name="Table" summary="Lista operacional em linhas clicáveis, com cabeçalho off-white, barra de gravidade, carregamento, vazio e rodapé.">
      <Table<Ocorrencia>
        rows={empty ? [] : OCORRENCIAS}
        rowKey={(row) => row.id}
        loading={loading}
        onRowClick={(row) => toast({ tone: 'info', message: `Abrir ${row.id}: ${row.titulo}` })}
        severity={(row) => ({ tone: row.gravidade, label: row.gravidadeLabel })}
        columns={[
          { key: 'titulo', header: 'Ocorrência', width: 'minmax(240px, 1.6fr)', cell: (row) => <TableTitle title={row.titulo} meta={`${row.id} · ${row.local}`} /> },
          { key: 'cliente', header: 'Cliente', width: 'minmax(120px, .8fr)', hideBelow: 'mobile', cell: (row) => row.cliente },
          { key: 'responsavel', header: 'Responsável', width: 'minmax(120px, .8fr)', hideBelow: 'compact', cell: (row) => row.responsavel },
          { key: 'prazo', header: 'Prazo', width: '100px', hideBelow: 'mobile', cell: (row) => <span style={row.status === 'danger' ? { color: 'var(--bt-color-danger)', fontWeight: 800 } : undefined}>{dataBR(row.prazo)}</span> },
          { key: 'status', header: 'Status', width: '120px', align: 'end', cell: (row) => <StatusBadge tone={row.status}>{row.statusLabel}</StatusBadge> },
        ]}
        empty={<EmptyState icon={<Inbox />} title="Nenhuma ocorrência encontrada para estes filtros." action={<Button variant="secondary" onClick={() => setEmpty(false)}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros.</EmptyState>}
        footer={<><span>1–3 de 128</span><Cluster gap="1"><Button variant="secondary" size="compact" disabled>Anterior</Button><Button variant="secondary" size="compact">Próxima</Button></Cluster></>}
      />
      <Cluster gap="3"><Toggle label="loading" value={loading} onChange={setLoading} /><Toggle label="vazio" value={empty} onChange={setEmpty} /></Cluster>
    </Section>
  )
}

function DrawerShowcase() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [wide, setWide] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [files, setFiles] = useState<UploadFile[]>([])
  return (
    <Section name="Drawer" summary="Painel lateral modal pela direita: prende o foco, fecha por X, Esc e fundo; cabeçalho e rodapé fixos, conteúdo rola.">
      <Cluster gap="3">
        <Button onClick={() => setOpen(true)}>Abrir drawer</Button>
        <Toggle label="wide (720px)" value={wide} onChange={setWide} />
      </Cluster>
      <Drawer open={open} onClose={() => setOpen(false)} eyebrow="Ocorrência" title="Registrar ocorrência" size={wide ? 'wide' : 'default'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => { setOpen(false); toast({ tone: 'success', message: 'Ocorrência registrada.' }) }}>Registrar</Button></>}>
        <Stack gap="3">
          <Alert tone="info">Os campos com * são obrigatórios.</Alert>
          <Field label="Título" required><Input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ex.: Atraso na apresentação" /></Field>
          <Field label="Descrição"><Textarea rows={4} /></Field>
          <Field label="Evidências" hint="PDF, JPG ou PNG até 10 MB, no máximo 5.">
            <Upload files={files} onChange={setFiles} accept="image/*,.pdf" maxSize={10 * 1048576} maxFiles={5} label="Arraste as evidências ou escolha os arquivos" hint="PDF, JPG ou PNG até 10 MB" />
          </Field>
        </Stack>
      </Drawer>
    </Section>
  )
}

function SheetShowcase() {
  const [open, setOpen] = useState(false)
  return (
    <Section name="Sheet" summary="Bottom sheet modal para celular: abre pela metade, expande para a altura cheia, arrasta pela alça e fecha por X, Esc, fundo ou gesto.">
      <Cluster gap="3">
        <Button onClick={() => setOpen(true)}>Abrir sheet</Button>
      </Cluster>
      <Sheet open={open} onClose={() => setOpen(false)} eyebrow="Serviço #4205" title="Aeroporto de Congonhas para Itaim Bibi"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Fechar</Button><Button onClick={() => setOpen(false)}>Ligar para o motorista</Button></>}>
        <Stack gap="3">
          <Alert tone="info">Saída às 14:30, motorista confirmado.</Alert>
          <Surface>Passageiro: Ana Souza · 2 malas · voo LA3040.</Surface>
          <Surface>Observação: aguardar na área de desembarque com placa.</Surface>
        </Stack>
      </Sheet>
    </Section>
  )
}

function UploadShowcase() {
  const [files, setFiles] = useState<UploadFile[]>([{ name: 'foto-painel.jpg', size: 348160, url: '#' }])
  return (
    <Section name="Upload" summary="Área de arrastar e soltar com lista dos arquivos, limites de tamanho e quantidade, e erro explicado.">
      <div style={{ maxWidth: 560 }}>
        <Upload files={files} onChange={setFiles} accept="image/*,.pdf" maxSize={2 * 1048576} maxFiles={3} label="Arraste as evidências ou escolha os arquivos" hint="PDF, JPG ou PNG até 2 MB, no máximo 3" />
      </div>
    </Section>
  )
}

function ChoiceShowcase() {
  const [notificar, setNotificar] = useState(true)
  const [canais, setCanais] = useState<string[]>(['email'])
  const [prioridade, setPrioridade] = useState('normal')
  const toggle = (value: string) => setCanais((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]))
  return (
    <Section name="Checkbox, Radio e Switch" summary="Escolhas: várias independentes (Checkbox), uma entre poucas (Radio) e ligar/desligar com efeito imediato (Switch).">
      <Grid gap="4" min={240}>
        <ChoiceGroup label="Avisar por" hint="Pode marcar mais de um." inline>
          <Checkbox label="E-mail" checked={canais.includes('email')} onChange={() => toggle('email')} />
          <Checkbox label="WhatsApp" checked={canais.includes('whats')} onChange={() => toggle('whats')} />
          <Checkbox label="SMS" disabled />
        </ChoiceGroup>
        <ChoiceGroup label="Prioridade" error={prioridade === 'alta' ? 'Prioridade alta exige justificativa no campo Descrição.' : undefined}>
          <Radio name="prio" label="Normal" value="normal" checked={prioridade === 'normal'} onChange={() => setPrioridade('normal')} />
          <Radio name="prio" label="Alta" description="Avisa a coordenação na hora." value="alta" checked={prioridade === 'alta'} onChange={() => setPrioridade('alta')} />
        </ChoiceGroup>
        <Stack gap="2">
          <Switch label="Notificar o cliente" description={notificar ? 'Ligado: o cliente recebe o resumo por e-mail.' : 'Desligado.'} checked={notificar} onChange={(event) => setNotificar(event.target.checked)} />
          <Switch label="Modo de manutenção" disabled />
        </Stack>
      </Grid>
    </Section>
  )
}

function TabsShowcase() {
  const [tab, setTab] = useState('detalhes')
  return (
    <Section name="Tabs" summary="Abas de uma mesma tela, com sublinhado azul; setas, Home e End trocam a aba.">
      <Surface>
        <Tabs aria-label="Seções da ocorrência" value={tab} onChange={setTab} tabs={[{ value: 'detalhes', label: 'Detalhes' }, { value: 'acoes', label: 'Plano de ações', badge: 3 }, { value: 'historico', label: 'Histórico' }, { value: 'anexos', label: 'Anexos', disabled: true }]}>
          <p className="showcase__summary" style={{ margin: 0 }}>{tab === 'detalhes' ? 'Contexto, causa e solução da ocorrência.' : tab === 'acoes' ? 'Três ações corretivas, uma atrasada.' : 'Registro de alterações e notas.'}</p>
        </Tabs>
      </Surface>
    </Section>
  )
}

function DialogMenuShowcase() {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [info, setInfo] = useState(false)
  return (
    <Section name="Dialog e Menu" summary="Dialog: decisão curta no centro (confirmar, excluir). Menu: ações do registro atrás de um botão ⋯.">
      <Cluster gap="3">
        <Button variant="danger" onClick={() => setConfirm(true)}>Excluir opção</Button>
        <Button variant="secondary" onClick={() => setInfo(true)}>Aviso informativo</Button>
        <Menu
          trigger={(props) => <Button variant="secondary" icon={<EllipsisVertical size={16} />} aria-label="Mais ações" {...props} />}
          actions={[
            { id: 'editar', label: 'Editar', icon: <Pencil />, onSelect: () => toast({ message: 'Editar ocorrência.' }) },
            { id: 'copiar', label: 'Duplicar', icon: <Copy />, onSelect: () => toast({ message: 'Ocorrência duplicada.' }) },
            { id: 'excluir', label: 'Excluir', icon: <Trash2 />, tone: 'danger', onSelect: () => setConfirm(true) },
          ]}
        />
      </Cluster>
      <Dialog open={confirm} onClose={() => setConfirm(false)} tone="danger" title="Excluir esta opção?" actions={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="danger" onClick={() => { setConfirm(false); toast({ tone: 'success', message: 'Opção excluída.' }) }}>Excluir</Button></>}>
        Registros vinculados podem ser afetados. Esta ação não pode ser desfeita.
      </Dialog>
      <Dialog open={info} onClose={() => setInfo(false)} title="Opções sincronizadas com o Dataverse" actions={<Button onClick={() => setInfo(false)}>Entendi</Button>}>
        Alterações feitas aqui valem para todos os usuários do módulo.
      </Dialog>
    </Section>
  )
}

function MiscShowcase() {
  const [page, setPage] = useState(1)
  const [progress, setProgress] = useState(64)
  return (
    <Section name="Tooltip, Pagination, Skeleton, Spinner, Avatar, Breadcrumb e Progress" summary="Peças pequenas que completam as telas.">
      <Grid gap="4" min={260}>
        <Stack gap="3">
          <p className="showcase__label">Tooltip e Spinner</p>
          <Cluster gap="3">
            <Tooltip text="Atualiza a lista com os dados do Dataverse"><Button variant="secondary" icon={<Clock size={16} />} aria-label="Atualizar" /></Tooltip>
            <Spinner label="Carregando ocorrências" />
            <Avatar name="Marina Lopes" size="sm" /><Avatar name="Carlos Prado" /><Avatar name="Ana Ribeiro" size="lg" />
          </Cluster>
          <p className="showcase__label">Breadcrumb</p>
          <Breadcrumb items={[{ label: 'Operacional', href: '#/' }, { label: 'Ocorrências', href: '#/componentes' }, { label: 'OC-0412' }]} />
        </Stack>
        <Stack gap="3">
          <p className="showcase__label">Skeleton</p>
          <Cluster gap="3"><Skeleton shape="circle" /><Stack gap="2"><Skeleton width={180} /><Skeleton width={120} /></Stack></Cluster>
          <Skeleton shape="rect" height={56} />
          <p className="showcase__label">Progress</p>
          <Progress label="Ações concluídas" value={progress} tone={progress >= 100 ? 'success' : 'info'} />
          <Cluster gap="2"><Button size="compact" variant="secondary" onClick={() => setProgress((v) => Math.max(0, v - 16))}>−16</Button><Button size="compact" variant="secondary" onClick={() => setProgress((v) => Math.min(100, v + 16))}>+16</Button></Cluster>
        </Stack>
      </Grid>
      <p className="showcase__label">Pagination</p>
      <Pagination page={page} pageSize={20} total={128} noun="ocorrências" onChange={setPage} />
      <p className="showcase__label">BottomNav: aparece só no celular (até 820px), com até 5 atalhos</p>
      <BottomNav activeId="componentes" items={[{ id: 'inicio', label: 'Início', href: '#/cr40f_homebetinhos', icon: <Home /> }, { id: 'dashboard', label: 'Dashboard', href: '#/new_dashboard', icon: <LayoutDashboard /> }, { id: 'reservas', label: 'Reservas', href: '#/cr40f_reservadeveculos', icon: <Truck />, badge: 3 }, { id: 'componentes', label: 'Componentes', href: '#/componentes', icon: <Inbox /> }]} />
    </Section>
  )
}

const ALERT_TONES: AlertTone[] = ['info', 'success', 'warning', 'danger']

function AlertShowcase() {
  const toast = useToast()
  const [tone, setTone] = useState<AlertTone>('warning')
  const [withTitle, setWithTitle] = useState(true)
  const [dismissible, setDismissible] = useState(true)
  const [withAction, setWithAction] = useState(false)
  const [visible, setVisible] = useState(true)
  const texts: Record<AlertTone, { title: string; text: string }> = {
    info: { title: 'Opções sincronizadas com o Dataverse', text: 'Alterações valem para todos os usuários do módulo.' },
    success: { title: 'Ocorrência registrada', text: 'O responsável recebe o aviso por e-mail.' },
    warning: { title: 'Registros vinculados podem ser afetados', text: 'Confira o uso da opção antes de excluir.' },
    danger: { title: 'Não foi possível salvar', text: 'Revise os campos destacados e tente de novo.' },
  }

  return (
    <Section name="Alert" summary="Aviso na página (Alert) e aviso flutuante (Toast, via useToast), nos quatro tons de status.">
      <div className="showcase__stage showcase__stage--form" style={{ maxWidth: 560 }}>
        {visible ? (
          <Alert
            tone={tone}
            title={withTitle ? texts[tone].title : undefined}
            action={withAction ? <Button variant="secondary" size="compact" onClick={() => setVisible(false)}>Entendi</Button> : undefined}
            onDismiss={dismissible ? () => setVisible(false) : undefined}
          >
            {texts[tone].text}
          </Alert>
        ) : <Button variant="ghost" onClick={() => setVisible(true)}>Mostrar de novo</Button>}
      </div>
      <Cluster gap="4">
        <Choice label="tone" value={tone} options={ALERT_TONES} onChange={setTone} />
        <Toggle label="title" value={withTitle} onChange={setWithTitle} />
        <Toggle label="onDismiss" value={dismissible} onChange={setDismissible} />
        <Toggle label="action" value={withAction} onChange={setWithAction} />
      </Cluster>
      <p className="showcase__label">Toast: dispare e veja no topo da tela</p>
      <Cluster gap="3">
        <Button variant="secondary" onClick={() => toast({ tone: 'success', message: 'Ocorrência registrada.' })}>Sucesso (some em 4 s)</Button>
        <Button variant="secondary" onClick={() => toast({ tone: 'danger', message: 'Não foi possível salvar. Revise os campos destacados.' })}>Erro (fica até fechar)</Button>
        <Button variant="secondary" onClick={() => toast({ tone: 'info', message: 'Lista atualizada.' })}>Informação</Button>
      </Cluster>
    </Section>
  )
}

/** Vitrine dos componentes de `@betinhos/ui`, só no `pnpm dev`. */
export function ComponentsPage() {
  return (
    <ToastProvider>
    <PageLayout eyebrow="Design System" title="Componentes">
      <Stack gap="4">
        <ButtonShowcase />
        <FieldShowcase />
        <SelectShowcase />
        <SearchBoxShowcase />
        <StatusBadgeShowcase />
        <AlertShowcase />
        <EmptyStateShowcase />
        <SegmentedShowcase />
        <SurfaceShowcase />
        <PageHeaderShowcase />
        <MetricCardShowcase />
        <DateTileShowcase />
        <TableShowcase />
        <DrawerShowcase />
        <SheetShowcase />
        <UploadShowcase />
        <ChoiceShowcase />
        <TabsShowcase />
        <DialogMenuShowcase />
        <MiscShowcase />
        {PENDING.length ? (
          <Section name="Em revisão" summary="Ainda não são componentes React. Entram nesta página um a um, depois de revisados.">
            <ul className="showcase__pending">
              {PENDING.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </Section>
        ) : null}
      </Stack>
    </PageLayout>
    </ToastProvider>
  )
}
