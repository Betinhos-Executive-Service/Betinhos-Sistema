# Drawer de manutenção em blocos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a gaveta de manutenção em cabeçalho com chips e "⋯", card Pedido, card Próximo passo e card Histórico, sem rodapé nem textos de ajuda.

**Architecture:** Um arquivo novo, `ManutencaoResumo.tsx`, guarda as peças de leitura (chips, menu "⋯", Pedido, Histórico). `ManutencaoPassoAPasso` perde o topo e a lista de feitos e passa a ser só barra + passo. `GavetaManutencao` calcula `avaliar(m, hoje)`, monta os blocos e põe o "⋯" nas `actions` do Drawer.

**Tech Stack:** React 19, TypeScript, `@betinhos/ui` 3.x (`Drawer`, `Menu`, `StatusBadge`, `Button`), Vitest + Testing Library (jsdom), CSS com tokens `--bt-*`.

**Spec:** `docs/superpowers/specs/2026-11-18-drawer-manutencao-blocos-design.md`

## Global Constraints

- Pasta: `apps/shell/src/pages/frota/`. Rodar comandos da raiz do worktree.
- Textos em pt-BR com acentos; dados de teste fictícios (repositório público).
- Só tokens do DS em CSS; nada de `border-left` colorido para destacar caixa.
- Não mudar `domain/manutencaoEtapas.ts`, as APIs do `DataSource` nem os formulários de exceção.
- Preservar: contador de requisição de `carregar`, `desatualizada()`, `useGravar`, `gravado()`, foco ao abrir exceção (1º campo) e ao voltar ("Mais ações").
- Testes: `pnpm --filter shell exec vitest run src/pages/frota/components/<arquivo>`; tipos: `pnpm --filter shell typecheck`. Se o filtro `shell` não existir, rodar `pnpm vitest run <caminho>` dentro de `apps/shell`.

---

### Task 1: Peças de leitura (`ManutencaoResumo.tsx`)

**Files:**
- Create: `apps/shell/src/pages/frota/components/ManutencaoResumo.tsx`
- Create: `apps/shell/src/pages/frota/components/ManutencaoResumo.test.tsx`
- Modify: `apps/shell/src/pages/frota/frota.css` (bloco "guia", linhas ~196-218)

**Interfaces:**
- Consumes: `avaliar`, `rotuloExtra`, `textoSaida`, `type Situacao`, `type Extra` de `../domain/manutencaoEtapas`; `Arquivos` de `./ManutencaoPassoAPasso`; `GRAU`, `STATUS_OPTIONS`, `TIPO_REPARO`, `label` de `../data/schema`.
- Produces:
  - `CabecalhoManutencao({ m, situacao }: { m: DetalheManutencao; situacao: Situacao })`
  - `MaisAcoes({ situacao, onExtra }: { situacao: Situacao; onExtra: (extra: Extra) => void })` (renderiza `null` sem extras)
  - `PedidoManutencao({ m, onOpenVeiculo }: { m: DetalheManutencao; onOpenVeiculo?: (id: string) => void })`
  - `HistoricoManutencao({ situacao }: { situacao: Situacao })` (renderiza `null` sem feitos ou quando reprovada/cancelada)
  - `Bloco({ titulo, destaque, children }: { titulo: string; destaque?: boolean; children: ReactNode })`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// apps/shell/src/pages/frota/components/ManutencaoResumo.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { avaliar } from '../domain/manutencaoEtapas'
import { CabecalhoManutencao, HistoricoManutencao, MaisAcoes, PedidoManutencao } from './ManutencaoResumo'

afterEach(cleanup)
const HOJE = '2026-11-17'
// Mesmos fixtures do ManutencaoPassoAPasso.test.tsx.
const base: DetalheManutencao = {
  id: 'm1', codigo: 'OM-1', descricao: 'Revisão fictícia', status: MANUT.SOLICITADO, grau: 2, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null,
  dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 60000,
  veiculo: { id: 'v1', label: 'TST4D44' }, solicitante: { id: 'p1', label: 'Motorista Fictício' }, criadoEm: '2026-11-14T12:00:00Z', servicos: [], categorias: [],
  origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [],
  linkNotaFiscal: null, fotosFinais: [], programacao: null, despesa: null,
}
const m = (patch: Partial<DetalheManutencao>): DetalheManutencao => ({ ...base, ...patch })
const agendada = m({ status: MANUT.AGENDADO, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', programacao: { geralId: 'g1', motorista: null, saida: '2026-11-23T03:00:00.000Z' } })
const programada = m({ ...agendada, status: MANUT.PROGRAMADO, programacao: { geralId: 'g1', motorista: { id: 'p2', label: 'Outro Fictício' }, saida: '2026-11-24T13:00:00.000Z' } })

describe('CabecalhoManutencao', () => {
  it('mostra grau, status, prazo e quem pediu', () => {
    render(<CabecalhoManutencao m={base} situacao={avaliar(base, HOJE)} />)
    expect(screen.getByText('Média')).toBeTruthy()
    expect(screen.getByText('Solicitado')).toBeTruthy()
    expect(screen.getByText('há 3 dias')).toBeTruthy()
    expect(screen.getByText(/pedido por Motorista Fictício em 14\/11/)).toBeTruthy()
  })
  it('programada: diz quem leva e quando, no lugar de quem pediu', () => {
    render(<CabecalhoManutencao m={programada} situacao={avaliar(programada, HOJE)} />)
    expect(screen.getByText(/Outro Fictício leva em/)).toBeTruthy()
    expect(screen.queryByText(/pedido por/)).toBeNull()
  })
  it('o prazo atrasado diz "Atrasada" em texto, não só na cor', () => {
    const atrasada = m({ ...agendada, janelaInicio: '2026-11-09', janelaFim: '2026-11-15' })
    render(<CabecalhoManutencao m={atrasada} situacao={avaliar(atrasada, HOJE)} />)
    expect(screen.getByText('desde 15/11').closest('[data-perigo]')?.textContent).toContain('Atrasada')
  })
})

describe('MaisAcoes', () => {
  it('Programado oferece Concluir por ele', async () => {
    const onExtra = vi.fn()
    render(<MaisAcoes situacao={avaliar(programada, HOJE)} onExtra={onExtra} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Concluir por ele', hidden: true }))
    expect(onExtra).toHaveBeenCalledWith('concluir')
  })
  it('Reprovada: sem "⋯"', () => {
    const reprovada = m({ status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' })
    render(<MaisAcoes situacao={avaliar(reprovada, HOJE)} onExtra={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
  })
})

describe('PedidoManutencao', () => {
  it('cita a descrição e mostra só os campos preenchidos', () => {
    render(<PedidoManutencao m={base} />)
    const pedido = screen.getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('“Revisão fictícia”')).toBeTruthy()
    expect(within(pedido).getByText('60.000 km')).toBeTruthy()
    expect(within(pedido).queryByText('Tipo de reparo')).toBeNull()
    expect(within(pedido).queryByText('Comentário ao motorista')).toBeNull()
  })
  it('com tipo, comentário e veículo: mostra e abre o veículo', () => {
    const onOpenVeiculo = vi.fn()
    render(<PedidoManutencao m={m({ tipo: 1, comentarioAoMotorista: 'Levar cedo' })} onOpenVeiculo={onOpenVeiculo} />)
    expect(screen.getByText('Tipo de reparo')).toBeTruthy()
    expect(screen.getByText('Levar cedo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver o veículo TST4D44' }))
    expect(onOpenVeiculo).toHaveBeenCalledWith('v1')
  })
})

describe('HistoricoManutencao', () => {
  it('lista o que já foi feito', () => {
    render(<HistoricoManutencao situacao={avaliar(programada, HOJE)} />)
    expect(screen.getByRole('region', { name: 'Histórico' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })
  it('sem nada feito: não aparece', () => {
    render(<HistoricoManutencao situacao={{ ...avaliar(base, HOJE), feitos: [] }} />)
    expect(screen.queryByRole('region', { name: 'Histórico' })).toBeNull()
  })
})
```

Antes de rodar, confira o valor de `TIPO_REPARO` usado (`rg -n "TIPO_REPARO" apps/shell/src/pages/frota/data/schema.ts`) e troque `tipo: 1` por um valor que exista na lista.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter shell exec vitest run src/pages/frota/components/ManutencaoResumo.test.tsx`
Expected: FAIL, `Failed to resolve import "./ManutencaoResumo"`.

- [ ] **Step 3: Implementar**

```tsx
// apps/shell/src/pages/frota/components/ManutencaoResumo.tsx
import { MoreHorizontal } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button, Menu, StatusBadge, type MenuAction, type StatusTone } from '@betinhos/ui'
import { formatBR, diaSP } from '../data/dates'
import { GRAU, STATUS_OPTIONS, TIPO_REPARO, label } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { rotuloExtra, textoSaida, type Extra, type Situacao } from '../domain/manutencaoEtapas'
import { Arquivos } from './ManutencaoPassoAPasso'

const tomDoGrau = (grau: number | null): StatusTone => (grau === 4 ? 'danger' : grau === 3 ? 'warning' : 'neutral')

/** Bloco da gaveta: título curto em caixa alta e conteúdo. `destaque` = o passo atual (fundo branco, borda forte). */
export function Bloco({ titulo, destaque = false, children }: { titulo: string; destaque?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section className="frota-bloco" data-destaque={destaque ? '' : undefined} aria-labelledby={id}>
      <h2 id={id} className="frota-bloco__titulo">{titulo}</h2>
      {children}
    </section>
  )
}

/** Linha de chips logo abaixo do título da gaveta: grau, status, prazo e quem pediu (ou quem leva). */
export function CabecalhoManutencao({ m, situacao }: { m: DetalheManutencao; situacao: Situacao }) {
  const p = m.programacao
  const leva = situacao.etapa === 'realizar' && p?.motorista && p.saida ? `${p.motorista.label} leva em ${textoSaida(p.saida)}` : null
  const pedido = `pedido por ${m.solicitante?.label || 'não informado'}${m.criadoEm ? ` em ${formatBR(diaSP(m.criadoEm)).slice(0, 5)}` : ''}`
  return (
    <div className="frota-cabecalho">
      {m.grau !== null ? <StatusBadge tone={tomDoGrau(m.grau)}>{label(GRAU, m.grau)}</StatusBadge> : null}
      <StatusBadge tone="info">{label(STATUS_OPTIONS.manutencao, m.status)}</StatusBadge>
      {situacao.prazo ? (
        <StatusBadge tone={situacao.prazo.perigo ? 'danger' : 'neutral'} data-perigo={situacao.prazo.perigo ? '' : undefined}>
          {situacao.prazo.rotulo} <span>{situacao.prazo.texto}</span>
        </StatusBadge>
      ) : null}
      <span className="frota-muted">{leva ?? pedido}</span>
    </div>
  )
}

/** "⋯ Mais ações" com as exceções da etapa; vai nas actions do Drawer. */
export function MaisAcoes({ situacao, onExtra }: { situacao: Situacao; onExtra: (extra: Extra) => void }) {
  const acoes: MenuAction[] = situacao.extras.map((extra) => ({ id: extra, label: rotuloExtra(extra, situacao.etapa), onSelect: () => onExtra(extra) }))
  if (!acoes.length) return null
  return <Menu trigger={(props) => <Button variant="ghost" size="compact" icon={<MoreHorizontal size={16} />} aria-label="Mais ações" {...props} />} actions={acoes} />
}

/** Card do pedido do motorista: descrição citada, campos preenchidos, fotos e link do veículo. */
export function PedidoManutencao({ m, onOpenVeiculo }: { m: DetalheManutencao; onOpenVeiculo?: (id: string) => void }) {
  const linhas: [string, string][] = []
  if (m.km !== null) linhas.push(['Km no pedido', `${m.km.toLocaleString('pt-BR')} km`])
  if (m.tipo !== null) linhas.push(['Tipo de reparo', label(TIPO_REPARO, m.tipo)])
  if (m.comentarioAoMotorista) linhas.push(['Comentário ao motorista', m.comentarioAoMotorista])
  return (
    <Bloco titulo="Pedido">
      {m.descricao ? <p className="frota-bloco__citacao">“{m.descricao}”</p> : null}
      {linhas.length ? (
        <dl className="frota-detail">
          {linhas.map(([nome, valor]) => <div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>)}
        </dl>
      ) : null}
      <Arquivos titulo="Fotos do pedido" links={m.fotosPedido} />
      {m.veiculo && onOpenVeiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(m.veiculo!.id)}>Ver o veículo {m.veiculo.label}</button> : null}
    </Bloco>
  )
}

/** O que já foi feito, como linha do tempo. Reprovada/cancelada mostram o motivo no card do passo, não aqui. */
export function HistoricoManutencao({ situacao }: { situacao: Situacao }) {
  const parada = situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada'
  if (parada || !situacao.feitos.length) return null
  return (
    <Bloco titulo="Histórico">
      <ol className="frota-linha-tempo">{situacao.feitos.map((f) => <li key={f}>{f}</li>)}</ol>
    </Bloco>
  )
}
```

Confira antes: `formatBR` e `diaSP` existem em `../data/dates` (já usados em `ManutencaoPassoAPasso.tsx`); `StatusTone` e `MenuAction` são exportados por `@betinhos/ui` (`rg -n "StatusTone|MenuAction" "$(readlink -f apps/shell/node_modules/@betinhos/ui)/dist" -g "*.d.ts" | head -3`; se o node_modules do worktree for o symlink antigo com ui 1.x, rodar `pnpm install` no worktree antes).

- [ ] **Step 4: CSS**

Em `frota.css`, depois de `.frota-guia__feitos` (linha ~206), acrescentar:

```css
.frota-gaveta-corpo { display: grid; gap: var(--bt-space-4); min-width: 0; }
.frota-cabecalho { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-2); }
.frota-bloco { display: grid; gap: var(--bt-space-3); min-width: 0; padding: var(--bt-space-4); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background: var(--bt-color-surface-subtle); }
.frota-bloco[data-destaque] { background: var(--bt-color-surface); border-color: var(--bt-color-border-strong); }
.frota-bloco__titulo { margin: 0; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-bold); letter-spacing: .04em; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.frota-bloco__citacao { margin: 0; font-size: var(--bt-font-size-14); }
.frota-linha-tempo { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; font-size: var(--bt-font-size-13); }
.frota-linha-tempo li { position: relative; padding-left: var(--bt-space-4); }
.frota-linha-tempo li::before { content: ''; position: absolute; left: 0; top: .5em; width: 8px; height: 8px; border-radius: 50%; background: var(--bt-color-border-strong); }
```

Confira os nomes dos tokens antes (`rg -no "var\(--bt-(radius|color-surface|color-border)[a-z-]*\)" apps/shell/src | sort -u | head -20`) e use os que existem.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter shell exec vitest run src/pages/frota/components/ManutencaoResumo.test.tsx`
Expected: PASS (10 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota/components/ManutencaoResumo.tsx apps/shell/src/pages/frota/components/ManutencaoResumo.test.tsx apps/shell/src/pages/frota/frota.css
git commit -m "feat(frota): peças do drawer de manutenção em blocos

Chips de grau, status e prazo, menu Mais ações, cards Pedido e Histórico.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guia só com barra e passo

**Files:**
- Modify: `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx:1-88` e o texto "Também dá para programar pela linha na Geral." (~linha 232)
- Modify: `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.test.tsx:45-55,100-113,123-127`

**Interfaces:**
- Consumes: nada novo.
- Produces: `ManutencaoPassoAPasso` com as mesmas props de hoje (`source, m, hoje, onFeito, onDesatualizada, onExtra, autoFoco`), renderizando só `<Barra>` e `<Passo>`. `Arquivos` continua exportado.

- [ ] **Step 1: Ajustar os testes primeiro**

No teste "mostra só o passo Agendar…", trocar as três últimas asserções por:

```tsx
    // Prazo, grau e quem pediu ficam no cabeçalho da gaveta (ManutencaoResumo).
    expect(screen.queryByText('há 3 dias')).toBeNull()
    expect(screen.queryByText(/pedido por/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
```

Apagar o teste "o prazo atrasado diz \"Atrasada\"…" (foi para `ManutencaoResumo.test.tsx`).

No teste "Programado mostra aguardando o App e o ⋯ com Concluir por ele", renomear para `'Programado mostra aguardando o App'` e apagar as três linhas do "Mais ações"/menuitem/`onExtra` (o "⋯" foi para `ManutencaoResumo.test.tsx`); trocar `const props = montar(programada)` por `montar(programada)`.

No teste "Reprovada: …", apagar a linha `expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()`.

Acrescentar no fim do `describe`:

```tsx
  it('Programar não repete a dica da Geral', async () => {
    montar(agendada)
    expect(screen.queryByText('Também dá para programar pela linha na Geral.')).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter shell exec vitest run src/pages/frota/components/ManutencaoPassoAPasso.test.tsx`
Expected: FAIL em "mostra só o passo Agendar" (o prazo ainda aparece) e em "Programar não repete a dica".

- [ ] **Step 3: Implementar**

Substituir o corpo de `ManutencaoPassoAPasso` (linhas 53-88) por:

```tsx
/** Guia da gaveta da manutenção: barra de três etapas e um passo por vez. Cabeçalho, "⋯" e histórico ficam na gaveta (ManutencaoResumo). */
export function ManutencaoPassoAPasso({ source, m, hoje, onFeito, onDesatualizada, onExtra, autoFoco = true }: Props) {
  const situacao = useMemo(() => avaliar(m, hoje), [m, hoje])
  return (
    <div className="frota-guia">
      <Barra situacao={situacao} />
      {/* A chave remonta o passo quando os dados de partida mudam (ex.: reagendou e continua em Programar). */}
      <Passo key={chavePasso(m)} source={source} m={m} hoje={hoje} situacao={situacao} onFeito={onFeito} onDesatualizada={onDesatualizada} onExtra={onExtra} autoFoco={autoFoco} />
    </div>
  )
}
```

Apagar a linha `<p className="frota-muted">Também dá para programar pela linha na Geral.</p>` de `PassoProgramar`.

Limpar imports que ficaram sem uso: `MoreHorizontal`, `Menu`, `type MenuAction`, `rotuloExtra`, `GRAU` (se `GRAUS` ainda usa `GRAU`, mantenha), `textoSaida` só se não for mais usado (o passo AguardarConclusao usa; mantenha). Rodar `pnpm --filter shell typecheck` para confirmar.

Em `frota.css`, apagar as regras sem uso: `.frota-guia__topo`, `.frota-guia__id`, `.frota-guia__id h2`, `.frota-guia__prazo*`, `.frota-guia__feitos` e o `.frota-guia__topo { flex-wrap: wrap; }` dentro do `@media (max-width: 560px)`. Antes, `rg -n "frota-guia__(topo|id|prazo|feitos)" apps/shell/src` deve achar só o CSS.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter shell exec vitest run src/pages/frota/components/ManutencaoPassoAPasso.test.tsx src/pages/frota/components/ManutencaoResumo.test.tsx && pnpm --filter shell typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.test.tsx apps/shell/src/pages/frota/frota.css
git commit -m "refactor(frota): guia da manutenção só com barra e passo

Prazo, grau, Mais ações e histórico saem do guia e vão para a gaveta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gaveta em blocos, sem rodapé

**Files:**
- Modify: `apps/shell/src/pages/frota/components/GavetaManutencao.tsx:1-20,158-166,196-205,251-281`
- Modify: `apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx:20-25,34-60,128-137,~270-294`

**Interfaces:**
- Consumes: `Bloco`, `CabecalhoManutencao`, `MaisAcoes`, `PedidoManutencao`, `HistoricoManutencao` (Task 1); `ManutencaoPassoAPasso` (Task 2); `avaliar` de `../domain/manutencaoEtapas`.
- Produces: `GavetaManutencao` com as mesmas props de hoje.

- [ ] **Step 1: Ajustar os testes primeiro**

Trocar `montar` para devolver o `rerender`:

```tsx
function montar(id: string, source: DataSource = createMockSource()) {
  const onChanged = vi.fn()
  const onClassificado = vi.fn()
  const arvore = (i: string) => <ToastProvider><GavetaManutencao source={source} id={i} hoje={hoje} onClose={() => {}} onChanged={onChanged} onClassificado={onClassificado} /></ToastProvider>
  const { rerender } = render(arvore(id))
  return { source, onChanged, onClassificado, trocarId: (i: string) => rerender(arvore(i)) }
}
```

Trocar o primeiro teste por:

```tsx
  it('abre com o pedido primeiro, o passo da etapa depois e sem rodapé', async () => {
    montar('m1')
    const g = await gaveta(M1)
    const pedido = within(g).getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('“Freio com ruído (fictício)”')).toBeTruthy()
    expect(within(pedido).getAllByRole('link', { name: /Fotos do pedido, arquivo/ })).toHaveLength(2)
    const passo = within(g).getByRole('region', { name: 'Próximo passo' })
    expect(within(passo).getByRole('heading', { name: 'Quando vai ser?' })).toBeTruthy()
    expect(pedido.compareDocumentPosition(passo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(g).queryByRole('button', { name: /Abrir formulário/ })).toBeNull()
    expect(within(g).queryByText(/Edição completa no formulário/)).toBeNull()
    expect(within(g).queryByText(/As alterações uma a uma/)).toBeNull()
  })
```

Trocar o segundo teste ("a linha do pedido traz o tipo…") por:

```tsx
  it('o card do pedido traz o tipo de reparo e o comentário ao motorista só quando existem', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => { const d = await original(i); return d && { ...d, comentarioAoMotorista: 'Levar cedo' } })
    montar('m1', source)
    const pedido = within(await gaveta(M1)).getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('Preventiva sistemática')).toBeTruthy()
    expect(within(pedido).getByText('Levar cedo')).toBeTruthy()
    cleanup()
    const semNada = createMockSource()
    const lido = semNada.detalheManutencao.bind(semNada)
    vi.spyOn(semNada, 'detalheManutencao').mockImplementation(async (i) => { const d = await lido(i); return d && { ...d, tipo: null } })
    montar('m1', semNada)
    const pedido2 = within(await gaveta(M1)).getByRole('region', { name: 'Pedido' })
    expect(within(pedido2).queryByText('Tipo de reparo')).toBeNull()
    expect(within(pedido2).queryByText('Comentário ao motorista')).toBeNull()
  })
```

Apagar o teste "Abrir formulário abre o formulário nativo e recarrega".

Acrescentar:

```tsx
  it('cabeçalho com status e histórico em linha do tempo', async () => {
    montar('m3')
    const g = await gaveta(M3)
    expect(within(g).getByText('Programado')).toBeTruthy()
    expect(within(within(g).getByRole('region', { name: 'Histórico' })).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
```

No último teste (respostas fora de ordem), trocar o gatilho "Abrir formulário" pela troca de `id` (m1 → m2 → m1); a resposta da leitura de m2 chega por último e deve ser ignorada:

```tsx
    const { trocarId } = montar('m1', source)
    await gaveta(M1)
    act(() => { trocarId('m2') })
    act(() => { trocarId('m1') })
    await waitFor(() => expect(pendentes).toHaveLength(2))
    await act(async () => { pendentes[1]('NOVO') }) // a leitura mais nova (m1) responde primeiro
    expect(await screen.findByRole('dialog', { name: 'TST1A11 · NOVO' })).toBeTruthy()
    await act(async () => { pendentes[0]('ANTIGO') }) // a de m2 chega tarde
    expect(screen.getByRole('dialog', { name: 'TST1A11 · NOVO' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /ANTIGO/ })).toBeNull()
```

Mantenha o `mockImplementation` que já existe no teste (1ª leitura direta, as seguintes esperam `pendentes`) e apague as linhas antigas `const abrir = …` e os dois cliques.

Os testes de foco ("Voltar devolve o foco ao \"Mais ações\"", com e sem StrictMode) e o helper `mais()` continuam iguais: o botão só muda de lugar dentro do mesmo dialog.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter shell exec vitest run src/pages/frota/components/GavetaManutencao.test.tsx`
Expected: FAIL nos testes novos (sem região "Pedido") e nos de foco/`mais()` (o "Mais ações" saiu do guia na Task 2).

- [ ] **Step 3: Implementar**

Imports: tirar `ExternalLink`, `NAO_INFORMADO` só se não sobrar uso (o `placa` usa; mantenha), `TIPO_REPARO`, `label`, `Arquivos`; acrescentar:

```tsx
import { avaliar, chavePasso, type Extra } from '../domain/manutencaoEtapas'
import { Bloco, CabecalhoManutencao, HistoricoManutencao, MaisAcoes, PedidoManutencao } from './ManutencaoResumo'
import { ManutencaoPassoAPasso } from './ManutencaoPassoAPasso'
```

Foco: o "Mais ações" agora fica nas `actions`, fora de `corpo`. Trocar o efeito (linhas 158-166) por:

```tsx
  // Foco: ao abrir uma exceção, no primeiro campo; ao voltar ao guia, no "Mais ações" (nas actions do Drawer).
  const corpo = useRef<HTMLDivElement>(null)
  const acoes = useRef<HTMLSpanElement>(null)
  const extraAnterior = useRef<Extra | null>(null)
  useEffect(() => {
    if (extra) corpo.current?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])')?.focus()
    else if (extraAnterior.current) acoes.current?.querySelector<HTMLElement>('[aria-label="Mais ações"]')?.focus()
    extraAnterior.current = extra
  }, [extra])
```

Apagar a função `abrirFormulario` (linhas 196-205).

Trocar o `return` final (linhas 251-281) por:

```tsx
  const placa = m.veiculo?.label || NAO_INFORMADO
  const situacao = avaliar(m, hoje)
  const tituloPasso = situacao.etapa === 'realizada' ? 'Resultado' : situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada' ? 'Encerrada' : 'Próximo passo'
  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      eyebrow={m.codigo ? `Manutenção ${m.codigo}` : 'Manutenção'}
      title={<span className="frota-gaveta__titulo">{placa} · {m.descricao || 'Manutenção'}</span>}
      actions={<>
        <span ref={acoes}>{extra ? null : <MaisAcoes situacao={situacao} onExtra={setExtra} />}</span>
        <BotaoAuditoria entity="cr40f_manutencoes" ids={[m.id]} name={m.descricao} />
      </>}
    >
      <div className="frota-gaveta-corpo" ref={corpo}>
        <CabecalhoManutencao m={m} situacao={situacao} />
        <PedidoManutencao m={m} onOpenVeiculo={onOpenVeiculo} />
        <Bloco titulo={tituloPasso} destaque>
          {formulario ?? <ManutencaoPassoAPasso source={source} m={m} hoje={hoje} onFeito={gravado} onDesatualizada={desatualizada} onExtra={setExtra} autoFoco={extraAnterior.current === null} />}
        </Bloco>
        <HistoricoManutencao situacao={situacao} />
      </div>
    </Drawer>
  )
```

O "⋯" some enquanto uma exceção está aberta, como hoje (o guia, que tinha o menu, era trocado pelo formulário). O `Bloco` do passo continua com `aria-labelledby`, então `getByRole('region', { name: 'Próximo passo' })` funciona.

Se a classe `.frota-drawer` (usada antes no corpo) tiver regra própria em `frota.css` que outras gavetas usam, não a apague; `rg -n "frota-drawer\b" apps/shell/src` decide.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter shell exec vitest run src/pages/frota && pnpm --filter shell typecheck`
Expected: PASS em toda a pasta `frota` e typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/components/GavetaManutencao.tsx apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx apps/shell/src/pages/frota/frota.css
git commit -m "feat(frota): drawer de manutenção em blocos, sem rodapé

Pedido em card no topo, passo atual em card destacado, histórico em linha
do tempo, chips e Mais ações no cabeçalho. Sai o botão Abrir formulário
e os textos de ajuda.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prova visual, qualidade e PR

**Files:**
- Modify (se preciso): `.claude/skills/verificar-shell/SKILL.md` ou a skill de frota que `verificacao-manter` apontar.

- [ ] **Step 1: Prints no mock**

Subir o vite em modo mock (`npx vite --port 36472 --strictPort` em `apps/shell`, com o `node_modules` do worktree instalado) e capturar, em 1440×900 e 390×844, `#/frota-manutencoes?registro=manutencao:m1`, `m2`, `m3` e `m4` (script `scratchpad/shots.mjs` da sessão, ou um novo com `playwright-core`). Copiar os PNGs para `~/.t3/userdata/attachments/` e mostrar no chat.

Esperado: cabeçalho com chips; card Pedido primeiro; card do passo com borda mais forte; Histórico no fim (m2, m3, m4); nenhum rodapé; sem rolagem horizontal em 390 px.

- [ ] **Step 2: `ux-audit` modo Rápido** no mock (m1 agendar, m3 "⋯" → Concluir por ele → Voltar com foco no "⋯", fechar clicando fora).

- [ ] **Step 3: Qualidade antes do PR**

Skill `qualidade-antes-do-pr` (passadas `/simplify` + `karpathy-coder`, `/code-review high --fix`), depois `verificacao-manter`. Commitar ajustes no mesmo branch.

- [ ] **Step 4: PR para a `develop`**

```bash
git push -u origin feat/drawer-manutencao-blocos
gh pr create --base develop --title "Drawer de manutenção em blocos" --body-file <arquivo com resumo, prints e "não verificado no DEV">
```

Merge só com o OK do Renan; o Deploy publica no DEV, e a conferência no DEV (OM-1241) vem depois.
