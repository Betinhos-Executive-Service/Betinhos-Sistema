# Gestão de documentos (Entrega 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documentos tipados com validade, arquivo e histórico para funcionários e frota: central `#/documentos`, checklist nas fichas, destinatários de aviso, schema provisionado no DEV e migração de CNH/ASO.

**Architecture:** Novo módulo `apps/shell/src/pages/documentos` no molde de Infrações (domain puro → data/source Dataverse|mock → hook → componentes `@betinhos/ui`). Arquivos no SharePoint pelos flows existentes, reaproveitando `createSharePointDocs` de Funcionários. Schema e migração por scripts PowerShell idempotentes no padrão de `apps/escala-fds/schema/provision-escala-fds.ps1`. Lembretes por e-mail (flows) ficam para o plano da Entrega 2.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom), `@betinhos/ui`, `@betinhos/dataverse`, PowerShell 5.1 + Web API do Dataverse.

**Spec:** `docs/superpowers/specs/2026-10-13-gestao-documentos-design.md`

## Global Constraints

- Design System: ler `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` antes de qualquer tarefa de UI; só tokens `var(--bt-…)`; nunca gradiente; tema só claro; `#FCFCFB` em listas/campos/buscas/cabeçalhos neutros; azul só para foco, seleção, status, ícones e ações. Resposta ao Renan sobre UI começa com `DESIGN CONTEXTO`.
- Textos de UI em pt-BR com acentos; datas `dd/mm/aaaa`; fuso America/Sao_Paulo (`todaySP()`).
- Choices (espelham o script de schema): categoria Pessoas `100000000` · Frota `100000001`; situação Vigente `100000000` · Substituído `100000001`; marco 60 `100000000` · 30 `100000001` · 7 `100000002` · Vencido `100000003`; obrigatório para Motorista `100000000` · Administrativo `100000001` · Próprio `100000002` · Terceiro `100000003` · Aluguel `100000004`.
- Existentes: `cr40f_funcionarios.cr40f_funcao` Motorista `202410000` · Administrativo `202410001`; `cr40f_status` Ativo `0` · Desligado `1` · Afastado `2`; `cr40f_veiculos.new_categoriadoveiculo` Próprio `100000000` · Terceiro `100000001` · Aluguel `100000002`; `cr40f_statusdoveiculo` Vendido `202410000` · Ativo `202410001` (terceiros podem vir `null` = ativo).
- Lookups novos: navegação `cr40f_Tipo`, `cr40f_Funcionario`, `cr40f_Veiculo` (documento) e `cr40f_Funcionario` (destinatário); `$select` de lookup é sempre `_x_value`.
- Arquivos: PDF, JPG, PNG; até 10 MB (`DOC_MAX_BYTES`); pasta `<Funcionarios|Veiculos>/[DEV/]<id>/Documentos/<codigo>`.
- Drawers: clicar fora/X/Esc fecha; com alteração não salva abre "Descartar alterações?" (Continuar editando | Descartar); durante salvamento não fecha.
- PROD só leitura. Scripts rodam no DEV, exigem `.env` na raiz do monorepo e login do Renan (device code); o Claude não copia `.env`.
- Testes: `pnpm --filter @betinhos/shell test -- <arquivo>`; tipos: `pnpm typecheck`. Testes de componente usam `// @vitest-environment jsdom`, `configure({ asyncUtilTimeout: 8000 })` e stub de `matchMedia` como em `pages/infracoes/InfracoesPage.test.tsx`.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
apps/shell/src/pages/documentos/
  domain/codes.ts          choices e mapeamentos de código ↔ domínio
  domain/types.ts          tipos do módulo
  domain/vencimento.ts     marcoDe, statusDe, validadeSugerida, rotuloPrazo, JANELA_DIAS
  domain/pendencias.ts     indexarVigentes, montarPendencias, contarKpis, montarChecklist, filtrarPendencias
  domain/nomes.ts          pasta, nome do registro e do arquivo
  domain/query.ts          codec da URL da central
  domain/*.test.ts
  data/queries.ts          paths OData, mappers e payloads
  data/salvar.ts           orquestração de salvar/renovar (criar → enviar → substituir → dual-write)
  data/mock.ts             dados de exemplo relativos a hoje
  data/source.ts           DocsSource: mock | Dataverse
  data/*.test.ts
  useDocumentos.ts         carga com token anti-corrida
  components/StatusDoc.tsx       badge de estado
  components/RenovarDrawer.tsx   adicionar/renovar documento
  components/Checklist.tsx       checklist por dono (fichas)
  components/PendenciasLista.tsx tabela/cartões da central
  components/ConfigDrawer.tsx    tipos e destinatários
  components/*.test.tsx
  DocumentosPage.tsx + DocumentosPage.test.tsx + documentos.css
apps/shell/src/app/useDocumentosBadge.ts   contador da sidebar
packages/deploy/provision-documentos.ps1   schema + seed dos tipos
packages/deploy/migrar-documentos.ps1      CNH/ASO existentes → cr40f_documento
```

Modificados: `pages/funcionarios/data/sharepoint.ts` (+ teste), `pages/funcionarios/FuncionariosPage.tsx`, `pages/funcionarios/components/Ficha.tsx`, `pages/funcionarios/data/alerts.ts`, `pages/frota/FrotaPage.tsx`, `pages/frota/components/FichaVeiculo.tsx`, `pages/dashboard/domain/alertas.ts` (+ teste), `nav/menu.ts`, `app/RouteLayout.tsx`, `app/AppShell.tsx`, `App.tsx`.

---

### Task 1: Domínio — códigos, tipos e vencimento

**Files:**
- Create: `apps/shell/src/pages/documentos/domain/codes.ts`, `domain/types.ts`, `domain/vencimento.ts`
- Test: `apps/shell/src/pages/documentos/domain/vencimento.test.ts`

**Interfaces:**
- Produces: `CATEGORIA_CODE`, `categoriaDe(code)`, `SITUACAO_CODE`, `MARCO_CODE`, `marcoDoCodigo(code)`, `OBRIG`, `obrigDeFuncao(funcao)`, `obrigDeCategoriaVeiculo(cat)`, `FUNC_DESLIGADO`, `VEICULO_VENDIDO`; tipos `Categoria`, `Marco`, `Status`, `Situacao`, `TipoDoc`, `Dono`, `DocEmitido`, `Destinatario`, `DocsData`, `Arquivo`, `Pendencia`, `Kpi`, `ItemChecklist`, `EstadoItem`; `JANELA_DIAS`, `marcoDe(dias)`, `statusDe(validade, hoje, temValidade)`, `validadeSugerida(tipo, emissao)`, `rotuloPrazo(dias)`.

- [ ] **Step 1: Escrever `codes.ts` e `types.ts`**

```ts
// domain/codes.ts
import type { Categoria, Marco } from './types'

export const CATEGORIA_CODE: Record<Categoria, number> = { pessoas: 100000000, frota: 100000001 }
export const categoriaDe = (code: unknown): Categoria | null => (code === 100000000 ? 'pessoas' : code === 100000001 ? 'frota' : null)

export const SITUACAO_CODE = { vigente: 100000000, substituido: 100000001 } as const

export const MARCO_CODE: Record<Marco, number> = { '60': 100000000, '30': 100000001, '7': 100000002, vencido: 100000003 }
export const marcoDoCodigo = (code: unknown): Marco | null =>
  (Object.entries(MARCO_CODE).find(([, v]) => v === code)?.[0] as Marco | undefined) ?? null

/** Valores de `cr40f_obrigatoriopara` (multi-choice). */
export const OBRIG = { motorista: 100000000, administrativo: 100000001, proprio: 100000002, terceiro: 100000003, aluguel: 100000004 } as const
export const OBRIG_LABEL: Record<number, string> = {
  100000000: 'Motorista', 100000001: 'Administrativo', 100000002: 'Próprio', 100000003: 'Terceiro', 100000004: 'Aluguel',
}
export const OBRIG_DA_CATEGORIA: Record<Categoria, number[]> = {
  pessoas: [OBRIG.motorista, OBRIG.administrativo],
  frota: [OBRIG.proprio, OBRIG.terceiro, OBRIG.aluguel],
}

const FUNCAO: Record<number, number> = { 202410000: OBRIG.motorista, 202410001: OBRIG.administrativo }
const CATEGORIA_VEICULO: Record<number, number> = { 100000000: OBRIG.proprio, 100000001: OBRIG.terceiro, 100000002: OBRIG.aluguel }
export const obrigDeFuncao = (funcao: unknown) => (typeof funcao === 'number' ? FUNCAO[funcao] ?? null : null)
export const obrigDeCategoriaVeiculo = (categoria: unknown) => (typeof categoria === 'number' ? CATEGORIA_VEICULO[categoria] ?? null : null)

export const FUNC_DESLIGADO = 1
export const VEICULO_VENDIDO = 202410000
```

```ts
// domain/types.ts
import type { Documento } from '../../funcionarios/data/types'

/** Arquivo no SharePoint (mesmo formato da aba de documentos de Funcionários). */
export type Arquivo = Documento
export type Categoria = 'pessoas' | 'frota'
export type Marco = '60' | '30' | '7' | 'vencido'
export type Status = 'vencido' | 'vence7' | 'vence30' | 'vence60' | 'ok' | 'semValidade'
export type Situacao = 'vigente' | 'substituido'

export type TipoDoc = {
  id: string
  codigo: string
  nome: string
  categoria: Categoria
  temValidade: boolean
  validadePadraoMeses: number | null
  obrigatorioPara: number[]
  ordem: number
  ativo: boolean
}

/** Funcionário ou veículo dono de documentos. `obrigKey` é o valor de `OBRIG` que vale para ele. */
export type Dono = { id: string; categoria: Categoria; nome: string; detalhe: string; obrigKey: number | null; ativo: boolean; email: string }

export type DocEmitido = {
  id: string
  tipoId: string
  donoId: string
  categoria: Categoria
  numero: string
  emissao: string | null
  validade: string | null
  situacao: Situacao
  pasta: string
  observacao: string
  ultimoMarco: Marco | null
  modificadoEm: string | null
}

export type Destinatario = { id: string; categoria: Categoria; funcionarioId: string; nome: string }
export type DocsData = { tipos: TipoDoc[]; donos: Dono[]; docs: DocEmitido[]; destinatarios: Destinatario[] }

export type Kpi = 'vencido' | 'vence7' | 'vence30' | 'vence60' | 'faltando'
export type Pendencia = { chave: string; dono: Dono; tipo: TipoDoc; doc: DocEmitido | null; estado: Kpi; dias: number | null }
export type EstadoItem = Status | 'faltando' | 'opcional'
export type ItemChecklist = { tipo: TipoDoc; vigente: DocEmitido | null; historico: DocEmitido[]; estado: EstadoItem; dias: number | null }
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// domain/vencimento.test.ts
import { describe, expect, it } from 'vitest'
import { JANELA_DIAS, marcoDe, rotuloPrazo, statusDe, validadeSugerida } from './vencimento'

describe('vencimento', () => {
  it('marcos nos limites', () => {
    expect(marcoDe(-1)).toBe('vencido')
    expect(marcoDe(0)).toBe('7')
    expect(marcoDe(7)).toBe('7')
    expect(marcoDe(8)).toBe('30')
    expect(marcoDe(30)).toBe('30')
    expect(marcoDe(31)).toBe('60')
    expect(marcoDe(60)).toBe('60')
    expect(marcoDe(61)).toBeNull()
    expect(JANELA_DIAS).toBe(60)
  })

  it('status a partir da validade', () => {
    expect(statusDe('2026-10-12', '2026-10-13', true)).toEqual({ status: 'vencido', dias: -1 })
    expect(statusDe('2026-10-20', '2026-10-13', true)).toEqual({ status: 'vence7', dias: 7 })
    expect(statusDe('2026-11-12', '2026-10-13', true)).toEqual({ status: 'vence30', dias: 30 })
    expect(statusDe('2026-12-12', '2026-10-13', true)).toEqual({ status: 'vence60', dias: 60 })
    expect(statusDe('2027-10-13', '2026-10-13', true)).toEqual({ status: 'ok', dias: 365 })
    expect(statusDe(null, '2026-10-13', false)).toEqual({ status: 'semValidade', dias: null })
    expect(statusDe('2026-10-12', '2026-10-13', false)).toEqual({ status: 'semValidade', dias: null })
  })

  it('validade sugerida pela emissão', () => {
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: 12 }, '2026-02-28')).toBe('2027-02-28')
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: null }, '2026-01-10')).toBeNull()
    expect(validadeSugerida({ temValidade: false, validadePadraoMeses: 12 }, '2026-01-10')).toBeNull()
    expect(validadeSugerida({ temValidade: true, validadePadraoMeses: 12 }, null)).toBeNull()
  })

  it('rótulo do prazo', () => {
    expect(rotuloPrazo(-1)).toBe('vencido há 1 dia')
    expect(rotuloPrazo(-12)).toBe('vencido há 12 dias')
    expect(rotuloPrazo(0)).toBe('vence hoje')
    expect(rotuloPrazo(1)).toBe('vence em 1 dia')
    expect(rotuloPrazo(45)).toBe('vence em 45 dias')
    expect(rotuloPrazo(null)).toBe('')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/vencimento.test.ts`
Expected: FAIL — `Failed to resolve import "./vencimento"`.

- [ ] **Step 4: Implementar `vencimento.ts`**

```ts
// domain/vencimento.ts
import { addMonths, daysBetween } from '../../funcionarios/data/dates'
import type { Marco, Status, TipoDoc } from './types'

/** Maior antecedência de aviso (dias). Também vale para os alertas de Funcionários e o card de CNH do Dashboard. */
export const JANELA_DIAS = 60

/** Marco de aviso: vencido (< 0), 7 (0–7), 30 (8–30), 60 (31–60); acima disso nenhum. */
export function marcoDe(dias: number): Marco | null {
  if (dias < 0) return 'vencido'
  if (dias <= 7) return '7'
  if (dias <= 30) return '30'
  if (dias <= JANELA_DIAS) return '60'
  return null
}

const STATUS_DO_MARCO: Record<Marco, Status> = { vencido: 'vencido', '7': 'vence7', '30': 'vence30', '60': 'vence60' }

export function statusDe(validade: string | null, hoje: string, temValidade: boolean): { status: Status; dias: number | null } {
  if (!temValidade || !validade) return { status: 'semValidade', dias: null }
  const dias = daysBetween(hoje, validade)
  const marco = marcoDe(dias)
  return { status: marco ? STATUS_DO_MARCO[marco] : 'ok', dias }
}

export function validadeSugerida(tipo: Pick<TipoDoc, 'temValidade' | 'validadePadraoMeses'>, emissao: string | null) {
  return tipo.temValidade && tipo.validadePadraoMeses && emissao ? addMonths(emissao, tipo.validadePadraoMeses) : null
}

export function rotuloPrazo(dias: number | null) {
  if (dias == null) return ''
  if (dias < 0) return `vencido há ${-dias} dia${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'vence hoje'
  return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/vencimento.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/documentos/domain
git commit -m "feat(documentos): códigos, tipos e regra de vencimento (60/30/7/vencido)"
```

---

### Task 2: Domínio — pendências, KPIs, checklist e filtro

**Files:**
- Create: `apps/shell/src/pages/documentos/domain/pendencias.ts`
- Test: `apps/shell/src/pages/documentos/domain/pendencias.test.ts`

**Interfaces:**
- Consumes: Task 1 (`statusDe`, tipos).
- Produces: `chaveDonoTipo(donoId, tipoId)`, `isObrigatorio(tipo, dono)`, `indexarVigentes(docs): Map<string, DocEmitido>`, `montarPendencias(tipos, donos, docs, hoje): Pendencia[]`, `KPIS: Kpi[]`, `contarKpis(pendencias): Record<Kpi, number>`, `urgentes(contagem): number`, `montarChecklist(dono, tipos, docs, hoje): ItemChecklist[]`, `type FiltroCentral = { aba: Categoria; kpi: Kpi | null; tipo: string | null; q: string }`, `filtrarPendencias(lista, filtro)`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// domain/pendencias.test.ts
import { describe, expect, it } from 'vitest'
import { contarKpis, filtrarPendencias, indexarVigentes, montarChecklist, montarPendencias, urgentes } from './pendencias'
import type { DocEmitido, Dono, TipoDoc } from './types'

const HOJE = '2026-10-13'
const tipo = (over: Partial<TipoDoc>): TipoDoc => ({ id: 't', codigo: 'X', nome: 'X', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [], ordem: 0, ativo: true, ...over })
const dono = (over: Partial<Dono>): Dono => ({ id: 'd', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: '', ...over })
const doc = (over: Partial<DocEmitido>): DocEmitido => ({ id: 'x', tipoId: 't', donoId: 'd', categoria: 'pessoas', numero: '', emissao: null, validade: null, situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: null, modificadoEm: null, ...over })

const CNH = tipo({ id: 'cnh', codigo: 'CNH', nome: 'CNH', obrigatorioPara: [100000000], ordem: 1 })
const ASO = tipo({ id: 'aso', codigo: 'ASO', nome: 'ASO', obrigatorioPara: [100000000, 100000001], ordem: 2, validadePadraoMeses: 12 })
const RG = tipo({ id: 'rg', codigo: 'RG', nome: 'RG', temValidade: false, obrigatorioPara: [100000000], ordem: 3 })
const CRLV = tipo({ id: 'crlv', codigo: 'CRLV', nome: 'CRLV', categoria: 'frota', obrigatorioPara: [100000002], ordem: 1 })

describe('pendências', () => {
  it('vigente mais recente vence empate de dois vigentes', () => {
    const map = indexarVigentes([doc({ id: 'a', validade: '2026-01-01' }), doc({ id: 'b', validade: '2027-01-01' }), doc({ id: 'c', validade: '2028-01-01', situacao: 'substituido' })])
    expect(map.get('d|t')?.id).toBe('b')
  })

  it('lista vencidos, vencendo e faltantes; ignora desligado, ok e não obrigatório', () => {
    const ana = dono({ id: 'ana', nome: 'Ana' })
    const bia = dono({ id: 'bia', nome: 'Bia', obrigKey: 100000001, detalhe: 'Administrativo' })
    const caio = dono({ id: 'caio', nome: 'Caio', ativo: false })
    const carro = dono({ id: 'car', categoria: 'frota', nome: 'ABC1D23', obrigKey: 100000002 })
    const docs = [
      doc({ id: 'cnh-ana', tipoId: 'cnh', donoId: 'ana', validade: '2026-10-10' }),
      doc({ id: 'aso-ana', tipoId: 'aso', donoId: 'ana', validade: '2026-11-20' }),
      doc({ id: 'aso-bia', tipoId: 'aso', donoId: 'bia', validade: '2027-06-01' }),
      doc({ id: 'crlv-car', tipoId: 'crlv', donoId: 'car', categoria: 'frota', validade: '2026-10-18' }),
    ]
    const lista = montarPendencias([CNH, ASO, RG, CRLV], [ana, bia, caio, carro], docs, HOJE)
    expect(lista.map((p) => `${p.dono.id}:${p.tipo.codigo}:${p.estado}`)).toEqual([
      'ana:CNH:vencido',
      'car:CRLV:vence7',
      'ana:RG:faltando',
      'ana:ASO:vence60',
    ])
    expect(contarKpis(lista)).toEqual({ vencido: 1, vence7: 1, vence30: 0, vence60: 1, faltando: 1 })
    expect(urgentes(contarKpis(lista))).toBe(2)
  })

  it('checklist da ficha: ordem do tipo, vigente, histórico e opcional', () => {
    const ana = dono({ id: 'ana', obrigKey: 100000001 })
    const docs = [
      doc({ id: 'aso-1', tipoId: 'aso', donoId: 'ana', validade: '2025-10-01', situacao: 'substituido' }),
      doc({ id: 'aso-2', tipoId: 'aso', donoId: 'ana', validade: '2026-10-25' }),
    ]
    const itens = montarChecklist(ana, [RG, ASO, CNH, CRLV], docs, HOJE)
    expect(itens.map((i) => `${i.tipo.codigo}:${i.estado}`)).toEqual(['CNH:opcional', 'ASO:vence30', 'RG:opcional'])
    expect(itens[1].vigente?.id).toBe('aso-2')
    expect(itens[1].historico.map((d) => d.id)).toEqual(['aso-1'])
  })

  it('filtro por aba, KPI, tipo e busca sem acento', () => {
    const ana = dono({ id: 'ana', nome: 'Ana Júlia' })
    const lista = montarPendencias([CNH, RG], [ana], [doc({ tipoId: 'cnh', donoId: 'ana', validade: '2026-10-01' })], HOJE)
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: null, tipo: null, q: 'julia' })).toHaveLength(2)
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: 'faltando', tipo: null, q: '' }).map((p) => p.tipo.codigo)).toEqual(['RG'])
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: null, tipo: 'cnh', q: '' })).toHaveLength(1)
    expect(filtrarPendencias(lista, { aba: 'frota', kpi: null, tipo: null, q: '' })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/pendencias.test.ts`
Expected: FAIL — `Failed to resolve import "./pendencias"`.

- [ ] **Step 3: Implementar `pendencias.ts`**

```ts
// domain/pendencias.ts
import { normalizeSearch } from '@betinhos/ui'
import { statusDe } from './vencimento'
import type { Categoria, DocEmitido, Dono, ItemChecklist, Kpi, Pendencia, TipoDoc } from './types'

export const chaveDonoTipo = (donoId: string, tipoId: string) => `${donoId}|${tipoId}`
export const isObrigatorio = (tipo: TipoDoc, dono: Dono) => dono.obrigKey != null && tipo.obrigatorioPara.includes(dono.obrigKey)

const maisRecente = (a: DocEmitido, b: DocEmitido) =>
  String(b.validade ?? b.emissao ?? '').localeCompare(String(a.validade ?? a.emissao ?? ''))
  || String(b.modificadoEm ?? '').localeCompare(String(a.modificadoEm ?? ''))

/** Vigente por dono+tipo. Dois vigentes só acontecem se uma renovação falhou no meio: vale o mais recente. */
export function indexarVigentes(docs: DocEmitido[]) {
  const map = new Map<string, DocEmitido>()
  for (const d of docs.filter((x) => x.situacao === 'vigente').sort(maisRecente)) {
    const chave = chaveDonoTipo(d.donoId, d.tipoId)
    if (!map.has(chave)) map.set(chave, d)
  }
  return map
}

const ORDEM: Record<Kpi, number> = { vencido: 0, vence7: 1, faltando: 2, vence30: 3, vence60: 4 }
const EM_ALERTA = new Set<string>(['vencido', 'vence7', 'vence30', 'vence60'])
const porOrdem = (a: TipoDoc, b: TipoDoc) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')

/** Tudo que precisa de ação, do mais urgente ao menos: vencidos, até 7 dias, faltantes, 8–30, 31–60. */
export function montarPendencias(tipos: TipoDoc[], donos: Dono[], docs: DocEmitido[], hoje: string): Pendencia[] {
  const vigentes = indexarVigentes(docs)
  const lista: Pendencia[] = []
  for (const dono of donos) {
    if (!dono.ativo) continue
    for (const tipo of tipos) {
      if (!tipo.ativo || tipo.categoria !== dono.categoria) continue
      const doc = vigentes.get(chaveDonoTipo(dono.id, tipo.id)) ?? null
      if (!doc) {
        if (isObrigatorio(tipo, dono)) lista.push({ chave: chaveDonoTipo(dono.id, tipo.id), dono, tipo, doc: null, estado: 'faltando', dias: null })
        continue
      }
      const { status, dias } = statusDe(doc.validade, hoje, tipo.temValidade)
      if (EM_ALERTA.has(status)) lista.push({ chave: doc.id, dono, tipo, doc, estado: status as Kpi, dias })
    }
  }
  return lista.sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado] || (a.dias ?? 0) - (b.dias ?? 0) || a.dono.nome.localeCompare(b.dono.nome, 'pt-BR') || porOrdem(a.tipo, b.tipo))
}

export const KPIS: Kpi[] = ['vencido', 'vence7', 'vence30', 'vence60', 'faltando']

export function contarKpis(pendencias: Pendencia[]): Record<Kpi, number> {
  const contagem: Record<Kpi, number> = { vencido: 0, vence7: 0, vence30: 0, vence60: 0, faltando: 0 }
  for (const p of pendencias) contagem[p.estado] += 1
  return contagem
}

/** Número do badge da sidebar. */
export const urgentes = (contagem: Record<Kpi, number>) => contagem.vencido + contagem.vence7

export function montarChecklist(dono: Dono, tipos: TipoDoc[], docs: DocEmitido[], hoje: string): ItemChecklist[] {
  const meus = docs.filter((d) => d.donoId === dono.id)
  return tipos.filter((t) => t.ativo && t.categoria === dono.categoria).sort(porOrdem).map((tipo) => {
    const doTipo = meus.filter((d) => d.tipoId === tipo.id).sort(maisRecente)
    const vigente = doTipo.find((d) => d.situacao === 'vigente') ?? null
    const historico = doTipo.filter((d) => d !== vigente)
    if (!vigente) return { tipo, vigente, historico, estado: isObrigatorio(tipo, dono) ? 'faltando' : 'opcional', dias: null }
    const { status, dias } = statusDe(vigente.validade, hoje, tipo.temValidade)
    return { tipo, vigente, historico, estado: status, dias }
  })
}

export type FiltroCentral = { aba: Categoria; kpi: Kpi | null; tipo: string | null; q: string }

export function filtrarPendencias(lista: Pendencia[], filtro: FiltroCentral) {
  const termo = normalizeSearch(filtro.q)
  return lista.filter((p) => p.dono.categoria === filtro.aba
    && (!filtro.kpi || p.estado === filtro.kpi)
    && (!filtro.tipo || p.tipo.id === filtro.tipo)
    && (!termo || normalizeSearch(`${p.dono.nome} ${p.dono.detalhe} ${p.tipo.nome}`).includes(termo)))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/pendencias.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/documentos/domain
git commit -m "feat(documentos): pendências, KPIs, checklist por dono e filtro da central"
```

---

### Task 3: Domínio — nomes/pastas e URL da central

**Files:**
- Create: `apps/shell/src/pages/documentos/domain/nomes.ts`, `domain/query.ts`
- Test: `apps/shell/src/pages/documentos/domain/nomes.test.ts`

**Interfaces:**
- Consumes: `pastaFuncionario`, `sanitizeFileName` de `pages/funcionarios/data/sharepoint.ts`; `KPIS`, `FiltroCentral` (Task 2).
- Produces: `RAIZ: Record<Categoria, string>`, `subpastaDoc(codigo)`, `pastaDoc(categoria, donoId, codigo, envLabel)`, `nomeDocumento(tipo, dono)`, `nomeArquivo(codigo, data, original)`, `FILTRO_PADRAO`, `documentosQuery: QueryCodec<FiltroCentral>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// domain/nomes.test.ts
import { describe, expect, it } from 'vitest'
import { nomeArquivo, nomeDocumento, pastaDoc, subpastaDoc } from './nomes'
import { documentosQuery } from './query'

describe('nomes e pastas', () => {
  it('pasta por categoria, separando DEV', () => {
    expect(subpastaDoc('CNH')).toBe('Documentos/CNH')
    expect(pastaDoc('pessoas', 'abc', 'CNH', 'DEV')).toBe('Funcionarios/DEV/abc/Documentos/CNH')
    expect(pastaDoc('frota', 'xyz', 'IPVA', 'PROD')).toBe('Veiculos/xyz/Documentos/IPVA')
  })

  it('nome do registro e do arquivo', () => {
    expect(nomeDocumento({ nome: 'CNH' }, { nome: 'Ana' })).toBe('CNH · Ana')
    expect(nomeArquivo('CNH', '2031-05-10', 'frente/verso.pdf')).toBe('CNH_2031-05-10_frente_verso.pdf')
    expect(nomeArquivo('RG', null, 'rg.jpg')).toBe('RG_sem-data_rg.jpg')
  })
})

describe('URL da central', () => {
  it('lê e grava com padrões fora da URL', () => {
    const q = new URLSearchParams('aba=frota&kpi=vencido&tipo=t1&q=abc')
    expect(documentosQuery.ler(q)).toEqual({ aba: 'frota', kpi: 'vencido', tipo: 't1', q: 'abc' })
    expect(documentosQuery.ler(new URLSearchParams('aba=xx&kpi=yy'))).toEqual({ aba: 'pessoas', kpi: null, tipo: null, q: '' })
    expect(documentosQuery.gravar({ aba: 'pessoas', kpi: null, tipo: null, q: '' })).toEqual({ aba: null, kpi: null, tipo: null, q: null })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/nomes.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

```ts
// domain/nomes.ts
import { pastaFuncionario, sanitizeFileName } from '../../funcionarios/data/sharepoint'
import type { Categoria, Dono, TipoDoc } from './types'

/** Pasta-raiz de cada categoria na biblioteca do SharePoint (Funcionarios já existe; Veiculos já guarda as fotos). */
export const RAIZ: Record<Categoria, string> = { pessoas: 'Funcionarios', frota: 'Veiculos' }

export const subpastaDoc = (codigo: string) => `Documentos/${codigo}`
export const pastaDoc = (categoria: Categoria, donoId: string, codigo: string, envLabel: string) =>
  `${pastaFuncionario(donoId, envLabel, RAIZ[categoria])}/${subpastaDoc(codigo)}`

export const nomeDocumento = (tipo: Pick<TipoDoc, 'nome'>, dono: Pick<Dono, 'nome'>) => `${tipo.nome} · ${dono.nome}`.slice(0, 850)

/** `CNH_2031-05-10_frente.pdf`: a data é a validade (ou a emissão, sem validade). */
export const nomeArquivo = (codigo: string, data: string | null, original: string) => sanitizeFileName(`${codigo}_${data ?? 'sem-data'}_${original}`)
```

```ts
// domain/query.ts
import { gravarTexto, lerOpcao, type QueryCodec } from '../../../nav/queryState'
import { KPIS, type FiltroCentral } from './pendencias'
import type { Categoria } from './types'

const ABAS: readonly Categoria[] = ['pessoas', 'frota']
export const FILTRO_PADRAO: FiltroCentral = { aba: 'pessoas', kpi: null, tipo: null, q: '' }

/** Estado da central na URL: `#/documentos?aba=frota&kpi=vencido&tipo=<id>&q=abc`. */
export const documentosQuery: QueryCodec<FiltroCentral> = {
  chaves: ['aba', 'kpi', 'tipo', 'q'],
  ler: (q) => ({
    aba: lerOpcao(q, 'aba', ABAS, 'pessoas'),
    kpi: KPIS.find((k) => k === q.get('kpi')) ?? null,
    tipo: q.get('tipo') || null,
    q: q.get('q') ?? '',
  }),
  gravar: (f) => ({ aba: gravarTexto(f.aba, 'pessoas'), kpi: f.kpi, tipo: f.tipo, q: gravarTexto(f.q) }),
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/domain/nomes.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/documentos/domain
git commit -m "feat(documentos): pastas do SharePoint, nomes de arquivo e estado da central na URL"
```

---

### Task 4: Dados — SharePoint com subpasta, paths OData, mappers e payloads

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/data/sharepoint.ts` (método `listar`)
- Modify: `apps/shell/src/pages/funcionarios/data/sharepoint.test.ts`
- Create: `apps/shell/src/pages/documentos/data/queries.ts`
- Test: `apps/shell/src/pages/documentos/data/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 (codes, types); `parseMulti` de `pages/infracoes/data/queries.ts`; `toDateOnly` de `pages/funcionarios/data/dates.ts`; `formatted`, `cleanId` de `@betinhos/dataverse`.
- Produces: `listar(id, subpasta?)` no retorno de `createSharePointDocs`; `ENTITIES`, `NAV`, `type EntitySets`, `tiposPath`, `documentosPath`, `destinatariosPath`, `funcionariosPath`, `veiculosPath`, `mapTipo`, `mapDoc`, `mapDestinatario`, `mapFuncionarioDono`, `mapVeiculoDono`, `docPayload(input, sets)`, `tipoPayload(tipo)`, `destinatarioPayload(categoria, funcionarioId, nome, sets)`, `type NovoDoc`, `type TipoInput`.

- [ ] **Step 1: Teste do `listar` com subpasta (falha)**

Acrescentar ao fim de `pages/funcionarios/data/sharepoint.test.ts`:

```ts
describe('createSharePointDocs.listar', () => {
  it('lista uma subpasta do dono', async () => {
    const api = {
      retrieveMultipleRecords: vi.fn(async (entity: string) => entity === 'environmentvariabledefinition'
        ? { entities: [{ environmentvariabledefinitionid: 'def', defaultvalue: 'https://flow/listar' }] }
        : { entities: [] }),
    }
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ sucesso: true, arquivos: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const docs = createSharePointDocs(api as never, 'DEV', 'Veiculos')
    await docs.listar('v1', 'Documentos/CRLV')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ caminhoCompleto: 'Veiculos/DEV/v1/Documentos/CRLV' })
  })
})
```

E incluir `createSharePointDocs` no import do topo: `import { callFlow, createSharePointDocs, pastaFuncionario, sanitizeFileName, uniqueName } from './sharepoint'`.

Run: `pnpm --filter @betinhos/shell test -- src/pages/funcionarios/data/sharepoint.test.ts`
Expected: FAIL — `caminhoCompleto` vem `Veiculos/DEV/v1` (sem subpasta).

- [ ] **Step 2: Implementar `subpasta` em `listar`**

Em `pages/funcionarios/data/sharepoint.ts`, substituir o método `listar`:

```ts
    async listar(id: string, subpasta?: string): Promise<Documento[]> {
      const pasta = pastaFuncionario(id, envLabel, root)
      const result = await callFlow(await flowUrl('listar'), { caminhoCompleto: subpasta ? `${pasta}/${subpasta}` : pasta })
      const itens = Array.isArray(result.arquivos) ? (result.arquivos as Record<string, unknown>[]) : []
      return itens.map(toDocumento).sort((a, b) => String(b.modificadoEm).localeCompare(String(a.modificadoEm)))
    },
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/funcionarios/data/sharepoint.test.ts src/pages/curriculos`
Expected: PASS (chamadas antigas sem `subpasta` continuam iguais).

- [ ] **Step 3: Teste dos mappers e payloads (falha)**

```ts
// data/queries.test.ts
import { describe, expect, it } from 'vitest'
import { docPayload, mapDoc, mapFuncionarioDono, mapTipo, mapVeiculoDono, tipoPayload } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = { tipo: 'cr40f_tipodocumentos', documento: 'cr40f_documentos', destinatario: 'cr40f_avisodestinatarios', funcionario: 'cr40f_funcionarioses', veiculo: 'cr40f_veiculoses' }

describe('queries de documentos', () => {
  it('mapeia tipo com multi-choice', () => {
    expect(mapTipo({ cr40f_tipodocumentoid: '{AA}', cr40f_codigo: 'ASO', cr40f_name: 'ASO', cr40f_categoria: 100000000, cr40f_temvalidade: true, cr40f_validadepadraomeses: 12, cr40f_obrigatoriopara: '100000001,100000000', cr40f_ordem: 2, statecode: 0 }))
      .toEqual({ id: 'aa', codigo: 'ASO', nome: 'ASO', categoria: 'pessoas', temValidade: true, validadePadraoMeses: 12, obrigatorioPara: [100000000, 100000001], ordem: 2, ativo: true })
  })

  it('mapeia documento de veículo', () => {
    expect(mapDoc({ cr40f_documentoid: 'D1', _cr40f_tipo_value: 'T1', _cr40f_funcionario_value: null, _cr40f_veiculo_value: 'V1', cr40f_numero: '123', cr40f_emissao: '2026-01-10', cr40f_validade: '2027-01-10', cr40f_situacao: 100000000, cr40f_pasta: 'Veiculos/v1/Documentos/CRLV', cr40f_observacao: null, cr40f_ultimomarcoavisado: 100000001, modifiedon: '2026-10-01T10:00:00Z' }))
      .toEqual({ id: 'd1', tipoId: 't1', donoId: 'v1', categoria: 'frota', numero: '123', emissao: '2026-01-10', validade: '2027-01-10', situacao: 'vigente', pasta: 'Veiculos/v1/Documentos/CRLV', observacao: '', ultimoMarco: '30', modificadoEm: '2026-10-01T10:00:00Z' })
  })

  it('mapeia donos', () => {
    expect(mapFuncionarioDono({ cr40f_funcionariosid: 'F1', new_apelido: 'Ana', cr40f_nomecompleto: 'Ana Souza', cr40f_funcao: 202410000, [`cr40f_funcao${F}`]: 'Motorista', cr40f_status: 2, cr40f_emailbetinhos: 'ana@x' }))
      .toEqual({ id: 'f1', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: 'ana@x' })
    expect(mapFuncionarioDono({ cr40f_funcionariosid: 'F2', new_apelido: '', cr40f_nomecompleto: 'Caio', cr40f_funcao: 202410001, cr40f_status: 1 }).ativo).toBe(false)
    expect(mapVeiculoDono({ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_marca: 'Toyota', cr40f_modelo: 'Corolla', new_categoriadoveiculo: 100000001, cr40f_statusdoveiculo: null }))
      .toEqual({ id: 'v1', categoria: 'frota', nome: 'ABC1D23', detalhe: 'Toyota Corolla', obrigKey: 100000003, ativo: true, email: '' })
    expect(mapVeiculoDono({ cr40f_veiculosid: 'V2', cr40f_placa: 'X', cr40f_statusdoveiculo: 202410000 }).ativo).toBe(false)
  })

  it('payload do documento com binds e sem campos vazios', () => {
    expect(docPayload({ nome: 'CRLV · ABC', tipoId: 't1', categoria: 'frota', donoId: 'v1', numero: '', emissao: null, validade: '2027-01-10', pasta: 'p', observacao: '' }, SETS)).toEqual({
      cr40f_name: 'CRLV · ABC', cr40f_numero: null, cr40f_emissao: null, cr40f_validade: '2027-01-10', cr40f_situacao: 100000000, cr40f_pasta: 'p', cr40f_observacao: null,
      'cr40f_Tipo@odata.bind': '/cr40f_tipodocumentos(t1)', 'cr40f_Veiculo@odata.bind': '/cr40f_veiculoses(v1)',
    })
  })

  it('payload do tipo', () => {
    expect(tipoPayload({ codigo: 'cnh ', nome: 'CNH', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [100000001, 100000000], ordem: 1 }))
      .toEqual({ cr40f_codigo: 'CNH', cr40f_name: 'CNH', cr40f_categoria: 100000000, cr40f_temvalidade: true, cr40f_validadepadraomeses: null, cr40f_obrigatoriopara: '100000000,100000001', cr40f_ordem: 1 })
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data/queries.test.ts`
Expected: FAIL — `Failed to resolve import "./queries"`.

- [ ] **Step 4: Implementar `data/queries.ts`**

```ts
// data/queries.ts
import { cleanId, formatted, type Row } from '@betinhos/dataverse'
import { toDateOnly } from '../../funcionarios/data/dates'
import { parseMulti } from '../../infracoes/data/queries'
import { CATEGORIA_CODE, FUNC_DESLIGADO, SITUACAO_CODE, VEICULO_VENDIDO, categoriaDe, marcoDoCodigo, obrigDeCategoriaVeiculo, obrigDeFuncao } from '../domain/codes'
import type { Categoria, DocEmitido, Destinatario, Dono, TipoDoc } from '../domain/types'

export const ENTITIES = {
  tipo: 'cr40f_tipodocumento', documento: 'cr40f_documento', destinatario: 'cr40f_avisodestinatario',
  funcionario: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Navigation properties dos lookups (SchemaName criado por `provision-documentos.ps1`). */
export const NAV = { tipo: 'cr40f_Tipo', funcionario: 'cr40f_Funcionario', veiculo: 'cr40f_Veiculo' } as const

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const id = (v: unknown) => cleanId(str(v))
const sel = (campos: string[]) => campos.join(',')

export const tiposPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_tipodocumentoid', 'cr40f_codigo', 'cr40f_name', 'cr40f_categoria', 'cr40f_temvalidade', 'cr40f_validadepadraomeses', 'cr40f_obrigatoriopara', 'cr40f_ordem', 'statecode'])}`
export const documentosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_documentoid', '_cr40f_tipo_value', '_cr40f_funcionario_value', '_cr40f_veiculo_value', 'cr40f_numero', 'cr40f_emissao', 'cr40f_validade', 'cr40f_situacao', 'cr40f_pasta', 'cr40f_observacao', 'cr40f_ultimomarcoavisado', 'modifiedon'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const destinatariosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_avisodestinatarioid', 'cr40f_name', 'cr40f_categoria', '_cr40f_funcionario_value'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const funcionariosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_funcionariosid', 'new_apelido', 'cr40f_nomecompleto', 'cr40f_funcao', 'cr40f_status', 'cr40f_emailbetinhos'])}&$filter=${encodeURIComponent('statecode eq 0')}`
export const veiculosPath = (set: string) =>
  `${set}?$select=${sel(['cr40f_veiculosid', 'cr40f_placa', 'cr40f_marca', 'cr40f_modelo', 'new_categoriadoveiculo', 'cr40f_statusdoveiculo'])}&$filter=${encodeURIComponent('statecode eq 0')}`

export function mapTipo(row: Row): TipoDoc {
  return {
    id: id(row.cr40f_tipodocumentoid), codigo: str(row.cr40f_codigo).toUpperCase(), nome: str(row.cr40f_name),
    categoria: categoriaDe(row.cr40f_categoria) ?? 'pessoas', temValidade: row.cr40f_temvalidade === true,
    validadePadraoMeses: num(row.cr40f_validadepadraomeses), obrigatorioPara: parseMulti(row.cr40f_obrigatoriopara),
    ordem: num(row.cr40f_ordem) ?? 0, ativo: row.statecode !== 1,
  }
}

export function mapDoc(row: Row): DocEmitido {
  const funcionario = id(row._cr40f_funcionario_value)
  return {
    id: id(row.cr40f_documentoid), tipoId: id(row._cr40f_tipo_value),
    donoId: funcionario || id(row._cr40f_veiculo_value), categoria: funcionario ? 'pessoas' : 'frota',
    numero: str(row.cr40f_numero), emissao: toDateOnly(row.cr40f_emissao, 'DateOnly'), validade: toDateOnly(row.cr40f_validade, 'DateOnly'),
    situacao: row.cr40f_situacao === SITUACAO_CODE.substituido ? 'substituido' : 'vigente',
    pasta: str(row.cr40f_pasta), observacao: str(row.cr40f_observacao),
    ultimoMarco: marcoDoCodigo(row.cr40f_ultimomarcoavisado), modificadoEm: typeof row.modifiedon === 'string' ? row.modifiedon : null,
  }
}

export function mapDestinatario(row: Row): Destinatario {
  return { id: id(row.cr40f_avisodestinatarioid), categoria: categoriaDe(row.cr40f_categoria) ?? 'pessoas', funcionarioId: id(row._cr40f_funcionario_value), nome: str(row.cr40f_name) }
}

export function mapFuncionarioDono(row: Row): Dono {
  return {
    id: id(row.cr40f_funcionariosid), categoria: 'pessoas', nome: str(row.new_apelido) || str(row.cr40f_nomecompleto),
    detalhe: row.cr40f_funcao == null ? '' : formatted(row, 'cr40f_funcao'), obrigKey: obrigDeFuncao(row.cr40f_funcao),
    ativo: row.cr40f_status !== FUNC_DESLIGADO, email: str(row.cr40f_emailbetinhos),
  }
}

export function mapVeiculoDono(row: Row): Dono {
  return {
    id: id(row.cr40f_veiculosid), categoria: 'frota', nome: str(row.cr40f_placa),
    detalhe: [str(row.cr40f_marca), str(row.cr40f_modelo)].filter(Boolean).join(' '),
    obrigKey: obrigDeCategoriaVeiculo(row.new_categoriadoveiculo), ativo: row.cr40f_statusdoveiculo !== VEICULO_VENDIDO, email: '',
  }
}

export type NovoDoc = {
  nome: string; tipoId: string; categoria: Categoria; donoId: string
  numero: string; emissao: string | null; validade: string | null; pasta: string; observacao: string
}

const vazioNulo = (v: string) => (v.trim() ? v.trim() : null)

export function docPayload(input: NovoDoc, sets: Pick<EntitySets, 'tipo' | 'funcionario' | 'veiculo'>): Row {
  const dono = input.categoria === 'pessoas'
    ? { [`${NAV.funcionario}@odata.bind`]: `/${sets.funcionario}(${input.donoId})` }
    : { [`${NAV.veiculo}@odata.bind`]: `/${sets.veiculo}(${input.donoId})` }
  return {
    cr40f_name: input.nome, cr40f_numero: vazioNulo(input.numero), cr40f_emissao: input.emissao, cr40f_validade: input.validade,
    cr40f_situacao: SITUACAO_CODE.vigente, cr40f_pasta: input.pasta, cr40f_observacao: vazioNulo(input.observacao),
    [`${NAV.tipo}@odata.bind`]: `/${sets.tipo}(${input.tipoId})`, ...dono,
  }
}

export type TipoInput = Omit<TipoDoc, 'id' | 'ativo'>

export function tipoPayload(tipo: TipoInput): Row {
  return {
    cr40f_codigo: tipo.codigo.trim().toUpperCase(), cr40f_name: tipo.nome.trim(), cr40f_categoria: CATEGORIA_CODE[tipo.categoria],
    cr40f_temvalidade: tipo.temValidade, cr40f_validadepadraomeses: tipo.temValidade ? tipo.validadePadraoMeses : null,
    cr40f_obrigatoriopara: [...tipo.obrigatorioPara].sort((a, b) => a - b).join(',') || null, cr40f_ordem: tipo.ordem,
  }
}

export function destinatarioPayload(categoria: Categoria, funcionarioId: string, nome: string, sets: Pick<EntitySets, 'funcionario'>): Row {
  return { cr40f_name: nome, cr40f_categoria: CATEGORIA_CODE[categoria], [`${NAV.funcionario}@odata.bind`]: `/${sets.funcionario}(${funcionarioId})` }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data/queries.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/funcionarios/data/sharepoint.ts apps/shell/src/pages/funcionarios/data/sharepoint.test.ts apps/shell/src/pages/documentos/data
git commit -m "feat(documentos): consultas OData, mappers e payloads; listar subpasta no SharePoint"
```

---

### Task 5: Dados — salvar/renovar, mock e DocsSource

**Files:**
- Create: `apps/shell/src/pages/documentos/data/salvar.ts`, `data/mock.ts`, `data/source.ts`
- Test: `apps/shell/src/pages/documentos/data/salvar.test.ts`, `data/source.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `createSharePointDocs`, `DOC_MAX_BYTES` (Funcionários); `getDataverseEnvironmentLabel` de `pages/funcionarios/data/dataverse.ts`; `todaySP` de `pages/funcionarios/data/dates.ts`; `Host` de `src/host.ts`.
- Produces:
  - `type SalvarDocInput = { tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null; numero: string; emissao: string | null; validade: string | null; observacao: string; arquivos: File[] }`
  - `type SalvarDocResult = { doc: DocEmitido; enviados: Arquivo[]; falhas: { nome: string; erro: string }[]; avisos: string[] }`
  - `type SalvarDeps = { envLabel: string; criar(input: NovoDoc): Promise<string>; enviar(doc: DocEmitido, file: File, nome: string): Promise<Arquivo>; substituir(id: string): Promise<void>; dualWrite(funcionarioId: string, payload: Record<string, string | null>): Promise<void> }`
  - `salvarDocumento(deps, input): Promise<SalvarDocResult>`
  - `type DocsSource = { mock: boolean; carregar(): Promise<DocsData>; arquivos(doc: DocEmitido): Promise<Arquivo[]>; abrirArquivo(arq: Arquivo): Promise<{ nome: string; blob: Blob }>; salvarDocumento(input: SalvarDocInput): Promise<SalvarDocResult>; enviarArquivo(doc: DocEmitido, file: File): Promise<Arquivo>; salvarTipo(tipo: TipoInput, id?: string): Promise<string>; adicionarDestinatario(categoria: Categoria, funcionarioId: string, nome: string): Promise<string>; removerDestinatario(id: string): Promise<void> }`
  - `createDocsSource(host: Host): DocsSource`, `createMockDocsSource(hoje?: string): DocsSource`

- [ ] **Step 1: Teste da orquestração (falha)**

```ts
// data/salvar.test.ts
import { describe, expect, it, vi } from 'vitest'
import { salvarDocumento, type SalvarDeps } from './salvar'
import type { DocEmitido, Dono, TipoDoc } from '../domain/types'

const CNH: TipoDoc = { id: 'cnh', codigo: 'CNH', nome: 'CNH', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [100000000], ordem: 1, ativo: true }
const ASO: TipoDoc = { ...CNH, id: 'aso', codigo: 'ASO', nome: 'ASO', validadePadraoMeses: 12 }
const ANA: Dono = { id: 'ana', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: '' }
const ANTERIOR: DocEmitido = { id: 'old', tipoId: 'cnh', donoId: 'ana', categoria: 'pessoas', numero: '1', emissao: null, validade: '2026-10-01', situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: 'vencido', modificadoEm: null }

function deps(over: Partial<SalvarDeps> = {}): SalvarDeps & { chamadas: string[] } {
  const chamadas: string[] = []
  return {
    chamadas,
    envLabel: 'DEV',
    criar: vi.fn(async () => { chamadas.push('criar'); return 'novo' }),
    enviar: vi.fn(async (_doc: unknown, _file: File, nome: string) => { chamadas.push(`enviar:${nome}`); return { id: nome, nome, caminho: '', tamanho: 1, modificadoEm: null, mimeType: null } }),
    substituir: vi.fn(async (id: string) => { chamadas.push(`substituir:${id}`) }),
    dualWrite: vi.fn(async (_id: string, payload: Record<string, string | null>) => { chamadas.push(`dual:${JSON.stringify(payload)}`) }),
    ...over,
  }
}
const file = (name: string) => new File(['x'], name, { type: 'application/pdf' })

describe('salvarDocumento', () => {
  it('renova CNH: cria, envia, substitui o anterior e atualiza a ficha', async () => {
    const d = deps()
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '2', emissao: '2026-10-10', validade: '2031-10-10', observacao: '', arquivos: [file('cnh.pdf')] })
    expect(d.chamadas).toEqual(['criar', 'enviar:CNH_2031-10-10_cnh.pdf', 'substituir:old', 'dual:{"cr40f_validadedacnh":"2031-10-10"}'])
    expect(d.criar).toHaveBeenCalledWith(expect.objectContaining({ nome: 'CNH · Ana', pasta: 'Funcionarios/DEV/ana/Documentos/CNH', tipoId: 'cnh', donoId: 'ana' }))
    expect(r.doc).toMatchObject({ id: 'novo', situacao: 'vigente', validade: '2031-10-10' })
    expect(r.falhas).toEqual([])
  })

  it('ASO grava a data do exame na ficha', async () => {
    const d = deps()
    await salvarDocumento(d, { tipo: ASO, dono: ANA, anterior: null, numero: '', emissao: '2026-10-10', validade: '2027-10-10', observacao: '', arquivos: [] })
    expect(d.chamadas).toEqual(['criar', 'dual:{"cr40f_datadoaso":"2026-10-10"}'])
  })

  it('falha de upload não desfaz o documento e é reportada', async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error('SharePoint fora') }) })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [file('a.pdf')] })
    expect(r.falhas).toEqual([{ nome: 'a.pdf', erro: 'SharePoint fora' }])
    expect(d.substituir).toHaveBeenCalledWith('old')
  })

  it('falha ao substituir vira aviso, não erro', async () => {
    const d = deps({ substituir: vi.fn(async () => { throw new Error('sem permissão') }) })
    const r = await salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [] })
    expect(r.avisos).toEqual(['O documento anterior não foi marcado como substituído: sem permissão'])
  })

  it('falha ao criar propaga e não toca em mais nada', async () => {
    const d = deps({ criar: vi.fn(async () => { throw new Error('HTTP 400') }) })
    await expect(salvarDocumento(d, { tipo: CNH, dono: ANA, anterior: ANTERIOR, numero: '', emissao: null, validade: '2031-10-10', observacao: '', arquivos: [file('a.pdf')] })).rejects.toThrow('HTTP 400')
    expect(d.enviar).not.toHaveBeenCalled()
    expect(d.substituir).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data/salvar.test.ts`
Expected: FAIL — `Failed to resolve import "./salvar"`.

- [ ] **Step 2: Implementar `data/salvar.ts`**

```ts
// data/salvar.ts
import { nomeArquivo, nomeDocumento, pastaDoc } from '../domain/nomes'
import type { Arquivo, DocEmitido, Dono, TipoDoc } from '../domain/types'
import type { NovoDoc } from './queries'

export type SalvarDocInput = {
  tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null
  numero: string; emissao: string | null; validade: string | null; observacao: string; arquivos: File[]
}
export type SalvarDocResult = { doc: DocEmitido; enviados: Arquivo[]; falhas: { nome: string; erro: string }[]; avisos: string[] }
export type SalvarDeps = {
  envLabel: string
  criar(input: NovoDoc): Promise<string>
  enviar(doc: DocEmitido, file: File, nome: string): Promise<Arquivo>
  substituir(id: string): Promise<void>
  dualWrite(funcionarioId: string, payload: Record<string, string | null>): Promise<void>
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Campos legados da ficha que Dashboard, App Motoristas e flows antigos ainda leem. */
function legado(tipo: TipoDoc, input: SalvarDocInput): Record<string, string | null> | null {
  if (input.dono.categoria !== 'pessoas') return null
  if (tipo.codigo === 'CNH') return { cr40f_validadedacnh: input.validade }
  if (tipo.codigo === 'ASO') return { cr40f_datadoaso: input.emissao }
  return null
}

/**
 * Cria o documento Vigente, envia os arquivos, marca o anterior como Substituído e atualiza os campos legados.
 * Só a criação é bloqueante: falhas depois dela viram `falhas`/`avisos` para a tela mostrar sem perder o que foi salvo.
 */
export async function salvarDocumento(deps: SalvarDeps, input: SalvarDocInput): Promise<SalvarDocResult> {
  const { tipo, dono } = input
  const novo: NovoDoc = {
    nome: nomeDocumento(tipo, dono), tipoId: tipo.id, categoria: dono.categoria, donoId: dono.id,
    numero: input.numero, emissao: input.emissao, validade: tipo.temValidade ? input.validade : null,
    pasta: pastaDoc(dono.categoria, dono.id, tipo.codigo, deps.envLabel), observacao: input.observacao,
  }
  const id = await deps.criar(novo)
  const doc: DocEmitido = {
    id, tipoId: tipo.id, donoId: dono.id, categoria: dono.categoria, numero: novo.numero.trim(), emissao: novo.emissao, validade: novo.validade,
    situacao: 'vigente', pasta: novo.pasta, observacao: novo.observacao.trim(), ultimoMarco: null, modificadoEm: new Date().toISOString(),
  }

  const enviados: Arquivo[] = []
  const falhas: SalvarDocResult['falhas'] = []
  for (const file of input.arquivos) {
    try { enviados.push(await deps.enviar(doc, file, nomeArquivo(tipo.codigo, doc.validade ?? doc.emissao, file.name))) }
    catch (e) { falhas.push({ nome: file.name, erro: mensagem(e) }) }
  }

  const avisos: string[] = []
  if (input.anterior) {
    try { await deps.substituir(input.anterior.id) }
    catch (e) { avisos.push(`O documento anterior não foi marcado como substituído: ${mensagem(e)}`) }
  }
  const payload = legado(tipo, input)
  if (payload) {
    try { await deps.dualWrite(dono.id, payload) }
    catch (e) { avisos.push(`A ficha do funcionário não foi atualizada: ${mensagem(e)}`) }
  }
  return { doc, enviados, falhas, avisos }
}
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data/salvar.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 3: Implementar `data/mock.ts`**

Dados relativos a `hoje` para cobrir todos os estados na tela:

```ts
// data/mock.ts
import { addMonths } from '../../funcionarios/data/dates'
import type { DocEmitido, DocsData, Dono, TipoDoc } from '../domain/types'

const dia = (hoje: string, delta: number) => {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
const t = (id: string, codigo: string, nome: string, categoria: TipoDoc['categoria'], temValidade: boolean, obrigatorioPara: number[], ordem: number, validadePadraoMeses: number | null = null): TipoDoc =>
  ({ id, codigo, nome, categoria, temValidade, validadePadraoMeses, obrigatorioPara, ordem, ativo: true })

export const MOCK_TIPOS: TipoDoc[] = [
  t('t-cnh', 'CNH', 'CNH', 'pessoas', true, [100000000], 1),
  t('t-aso', 'ASO', 'ASO', 'pessoas', true, [100000000, 100000001], 2, 12),
  t('t-ant', 'ANTECEDENTES', 'Antecedentes criminais', 'pessoas', true, [100000000], 3),
  t('t-cert', 'CERTIDAO', 'Certidões', 'pessoas', true, [], 4),
  t('t-rg', 'RG', 'RG', 'pessoas', false, [100000000, 100000001], 5),
  t('t-cpf', 'CPF', 'CPF', 'pessoas', false, [100000000, 100000001], 6),
  t('t-res', 'RESIDENCIA', 'Comprovante de residência', 'pessoas', false, [100000000, 100000001], 7),
  t('t-ctr', 'CONTRATO', 'Contrato', 'pessoas', false, [100000000, 100000001], 8),
  t('t-crlv', 'CRLV', 'CRLV / Licenciamento', 'frota', true, [100000002, 100000003, 100000004], 1),
  t('t-ipva', 'IPVA', 'IPVA', 'frota', true, [100000002], 2),
  t('t-seg', 'SEGURO', 'Seguro', 'frota', true, [100000002, 100000003, 100000004], 3),
]

const pessoa = (id: string, nome: string, motorista: boolean): Dono =>
  ({ id, categoria: 'pessoas', nome, detalhe: motorista ? 'Motorista' : 'Administrativo', obrigKey: motorista ? 100000000 : 100000001, ativo: true, email: `${id}@betinhos.com.br` })
const carro = (id: string, placa: string, detalhe: string, obrigKey: number): Dono =>
  ({ id, categoria: 'frota', nome: placa, detalhe, obrigKey, ativo: true, email: '' })

export function createMockData(hoje: string): DocsData {
  const donos = [
    pessoa('f-ana', 'Ana', true), pessoa('f-bruno', 'Bruno', true), pessoa('f-carla', 'Carla', false), pessoa('f-diego', 'Diego', true),
    carro('v-1', 'ABC1D23', 'Toyota Corolla', 100000002), carro('v-2', 'EFG4H56', 'Chevrolet Spin', 100000003), carro('v-3', 'IJK7L89', 'Jeep Compass', 100000004),
  ]
  let n = 0
  const d = (tipoId: string, donoId: string, validade: string | null, extra: Partial<DocEmitido> = {}): DocEmitido => ({
    id: `d-${++n}`, tipoId, donoId, categoria: donoId.startsWith('v-') ? 'frota' : 'pessoas', numero: '', emissao: null, validade,
    situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: null, modificadoEm: null, ...extra,
  })
  const docs = [
    d('t-cnh', 'f-ana', dia(hoje, -5)),
    d('t-cnh', 'f-ana', dia(hoje, -370), { situacao: 'substituido' }),
    d('t-aso', 'f-ana', dia(hoje, 25), { emissao: addMonths(dia(hoje, 25), -12) }),
    d('t-rg', 'f-ana', null),
    d('t-cnh', 'f-bruno', dia(hoje, 6)),
    d('t-aso', 'f-bruno', dia(hoje, 200)),
    d('t-aso', 'f-carla', dia(hoje, 50)),
    d('t-cnh', 'f-diego', dia(hoje, 900)),
    d('t-crlv', 'v-1', dia(hoje, 3)),
    d('t-ipva', 'v-1', dia(hoje, -20), { observacao: 'Parcela 3 de 3' }),
    d('t-seg', 'v-1', dia(hoje, 120), { observacao: 'Porto Seguro' }),
    d('t-crlv', 'v-2', dia(hoje, 40)),
  ]
  const destinatarios = [{ id: 'a-1', categoria: 'pessoas' as const, funcionarioId: 'f-carla', nome: 'Carla' }]
  return { tipos: MOCK_TIPOS.map((x) => ({ ...x, obrigatorioPara: [...x.obrigatorioPara] })), donos, docs, destinatarios }
}
```

- [ ] **Step 4: Teste do mock source (falha)**

```ts
// data/source.test.ts
import { describe, expect, it } from 'vitest'
import { createMockDocsSource } from './source'

describe('createMockDocsSource', () => {
  it('renovar troca o vigente e mantém o histórico', async () => {
    const source = createMockDocsSource('2026-10-13')
    const antes = await source.carregar()
    const cnh = antes.tipos.find((t) => t.codigo === 'CNH')!
    const ana = antes.donos.find((d) => d.nome === 'Ana')!
    const anterior = antes.docs.find((d) => d.donoId === ana.id && d.tipoId === cnh.id && d.situacao === 'vigente')!
    const r = await source.salvarDocumento({ tipo: cnh, dono: ana, anterior, numero: '9', emissao: '2026-10-13', validade: '2031-10-13', observacao: '', arquivos: [new File(['x'], 'cnh.pdf')] })
    expect(r.enviados).toHaveLength(1)
    const depois = await source.carregar()
    const daAna = depois.docs.filter((d) => d.donoId === ana.id && d.tipoId === cnh.id)
    expect(daAna.filter((d) => d.situacao === 'vigente').map((d) => d.validade)).toEqual(['2031-10-13'])
    expect(daAna.filter((d) => d.situacao === 'substituido')).toHaveLength(2)
    expect(await source.arquivos(r.doc)).toHaveLength(1)
  })

  it('destinatários: adicionar e remover', async () => {
    const source = createMockDocsSource('2026-10-13')
    const novo = await source.adicionarDestinatario('frota', 'f-bruno', 'Bruno')
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).toContain('Bruno')
    await source.removerDestinatario(novo)
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).not.toContain('Bruno')
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data/source.test.ts`
Expected: FAIL — `Failed to resolve import "./source"`.

- [ ] **Step 5: Implementar `data/source.ts`**

```ts
// data/source.ts
import { cleanId, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { todaySP } from '../../funcionarios/data/dates'
import { createSharePointDocs } from '../../funcionarios/data/sharepoint'
import type { XrmHost } from '../../funcionarios/data/xrm'
import { SITUACAO_CODE } from '../domain/codes'
import { RAIZ, subpastaDoc } from '../domain/nomes'
import type { Arquivo, Categoria, DocEmitido, DocsData } from '../domain/types'
import { createMockData } from './mock'
import {
  ENTITIES, destinatarioPayload, destinatariosPath, docPayload, documentosPath, funcionariosPath, mapDestinatario, mapDoc,
  mapFuncionarioDono, mapTipo, mapVeiculoDono, tipoPayload, tiposPath, veiculosPath, type EntitySets, type TipoInput,
} from './queries'
import { salvarDocumento, type SalvarDocInput, type SalvarDocResult } from './salvar'

export type DocsSource = {
  mock: boolean
  carregar(): Promise<DocsData>
  arquivos(doc: DocEmitido): Promise<Arquivo[]>
  abrirArquivo(arq: Arquivo): Promise<{ nome: string; blob: Blob }>
  salvarDocumento(input: SalvarDocInput): Promise<SalvarDocResult>
  enviarArquivo(doc: DocEmitido, file: File): Promise<Arquivo>
  salvarTipo(tipo: TipoInput, id?: string): Promise<string>
  adicionarDestinatario(categoria: Categoria, funcionarioId: string, nome: string): Promise<string>
  removerDestinatario(id: string): Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const codigoDoTipo = (data: DocsData, tipoId: string) => data.tipos.find((t) => t.id === tipoId)?.codigo ?? 'OUTROS'

export function createMockDocsSource(hoje = todaySP()): DocsSource {
  const data = createMockData(hoje)
  const arquivos = new Map<string, Arquivo[]>()
  const blobs = new Map<string, Blob>()
  let seq = 0
  const novoId = () => `m-${++seq}`
  const guardar = (doc: DocEmitido, file: File, nome: string): Arquivo => {
    const arq: Arquivo = { id: novoId(), nome, caminho: `${doc.pasta}/${nome}`, tamanho: file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
    arquivos.set(doc.id, [arq, ...(arquivos.get(doc.id) ?? [])])
    blobs.set(arq.id, file)
    return arq
  }
  return {
    mock: true,
    async carregar() { await wait(250); return structuredClone(data) },
    async arquivos(doc) { await wait(150); return [...(arquivos.get(doc.id) ?? [])] },
    async abrirArquivo(arq) { return { nome: arq.nome, blob: blobs.get(arq.id) ?? new Blob([]) } },
    async salvarDocumento(input) {
      await wait(300)
      return salvarDocumento({
        envLabel: 'DEV',
        async criar(novo) {
          const id = novoId()
          data.docs.push({ id, tipoId: novo.tipoId, donoId: novo.donoId, categoria: novo.categoria, numero: novo.numero, emissao: novo.emissao, validade: novo.validade, situacao: 'vigente', pasta: novo.pasta, observacao: novo.observacao, ultimoMarco: null, modificadoEm: new Date().toISOString() })
          return id
        },
        async enviar(doc, file, nome) { return guardar(doc, file, nome) },
        async substituir(id) { const d = data.docs.find((x) => x.id === id); if (d) d.situacao = 'substituido' },
        async dualWrite() { /* sem ficha no mock */ },
      }, input)
    },
    async enviarArquivo(doc, file) { await wait(200); return guardar(doc, file, file.name) },
    async salvarTipo(tipo, id) {
      await wait(200)
      if (id) { Object.assign(data.tipos.find((x) => x.id === id) ?? {}, tipo); return id }
      const novo = novoId(); data.tipos.push({ ...tipo, id: novo, ativo: true }); return novo
    },
    async adicionarDestinatario(categoria, funcionarioId, nome) { await wait(150); const id = novoId(); data.destinatarios.push({ id, categoria, funcionarioId, nome }); return id },
    async removerDestinatario(id) { await wait(150); data.destinatarios = data.destinatarios.filter((d) => d.id !== id) },
  }
}

export function createDocsSource(host: Host): DocsSource {
  if (host.mode === 'mock') return createMockDocsSource()
  const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
  if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela')
  const envLabel = getDataverseEnvironmentLabel(host.clientUrl)
  const sp = { pessoas: createSharePointDocs(xrm.WebApi, envLabel, RAIZ.pessoas), frota: createSharePointDocs(xrm.WebApi, envLabel, RAIZ.frota) }
  let cache: DocsData | null = null

  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata. Rode packages/deploy/provision-documentos.ps1 neste ambiente.`)
      return value
    }
    return { tipo: get(ENTITIES.tipo), documento: get(ENTITIES.documento), destinatario: get(ENTITIES.destinatario), funcionario: get(ENTITIES.funcionario), veiculo: get(ENTITIES.veiculo) }
  }).catch((error) => { sets = null; throw error }))

  const enviar = async (doc: DocEmitido, file: File, nome: string) => {
    const codigo = cache ? codigoDoTipo(cache, doc.tipoId) : doc.pasta.split('/').pop() ?? 'OUTROS'
    return sp[doc.categoria].enviar(doc.donoId, file, nome, subpastaDoc(codigo))
  }

  return {
    mock: false,
    async carregar() {
      const s = await entitySets()
      const [tipos, docs, destinatarios, funcionarios, veiculos] = await Promise.all([
        host.client.getAll(tiposPath(s.tipo)), host.client.getAll(documentosPath(s.documento)), host.client.getAll(destinatariosPath(s.destinatario)),
        host.client.getAll(funcionariosPath(s.funcionario)), host.client.getAll(veiculosPath(s.veiculo)),
      ])
      cache = {
        tipos: tipos.map(mapTipo), docs: docs.map(mapDoc), destinatarios: destinatarios.map(mapDestinatario),
        donos: [...funcionarios.map(mapFuncionarioDono), ...veiculos.map(mapVeiculoDono)],
      }
      return cache
    },
    async arquivos(doc) {
      const codigo = cache ? codigoDoTipo(cache, doc.tipoId) : 'OUTROS'
      return sp[doc.categoria].listar(doc.donoId, subpastaDoc(codigo))
    },
    abrirArquivo: (arq) => sp.pessoas.abrir(arq),
    async salvarDocumento(input) {
      const s = await entitySets()
      return salvarDocumento({
        envLabel,
        criar: async (novo) => cleanId(await host.client.create(s.documento, docPayload(novo, s))),
        enviar,
        substituir: (id) => host.client.update(s.documento, id, { cr40f_situacao: SITUACAO_CODE.substituido } as Row),
        dualWrite: (funcionarioId, payload) => host.client.update(s.funcionario, funcionarioId, payload as Row),
      }, input)
    },
    enviarArquivo: (doc, file) => enviar(doc, file, file.name),
    async salvarTipo(tipo, id) {
      const s = await entitySets()
      if (id) { await host.client.update(s.tipo, id, tipoPayload(tipo)); return id }
      return cleanId(await host.client.create(s.tipo, tipoPayload(tipo)))
    },
    async adicionarDestinatario(categoria, funcionarioId, nome) {
      const s = await entitySets()
      return cleanId(await host.client.create(s.destinatario, destinatarioPayload(categoria, funcionarioId, nome, s)))
    },
    async removerDestinatario(id) {
      const s = await entitySets()
      await host.client.update(s.destinatario, id, { statecode: 1, statuscode: 2 })
    },
  }
}
```

Observação: `abrirArquivo` usa o flow "consultar", que localiza pelo caminho completo do arquivo; serve para as duas raízes.

- [ ] **Step 6: Rodar e ver passar; typecheck**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/data` e `pnpm typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/documentos/data
git commit -m "feat(documentos): salvar/renovar com dual-write, fonte Dataverse e dados de exemplo"
```

---

### Task 6: Hook de carga e badge de estado

**Files:**
- Create: `apps/shell/src/pages/documentos/useDocumentos.ts`, `components/StatusDoc.tsx`
- Test: `apps/shell/src/pages/documentos/components/StatusDoc.test.tsx`

**Interfaces:**
- Consumes: `DocsSource` (Task 5), `rotuloPrazo` (Task 1).
- Produces: `useDocumentos(source: DocsSource | null): { data: DocsData | null; loading: boolean; error: string | null; reload(): Promise<void> }`; `<StatusDoc estado={EstadoItem} dias={number | null} />`; `ESTADO_LABEL: Record<EstadoItem, string>`.

- [ ] **Step 1: Teste do badge (falha)**

```tsx
// components/StatusDoc.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusDoc } from './StatusDoc'

afterEach(cleanup)

describe('StatusDoc', () => {
  it('mostra estado e prazo', () => {
    render(<><StatusDoc estado="vencido" dias={-3} /><StatusDoc estado="vence30" dias={20} /><StatusDoc estado="faltando" dias={null} /><StatusDoc estado="semValidade" dias={null} /></>)
    expect(screen.getByText('Vencido · vencido há 3 dias')).toBeTruthy()
    expect(screen.getByText('Vence em 20 dias')).toBeTruthy()
    expect(screen.getByText('Faltando')).toBeTruthy()
    expect(screen.getByText('Sem validade')).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/StatusDoc.test.tsx`
Expected: FAIL — import não resolvido.

- [ ] **Step 2: Implementar `StatusDoc.tsx` e `useDocumentos.ts`**

```tsx
// components/StatusDoc.tsx
import { StatusBadge, type StatusTone } from '@betinhos/ui'
import { rotuloPrazo } from '../domain/vencimento'
import type { EstadoItem } from '../domain/types'

export const ESTADO_LABEL: Record<EstadoItem, string> = {
  vencido: 'Vencido', vence7: 'Vence em até 7 dias', vence30: 'Vence em até 30 dias', vence60: 'Vence em até 60 dias',
  ok: 'Em dia', semValidade: 'Sem validade', faltando: 'Faltando', opcional: 'Não enviado',
}
const TOM: Record<EstadoItem, StatusTone> = {
  vencido: 'danger', vence7: 'danger', vence30: 'warning', vence60: 'warning', ok: 'success', semValidade: 'neutral', faltando: 'danger', opcional: 'neutral',
}

export function StatusDoc({ estado, dias }: { estado: EstadoItem; dias: number | null }) {
  const prazo = rotuloPrazo(dias)
  let texto = ESTADO_LABEL[estado]
  if (estado === 'vencido' && prazo) texto = `Vencido · ${prazo}`
  else if ((estado === 'vence7' || estado === 'vence30' || estado === 'vence60') && prazo) texto = prazo.charAt(0).toUpperCase() + prazo.slice(1)
  return <StatusBadge tone={TOM[estado]} dot>{texto}</StatusBadge>
}
```

```ts
// useDocumentos.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocsSource } from './data/source'
import type { DocsData } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga única de tipos, donos, documentos e destinatários; token contra respostas fora de ordem. Mantém a carga anterior se a nova falhar. */
export function useDocumentos(source: DocsSource | null) {
  const [state, setState] = useState<{ data: DocsData | null; loading: boolean; error: string | null }>({ data: null, loading: Boolean(source), error: null })
  const token = useRef(0)
  const reload = useCallback(async () => {
    if (!source) return
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await source.carregar()
      if (current === token.current) setState({ data, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])
  useEffect(() => { void reload() }, [reload])
  return { ...state, reload }
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/StatusDoc.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/pages/documentos
git commit -m "feat(documentos): hook de carga e badge de estado do documento"
```

---

### Task 7: Drawer Adicionar/Renovar

**Files:**
- Create: `apps/shell/src/pages/documentos/components/RenovarDrawer.tsx`, `apps/shell/src/pages/documentos/documentos.css`
- Test: `apps/shell/src/pages/documentos/components/RenovarDrawer.test.tsx`

**Interfaces:**
- Consumes: `DocsSource`, `SalvarDocResult` (Task 5), `validadeSugerida` (Task 1), `DOC_MAX_BYTES` (Funcionários), `todaySP`.
- Produces: `type AlvoRenovar = { tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null }`; `<RenovarDrawer alvo={AlvoRenovar | null} source={DocsSource} onClose={() => void} onSaved={(r: SalvarDocResult) => void} />`.

- [ ] **Step 1: Ler `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` inteiro** (regra do repo) e conferir os nomes de token usados abaixo (`--bt-space-*`, `--bt-font-size-*`, `--bt-color-*`, `--bt-radius-*`, `--bt-border-width-default`). Se algum não existir, use o equivalente listado no DS; não invente valores.

- [ ] **Step 2: Teste que falha**

```tsx
// components/RenovarDrawer.test.tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
import { RenovarDrawer } from './RenovarDrawer'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function montar() {
  const source = createMockDocsSource('2026-10-13')
  const data = await source.carregar()
  const aso = data.tipos.find((t) => t.codigo === 'ASO')!
  const ana = data.donos.find((d) => d.nome === 'Ana')!
  const anterior = data.docs.find((d) => d.donoId === ana.id && d.tipoId === aso.id && d.situacao === 'vigente')!
  const onSaved = vi.fn(); const onClose = vi.fn()
  render(<ToastProvider><RenovarDrawer alvo={{ tipo: aso, dono: ana, anterior }} source={source} onClose={onClose} onSaved={onSaved} /></ToastProvider>)
  return { onSaved, onClose, dialog: await screen.findByRole('dialog', { name: 'Renovar ASO' }) }
}

describe('RenovarDrawer', () => {
  it('sugere validade pela emissão e salva', async () => {
    const { dialog, onSaved } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Emissão'), { target: { value: '2026-10-10' } })
    expect((within(dialog).getByLabelText(/^Validade/) as HTMLInputElement).value).toBe('2027-10-10')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0].doc.validade).toBe('2027-10-10')
  })

  it('exige validade quando o tipo vence', async () => {
    const { dialog, onSaved } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    expect(await within(dialog).findByText('Informe a validade.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('com alteração não salva pede confirmação ao fechar', async () => {
    const { dialog, onClose } = await montar()
    fireEvent.change(within(dialog).getByLabelText('Número'), { target: { value: '123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/RenovarDrawer.test.tsx`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `RenovarDrawer.tsx`**

```tsx
// components/RenovarDrawer.tsx
import { useEffect, useId, useState } from 'react'
import { Alert, Button, Dialog, Drawer, Field, Input, Textarea, Upload, type UploadFile } from '@betinhos/ui'
import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import type { DocsSource } from '../data/source'
import type { SalvarDocResult } from '../data/salvar'
import { validadeSugerida } from '../domain/vencimento'
import type { DocEmitido, Dono, TipoDoc } from '../domain/types'

export type AlvoRenovar = { tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null }
type Form = { numero: string; emissao: string; validade: string; observacao: string; arquivos: File[] }
const VAZIO: Form = { numero: '', emissao: '', validade: '', observacao: '', arquivos: [] }
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

type Props = { alvo: AlvoRenovar | null; source: DocsSource; onClose: () => void; onSaved: (r: SalvarDocResult) => void }

export function RenovarDrawer({ alvo, source, onClose, onSaved }: Props) {
  const formId = useId()
  const [form, setForm] = useState<Form>(VAZIO)
  const [validadeManual, setValidadeManual] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => { setForm(VAZIO); setValidadeManual(false); setErros({}); setFalha(null) }, [alvo])

  if (!alvo) return null
  const { tipo, dono, anterior } = alvo
  const dirty = form.numero !== '' || form.emissao !== '' || form.validade !== '' || form.observacao !== '' || form.arquivos.length > 0

  const fechar = () => { if (saving) return; if (dirty) { setConfirmar(true); return } onClose() }
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const mudarEmissao = (emissao: string) => {
    const sugerida = validadeSugerida(tipo, emissao || null)
    set(validadeManual || !sugerida ? { emissao } : { emissao, validade: sugerida })
  }

  const validar = () => {
    const e: Record<string, string> = {}
    if (tipo.temValidade && !form.validade) e.validade = 'Informe a validade.'
    if (form.emissao && form.validade && form.validade < form.emissao) e.validade = 'A validade não pode ser antes da emissão.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  const salvar = async () => {
    if (saving || !validar()) return
    setSaving(true); setFalha(null)
    try {
      const r = await source.salvarDocumento({ tipo, dono, anterior, numero: form.numero, emissao: form.emissao || null, validade: form.validade || null, observacao: form.observacao, arquivos: form.arquivos })
      onSaved(r)
    } catch (reason) {
      setFalha(reason instanceof Error ? reason.message : String(reason))
    } finally { setSaving(false) }
  }

  const uploadFiles: UploadFile[] = form.arquivos.map((f) => ({ name: f.name, size: f.size, type: f.type }))
  const footer = (
    <>
      <Button variant="secondary" disabled={saving} onClick={fechar}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>Salvar documento</Button>
    </>
  )

  return (
    <>
      <Drawer open onClose={fechar} eyebrow={dono.nome} title={`${anterior ? 'Renovar' : 'Adicionar'} ${tipo.nome}`} footer={footer}>
        <form id={formId} className="doc-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
          {falha ? <Alert tone="danger" title="Não foi possível salvar">{falha} O que você digitou foi mantido.</Alert> : null}
          {anterior ? <p className="doc-muted">O documento atual vira histórico ao salvar.</p> : null}
          <Field label="Número"><Input value={form.numero} disabled={saving} onChange={(e) => set({ numero: e.target.value })} /></Field>
          <div className="doc-form__datas">
            <Field label="Emissão"><Input type="date" value={form.emissao} disabled={saving} onChange={(e) => mudarEmissao(e.target.value)} /></Field>
            {tipo.temValidade ? (
              <Field label="Validade" required error={erros.validade} hint={tipo.validadePadraoMeses ? `Sugerida: emissão + ${tipo.validadePadraoMeses} meses` : undefined}>
                <Input type="date" value={form.validade} invalid={Boolean(erros.validade)} disabled={saving} onChange={(e) => { setValidadeManual(true); set({ validade: e.target.value }) }} />
              </Field>
            ) : null}
          </div>
          <Field label="Observação"><Textarea rows={2} value={form.observacao} disabled={saving} onChange={(e) => set({ observacao: e.target.value })} /></Field>
          <Upload
            label="Arquivos"
            hint="PDF, JPG ou PNG, até 10 MB cada."
            accept={ACCEPT}
            maxSize={DOC_MAX_BYTES}
            files={uploadFiles}
            disabled={saving}
            onChange={(files, added) => set({ arquivos: [...form.arquivos.filter((f) => files.some((x) => x.name === f.name)), ...added] })}
          />
        </form>
      </Drawer>
      <Dialog open={confirmar} onClose={() => setConfirmar(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmar(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirmar(false); onClose() }}>Descartar</Button>
        </>}>
        O que foi digitado neste documento será perdido.
      </Dialog>
    </>
  )
}
```

Antes de rodar, conferir em `packages/ui/src/components/Input` (arquivo `Field.tsx`) se `Input` aceita `invalid` (o `ControlStyle` de `InputProps`); se o nome for outro, use o do componente. Conferir também se `Field` liga o `label` ao `Input` filho (o teste usa `getByLabelText`); o `Field` do DS faz isso via `fieldIds` — se exigir `id` explícito, passe `id` gerado com `useId()` para cada `Input`.

- [ ] **Step 4: CSS do módulo**

```css
/* apps/shell/src/pages/documentos/documentos.css — Documentos: central, checklist e drawers. Só tokens do Design System. */
.doc-muted { margin: 0; font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.doc-form { display: grid; gap: var(--bt-space-3); }
.doc-form__datas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); }
@container (max-width: 420px) { .doc-form__datas { grid-template-columns: minmax(0, 1fr); } }
```

E importar no topo de `RenovarDrawer.tsx`: `import '../documentos.css'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/RenovarDrawer.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/documentos
git commit -m "feat(documentos): drawer de adicionar/renovar com validade sugerida e confirmação de descarte"
```

---

### Task 8: Checklist por dono (usado nas fichas)

**Files:**
- Create: `apps/shell/src/pages/documentos/components/Checklist.tsx`
- Modify: `apps/shell/src/pages/documentos/documentos.css`
- Test: `apps/shell/src/pages/documentos/components/Checklist.test.tsx`

**Interfaces:**
- Consumes: `useDocumentos`, `montarChecklist`, `StatusDoc`, `RenovarDrawer`, `DocsSource`, `formatBR` de `pages/funcionarios/data/dates.ts`, `todaySP`.
- Produces: `<Checklist source={DocsSource} donoId={string} titulo?: string />`.

- [ ] **Step 1: Teste que falha**

```tsx
// components/Checklist.test.tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
import { Checklist } from './Checklist'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Checklist', () => {
  it('lista os tipos da categoria com estado e abre a renovação', async () => {
    render(<ToastProvider><Checklist source={createMockDocsSource()} donoId="f-ana" /></ToastProvider>)
    const cnh = await screen.findByRole('listitem', { name: 'CNH' })
    expect(within(cnh).getByText(/^Vencido/)).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Antecedentes criminais' })).getByText('Faltando')).toBeTruthy()
    expect(within(screen.getByRole('listitem', { name: 'Certidões' })).getByText('Não enviado')).toBeTruthy()
    fireEvent.click(within(cnh).getByRole('button', { name: 'Histórico (1)' }))
    expect(within(cnh).getAllByText(/Substituído/).length).toBe(1)
    fireEvent.click(within(cnh).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/Checklist.test.tsx`
Expected: FAIL — import não resolvido.

- [ ] **Step 2: Implementar `Checklist.tsx`**

```tsx
// components/Checklist.tsx
import { useMemo, useState } from 'react'
import { Alert, Button, Skeleton, useToast } from '@betinhos/ui'
import { FileText, Upload as UploadIcon } from 'lucide-react'
import { formatBR, todaySP } from '../../funcionarios/data/dates'
import type { DocsSource } from '../data/source'
import type { SalvarDocResult } from '../data/salvar'
import { montarChecklist } from '../domain/pendencias'
import type { Arquivo, DocEmitido, ItemChecklist } from '../domain/types'
import { useDocumentos } from '../useDocumentos'
import { RenovarDrawer, type AlvoRenovar } from './RenovarDrawer'
import { StatusDoc } from './StatusDoc'
import '../documentos.css'

type Props = { source: DocsSource; donoId: string; titulo?: string }

export function Checklist({ source, donoId, titulo = 'Documentos controlados' }: Props) {
  const { data, loading, error, reload } = useDocumentos(source)
  const toast = useToast()
  const [alvo, setAlvo] = useState<AlvoRenovar | null>(null)
  const dono = data?.donos.find((d) => d.id === donoId) ?? null
  const itens = useMemo(() => (data && dono ? montarChecklist(dono, data.tipos, data.docs, todaySP()) : []), [data, dono])

  const onSaved = (r: SalvarDocResult) => {
    setAlvo(null)
    if (r.falhas.length) toast({ tone: 'warning', message: `Documento salvo, mas arquivos não foram enviados: ${r.falhas.map((f) => `${f.nome} (${f.erro})`).join(' · ')}` })
    else toast({ tone: 'success', message: 'Documento salvo' })
    for (const aviso of r.avisos) toast({ tone: 'warning', message: aviso })
    void reload()
  }

  if (error && !data) return <Alert tone="danger" title="Não foi possível carregar os documentos" action={<Button variant="secondary" onClick={() => void reload()}>Tentar de novo</Button>}>{error}</Alert>
  if (loading && !data) return <Skeleton shape="rect" height={160} />
  if (!dono) return <p className="doc-muted">Cadastro não encontrado na lista de documentos.</p>

  return (
    <section className="doc-checklist" aria-labelledby={`${donoId}-docs`}>
      <h3 id={`${donoId}-docs`} className="doc-checklist__title">{titulo}</h3>
      <ul className="doc-checklist__list">
        {itens.map((item) => <ItemLinha key={item.tipo.id} item={item} source={source} onRenovar={() => setAlvo({ tipo: item.tipo, dono, anterior: item.vigente })} />)}
      </ul>
      <RenovarDrawer alvo={alvo} source={source} onClose={() => setAlvo(null)} onSaved={onSaved} />
    </section>
  )
}

function ItemLinha({ item, source, onRenovar }: { item: ItemChecklist; source: DocsSource; onRenovar: () => void }) {
  const [verHistorico, setVerHistorico] = useState(false)
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)
  const [erroArq, setErroArq] = useState<string | null>(null)
  const v = item.vigente

  const carregarArquivos = async (doc: DocEmitido) => {
    setErroArq(null)
    try { setArquivos(await source.arquivos(doc)) } catch (e) { setErroArq(e instanceof Error ? e.message : String(e)) }
  }
  const abrir = async (arq: Arquivo) => {
    const { blob } = await source.abrirArquivo(arq)
    window.open(URL.createObjectURL(blob), '_blank', 'noopener')
  }

  return (
    <li className="doc-item" aria-label={item.tipo.nome}>
      <div className="doc-item__head">
        <strong className="doc-item__nome">{item.tipo.nome}</strong>
        <StatusDoc estado={item.estado} dias={item.dias} />
      </div>
      {v ? (
        <p className="doc-muted">
          {v.numero ? `Nº ${v.numero} · ` : ''}{v.emissao ? `Emissão ${formatBR(v.emissao)} · ` : ''}{v.validade ? `Validade ${formatBR(v.validade)}` : 'Sem validade'}{v.observacao ? ` · ${v.observacao}` : ''}
        </p>
      ) : null}
      <div className="doc-item__acoes">
        <Button size="compact" variant={v ? 'secondary' : 'primary'} icon={<UploadIcon size={14} />} onClick={onRenovar}>{v ? 'Renovar' : 'Adicionar'}</Button>
        {v ? <Button size="compact" variant="ghost" icon={<FileText size={14} />} onClick={() => void carregarArquivos(v)}>Arquivos</Button> : null}
        {item.historico.length ? <Button size="compact" variant="ghost" aria-expanded={verHistorico} onClick={() => setVerHistorico((x) => !x)}>{`Histórico (${item.historico.length})`}</Button> : null}
      </div>
      {erroArq ? <p className="doc-muted" role="alert">{erroArq}</p> : null}
      {arquivos ? (arquivos.length
        ? <ul className="doc-item__arquivos">{arquivos.map((a) => <li key={a.id}><button type="button" className="doc-link" onClick={() => void abrir(a)}>{a.nome}</button></li>)}</ul>
        : <p className="doc-muted">Nenhum arquivo enviado.</p>) : null}
      {verHistorico ? (
        <ul className="doc-item__historico">
          {item.historico.map((h) => <li key={h.id} className="doc-muted">Substituído · {h.validade ? `validade ${formatBR(h.validade)}` : 'sem validade'}{h.numero ? ` · Nº ${h.numero}` : ''}</li>)}
        </ul>
      ) : null}
    </li>
  )
}
```

Antes de rodar, conferir: `Button` aceita `size="compact"` e `variant="ghost"` (`ButtonSize`/`ButtonVariant` em `packages/ui/src/components/Button.tsx`); `Skeleton` aceita `lines`; `useToast()` devolve função com `{ tone, title, description }` (`ToastOptions` em `Alert.tsx`). Ajuste para os nomes reais se diferirem.

- [ ] **Step 3: CSS do checklist** (acrescentar em `documentos.css`)

```css
.doc-checklist { display: grid; gap: var(--bt-space-2); }
.doc-checklist__title { margin: 0; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.08em; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.doc-checklist__list, .doc-item__arquivos, .doc-item__historico { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; }
.doc-item { display: grid; gap: var(--bt-space-1-5); padding: var(--bt-space-3); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.doc-item__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--bt-space-2); }
.doc-item__nome { font-size: var(--bt-font-size-14); color: var(--bt-color-text-primary); }
.doc-item__acoes { display: flex; flex-wrap: wrap; gap: var(--bt-space-1); }
.doc-link { padding: 0; border: 0; background: transparent; color: var(--bt-color-action); font: inherit; font-size: var(--bt-font-size-13); text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.doc-link:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); border-radius: var(--bt-radius-xs); }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/Checklist.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/documentos
git commit -m "feat(documentos): checklist por dono com arquivos, histórico e renovação"
```

---

### Task 9: Central `#/documentos` (rota, menu, KPIs, abas e lista)

**Files:**
- Create: `apps/shell/src/pages/documentos/components/PendenciasLista.tsx`, `apps/shell/src/pages/documentos/DocumentosPage.tsx`
- Modify: `apps/shell/src/nav/menu.ts` (união `page` + item em Cadastros), `apps/shell/src/app/RouteLayout.tsx` (render da página), `apps/shell/src/app/AppShell.tsx` (`ITEM_ICONS.documentos`), `apps/shell/src/pages/documentos/documentos.css`
- Test: `apps/shell/src/pages/documentos/DocumentosPage.test.tsx`; ajustar `apps/shell/src/nav/menu.test.ts` se ele fixar a lista de itens de Cadastros.

**Interfaces:**
- Consumes: Tasks 1–8; `useQueryFilters` (`nav/queryState`), `useShellHeader`, `PageLayout`, `useMedia` de `pages/operacional/useMedia`.
- Produces: `DocumentosPage({ host }: { host: Host })`; `<PendenciasLista lista={Pendencia[]} mobile={boolean} onRenovar={(p) => void} onAbrirFicha={(p) => void} />`; `hrefFicha(p: Pendencia): string`; item de menu `{ kind: 'page', id: 'documentos', label: 'Documentos', page: 'documentos' }`.

- [ ] **Step 1: Teste da página (falha)**

```tsx
// DocumentosPage.test.tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentosPage } from './DocumentosPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  window.location.hash = '#/documentos'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Central de documentos', () => {
  it('mostra KPIs de Pessoas, filtra por KPI e troca para Frota', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const vencidos = await screen.findByRole('button', { name: /Vencidos/ })
    expect(within(vencidos).getByText('1')).toBeTruthy()
    fireEvent.click(vencidos)
    await waitFor(() => expect(window.location.hash).toContain('kpi=vencido'))
    expect(screen.getAllByRole('row').some((r) => /Ana/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Frota' }))
    await waitFor(() => expect(window.location.hash).toContain('aba=frota'))
    expect((await screen.findAllByText('ABC1D23')).length).toBeGreaterThan(0)
  })

  it('Renovar abre o drawer do documento', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const linha = (await screen.findAllByRole('row')).find((r) => /Bruno/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))!
    fireEvent.click(within(linha).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/DocumentosPage.test.tsx`
Expected: FAIL — import não resolvido.

- [ ] **Step 2: Implementar `PendenciasLista.tsx`**

```tsx
// components/PendenciasLista.tsx
import { Button, Table, type TableColumn } from '@betinhos/ui'
import { formatBR } from '../../funcionarios/data/dates'
import type { Pendencia } from '../domain/types'
import { StatusDoc } from './StatusDoc'

/** Link da ficha do dono: Funcionários abre direto na seção Documentos; Frota abre a ficha do veículo. */
export const hrefFicha = (p: Pendencia) => (p.dono.categoria === 'pessoas'
  ? `#/funcionarios?ficha=${p.dono.id}&secao=documentos`
  : `#/frota?ficha=${p.dono.id}`)

type Props = { lista: Pendencia[]; mobile: boolean; onRenovar: (p: Pendencia) => void }

export function PendenciasLista({ lista, mobile, onRenovar }: Props) {
  const acoes = (p: Pendencia) => (
    <span className="doc-acoes">
      <Button size="compact" variant="secondary" onClick={() => onRenovar(p)}>{p.doc ? 'Renovar' : 'Adicionar'}</Button>
      <a className="doc-link" href={hrefFicha(p)}>Abrir ficha</a>
    </span>
  )
  if (mobile) {
    return (
      <ul className="doc-cards">
        {lista.map((p) => (
          <li key={p.chave} className="doc-item" aria-label={`${p.tipo.nome} · ${p.dono.nome}`}>
            <div className="doc-item__head"><strong className="doc-item__nome">{p.dono.nome}</strong><StatusDoc estado={p.estado} dias={p.dias} /></div>
            <p className="doc-muted">{p.tipo.nome}{p.doc?.validade ? ` · validade ${formatBR(p.doc.validade)}` : ''}</p>
            {acoes(p)}
          </li>
        ))}
      </ul>
    )
  }
  const columns: TableColumn<Pendencia>[] = [
    { key: 'dono', header: 'Cadastro', cell: (p) => <span className="doc-dono"><strong>{p.dono.nome}</strong><span>{p.dono.detalhe}</span></span> },
    { key: 'tipo', header: 'Documento', cell: (p) => p.tipo.nome },
    { key: 'validade', header: 'Validade', cell: (p) => (p.doc?.validade ? formatBR(p.doc.validade) : '—'), hideBelow: 'compact' },
    { key: 'estado', header: 'Situação', cell: (p) => <StatusDoc estado={p.estado} dias={p.dias} /> },
    { key: 'acoes', header: <span className="sr-only">Ações</span>, cell: acoes, align: 'end' },
  ]
  return <Table className="doc-table" columns={columns} rows={lista} rowKey={(p) => p.chave} />
}
```

O `Table` do DS usa `role="row"` (conferido). Não há utilitário `sr-only` garantido: se `grep -rn "sr-only" apps/shell/src packages/ui/src` não achar, use `header: ''` na coluna de ações.

- [ ] **Step 3: Implementar `DocumentosPage.tsx`**

```tsx
// DocumentosPage.tsx
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, MetricCard, SearchBox, Select, Skeleton, StatusBadge, Tabs, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { CheckCircle2, RefreshCw, Settings } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryFilters } from '../../nav/queryState'
import { todaySP } from '../funcionarios/data/dates'
import { useMedia } from '../operacional/useMedia'
import { createDocsSource, type DocsSource } from './data/source'
import type { SalvarDocResult } from './data/salvar'
import { KPIS, contarKpis, filtrarPendencias, montarPendencias } from './domain/pendencias'
import { documentosQuery } from './domain/query'
import type { Categoria, Kpi } from './domain/types'
import { useDocumentos } from './useDocumentos'
import { PendenciasLista } from './components/PendenciasLista'
import { RenovarDrawer, type AlvoRenovar } from './components/RenovarDrawer'
import { ConfigDrawer } from './components/ConfigDrawer'
import './documentos.css'

const KPI_LABEL: Record<Kpi, string> = { vencido: 'Vencidos', vence7: 'Até 7 dias', vence30: '8 a 30 dias', vence60: '31 a 60 dias', faltando: 'Faltando' }
const KPI_TOM: Record<Kpi, 'danger' | 'warning' | 'info'> = { vencido: 'danger', vence7: 'danger', vence30: 'warning', vence60: 'info', faltando: 'danger' }
const ABAS: { value: Categoria; label: string }[] = [{ value: 'pessoas', label: 'Pessoas' }, { value: 'frota', label: 'Frota' }]

export function DocumentosPage({ host }: { host: Host }) {
  return <ToastProvider><Documentos host={host} /></ToastProvider>
}

function Documentos({ host }: { host: Host }) {
  const { source, fatal } = useMemo(() => {
    try { return { source: createDocsSource(host) as DocsSource | null, fatal: null } } catch (e) { return { source: null, fatal: e instanceof Error ? e.message : String(e) } }
  }, [host])
  const { data, loading, error, reload } = useDocumentos(source)
  const [filtro, setFiltro] = useQueryFilters(documentosQuery)
  const [alvo, setAlvo] = useState<AlvoRenovar | null>(null)
  const [config, setConfig] = useState(false)
  const mobile = useMedia('(max-width: 820px)')
  const toast = useToast()

  const hoje = todaySP()
  const todas = useMemo(() => (data ? montarPendencias(data.tipos, data.donos, data.docs, hoje) : []), [data, hoje])
  const daAba = useMemo(() => todas.filter((p) => p.dono.categoria === filtro.aba), [todas, filtro.aba])
  const kpis = useMemo(() => contarKpis(daAba), [daAba])
  const visiveis = useMemo(() => filtrarPendencias(todas, filtro), [todas, filtro])
  const tiposDaAba = useMemo(() => (data?.tipos ?? []).filter((t) => t.categoria === filtro.aba && t.ativo), [data, filtro.aba])

  const refresh = useCallback(() => { void reload() }, [reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar documentos" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Documentos', actions: headerActions })

  const onSaved = (r: SalvarDocResult) => {
    setAlvo(null)
    if (r.falhas.length) toast({ tone: 'warning', message: `Documento salvo, mas arquivos não foram enviados: ${r.falhas.map((f) => `${f.nome} (${f.erro})`).join(' · ')}` })
    else toast({ tone: 'success', message: 'Documento salvo' })
    for (const aviso of r.avisos) toast({ tone: 'warning', message: aviso })
    void reload()
  }

  let body
  if (fatal) body = <Alert tone="danger" title="Documentos indisponíveis">{fatal}</Alert>
  else if (error && !data) body = <Alert tone="danger" title="Não foi possível carregar os documentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{error}</Alert>
  else if (!data) body = <Skeleton shape="rect" height={240} />
  else if (!visiveis.length) body = <EmptyState className="surface" align="start" icon={<CheckCircle2 size={36} />} title={daAba.length ? 'Nenhum documento para estes filtros' : 'Tudo em dia'} action={daAba.length ? <Button variant="secondary" onClick={() => setFiltro({ ...filtro, kpi: null, tipo: null, q: '' })}>Limpar filtros</Button> : undefined} />
  else body = <PendenciasLista lista={visiveis} mobile={mobile} onRenovar={(p) => setAlvo({ tipo: p.tipo, dono: p.dono, anterior: p.doc })} />

  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Documentos"
      meta={source?.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : undefined}
      description="Vencimentos e documentos obrigatórios de funcionários e da frota."
      actions={<>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && Boolean(data)} onClick={refresh}>Atualizar</Button>}
        <Button variant="secondary" icon={<Settings size={16} />} disabled={!data} onClick={() => setConfig(true)}>Configurações</Button>
      </>}
      tabs={<Tabs aria-label="Categoria" value={filtro.aba} onChange={(aba) => setFiltro({ aba, kpi: null, tipo: null, q: filtro.q })} tabs={ABAS} />}
      toolbar={data ? (
        <div className="doc-toolbar">
          <SearchBox className="doc-toolbar__search" value={filtro.q} onChange={(q) => setFiltro({ ...filtro, q })} placeholder={filtro.aba === 'pessoas' ? 'Buscar funcionário ou documento' : 'Buscar placa ou documento'} />
          <Select className="doc-toolbar__select" aria-label="Tipo de documento" value={filtro.tipo ?? ''} onChange={(v) => setFiltro({ ...filtro, tipo: v || null })}
            options={[{ value: '', label: 'Todos os tipos' }, ...tiposDaAba.map((t) => ({ value: t.id, label: t.nome }))]} />
        </div>
      ) : undefined}
    >
      {error && data ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{error} A lista mostra os dados da carga anterior.</Alert> : null}
      {data ? (
        <div className="doc-kpis">
          {KPIS.map((k) => (
            <button key={k} type="button" className="doc-kpi" aria-pressed={filtro.kpi === k} onClick={() => setFiltro({ ...filtro, kpi: filtro.kpi === k ? null : k })}>
              <MetricCard tone={KPI_TOM[k]} label={KPI_LABEL[k]} value={kpis[k]} />
            </button>
          ))}
        </div>
      ) : null}
      {body}
      {source ? <RenovarDrawer alvo={alvo} source={source} onClose={() => setAlvo(null)} onSaved={onSaved} /> : null}
      {source && data && config ? <ConfigDrawer source={source} data={data} onClose={() => setConfig(false)} onChanged={refresh} /> : null}
    </PageLayout>
  )
}
```

APIs conferidas: `SearchBox` `onChange(value: string)`; `Select` simples `value: string | null` e `onChange(value: string | null)`. Conferir em `SelectOption` se o campo do rótulo é `label` (referência de uso: `pages/infracoes/components/InfracoesToolbar.tsx`).

Esta tarefa usa `ConfigDrawer` (Task 10). Para manter a tarefa testável sozinha, crie agora `components/ConfigDrawer.tsx` mínimo e substitua o conteúdo na Task 10:

```tsx
// components/ConfigDrawer.tsx (provisório; Task 10 substitui)
import { Drawer } from '@betinhos/ui'
import type { DocsSource } from '../data/source'
import type { DocsData } from '../domain/types'

export function ConfigDrawer({ onClose }: { source: DocsSource; data: DocsData; onClose: () => void; onChanged: () => void }) {
  return <Drawer open onClose={onClose} title="Configurações de documentos">{null}</Drawer>
}
```

- [ ] **Step 4: CSS da central** (acrescentar em `documentos.css`)

```css
.doc-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--bt-space-2); }
@media (max-width: 820px) { .doc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.doc-kpi { display: block; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; border-radius: var(--bt-radius-lg); }
.doc-kpi:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); }
.doc-kpi[aria-pressed='true'] > * { border-color: var(--bt-color-action); }
.doc-toolbar { display: flex; flex-wrap: wrap; gap: var(--bt-space-2); }
.doc-toolbar__search { flex: 1 1 260px; min-width: 200px; max-width: 360px; }
.doc-toolbar__select { flex: 0 1 220px; min-width: 170px; }
.doc-dono { display: grid; gap: var(--bt-space-0-5); }
.doc-dono span { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.doc-acoes { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-2); }
.doc-cards { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; }
```

- [ ] **Step 5: Registrar rota, menu e ícone**

Em `apps/shell/src/nav/menu.ts`:
- Na união do `kind: 'page'`, acrescentar `| 'documentos'` à lista de `page`.
- No grupo `cadastros`, depois de `{ kind: 'page', id: 'funcionarios', … }`, inserir `{ kind: 'page', id: 'documentos', label: 'Documentos', page: 'documentos' },`.

Em `apps/shell/src/app/RouteLayout.tsx`, junto dos outros `if (item.page === …)`, acrescentar `if (item.page === 'documentos') return <DocumentosPage host={host} />` e o import `import { DocumentosPage } from '../pages/documentos/DocumentosPage'`.

Em `apps/shell/src/app/AppShell.tsx`, acrescentar `documentos: <FolderCheck />,` em `ITEM_ICONS` e `FolderCheck` ao import de `lucide-react`.

Run: `pnpm --filter @betinhos/shell test -- src/nav/menu.test.ts`; se falhar por lista fixa de itens, atualize a expectativa incluindo `documentos` logo após `funcionarios`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos src/nav` e `pnpm typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/documentos apps/shell/src/nav apps/shell/src/app
git commit -m "feat(documentos): central #/documentos com KPIs, abas Pessoas/Frota, filtros na URL e renovação"
```

---

### Task 10: Configurações — tipos de documento e destinatários

**Files:**
- Modify (substituir o provisório): `apps/shell/src/pages/documentos/components/ConfigDrawer.tsx`
- Test: `apps/shell/src/pages/documentos/components/ConfigDrawer.test.tsx`

**Interfaces:**
- Consumes: `DocsSource.salvarTipo`, `adicionarDestinatario`, `removerDestinatario`; `OBRIG_DA_CATEGORIA`, `OBRIG_LABEL` (Task 1); `TipoInput` (Task 4).
- Produces: `<ConfigDrawer source data onClose onChanged />` com abas "Tipos de documento" e "Destinatários".

- [ ] **Step 1: Teste que falha**

```tsx
// components/ConfigDrawer.test.tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockDocsSource } from '../data/source'
import { ConfigDrawer } from './ConfigDrawer'

configure({ asyncUtilTimeout: 8000 })
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function montar() {
  const source = createMockDocsSource('2026-10-13')
  const data = await source.carregar()
  const onChanged = vi.fn()
  render(<ToastProvider><ConfigDrawer source={source} data={data} onClose={() => undefined} onChanged={onChanged} /></ToastProvider>)
  return { source, onChanged, dialog: await screen.findByRole('dialog', { name: 'Configurações de documentos' }) }
}

describe('ConfigDrawer', () => {
  it('cria um tipo novo', async () => {
    const { dialog, source, onChanged } = await montar()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Novo tipo' }))
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Curso de passageiros' } })
    fireEvent.change(within(dialog).getByLabelText('Código'), { target: { value: 'cetpp' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tipo' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect((await source.carregar()).tipos.some((t) => t.codigo === 'CETPP' && t.categoria === 'pessoas')).toBe(true)
  })

  it('adiciona e remove destinatário da categoria', async () => {
    const { dialog, source } = await montar()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Destinatários' }))
    fireEvent.change(within(dialog).getByLabelText('Funcionário para Frota'), { target: { value: 'f-bruno' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Adicionar em Frota' }))
    await waitFor(async () => expect((await source.carregar()).destinatarios.some((d) => d.categoria === 'frota' && d.funcionarioId === 'f-bruno')).toBe(true))
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos/components/ConfigDrawer.test.tsx`
Expected: FAIL — botão "Novo tipo" não existe no provisório.

- [ ] **Step 2: Implementar `ConfigDrawer.tsx`**

```tsx
// components/ConfigDrawer.tsx
import { useId, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Field, Input, Switch, Tabs, useToast } from '@betinhos/ui'
import { Plus, Trash2 } from 'lucide-react'
import type { DocsSource } from '../data/source'
import type { TipoInput } from '../data/queries'
import { OBRIG_DA_CATEGORIA, OBRIG_LABEL } from '../domain/codes'
import type { Categoria, DocsData, TipoDoc } from '../domain/types'

type Props = { source: DocsSource; data: DocsData; onClose: () => void; onChanged: () => void }
type Aba = 'tipos' | 'destinatarios'
const CATEGORIAS: { value: Categoria; label: string }[] = [{ value: 'pessoas', label: 'Pessoas' }, { value: 'frota', label: 'Frota' }]
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ConfigDrawer({ source, data, onClose, onChanged }: Props) {
  const [aba, setAba] = useState<Aba>('tipos')
  return (
    <Drawer open onClose={onClose} size="wide" eyebrow="Documentos" title="Configurações de documentos">
      <Tabs aria-label="Configurações" value={aba} onChange={setAba} tabs={[{ value: 'tipos', label: 'Tipos de documento' }, { value: 'destinatarios', label: 'Destinatários' }]} />
      {aba === 'tipos' ? <Tipos source={source} data={data} onChanged={onChanged} /> : <Destinatarios source={source} data={data} onChanged={onChanged} />}
    </Drawer>
  )
}

const novoTipo = (categoria: Categoria, ordem: number): TipoInput => ({ codigo: '', nome: '', categoria, temValidade: true, validadePadraoMeses: null, obrigatorioPara: [], ordem })

function Tipos({ source, data, onChanged }: { source: DocsSource; data: DocsData; onChanged: () => void }) {
  const toast = useToast()
  const formId = useId()
  const [editando, setEditando] = useState<{ id?: string; form: TipoInput } | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const porCategoria = (c: Categoria) => data.tipos.filter((t) => t.categoria === c).sort((a, b) => a.ordem - b.ordem)

  const salvar = async () => {
    if (!editando) return
    const { id } = editando
    const form = { ...editando.form, codigo: editando.form.codigo.trim().toUpperCase(), nome: editando.form.nome.trim() }
    if (!form.nome || !form.codigo) { setErro('Informe nome e código.'); return }
    if (data.tipos.some((t) => t.codigo === form.codigo && t.id !== id)) { setErro('Já existe um tipo com este código.'); return }
    setSaving(true); setErro(null)
    try { await source.salvarTipo(form, id); toast({ tone: 'success', message: 'Tipo salvo' }); setEditando(null); onChanged() }
    catch (e) { setErro(msg(e)) } finally { setSaving(false) }
  }
  const editar = (t: TipoDoc) => setEditando({ id: t.id, form: { codigo: t.codigo, nome: t.nome, categoria: t.categoria, temValidade: t.temValidade, validadePadraoMeses: t.validadePadraoMeses, obrigatorioPara: [...t.obrigatorioPara], ordem: t.ordem } })
  const set = (patch: Partial<TipoInput>) => setEditando((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  if (editando) {
    const f = editando.form
    return (
      <form id={formId} className="doc-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro}</Alert> : null}
        <Field label="Nome" required><Input value={f.nome} disabled={saving} onChange={(e) => set({ nome: e.target.value })} /></Field>
        <Field label="Código" required hint="Também é o nome da pasta no SharePoint. Não mude depois de usar."><Input value={f.codigo} disabled={saving || Boolean(editando.id)} onChange={(e) => set({ codigo: e.target.value })} /></Field>
        <Switch label="Tem validade" checked={f.temValidade} disabled={saving} onChange={(e) => set({ temValidade: e.target.checked })} />
        {f.temValidade ? <Field label="Validade padrão (meses)" hint="Vazio: a validade é digitada."><Input type="number" min={1} value={f.validadePadraoMeses ?? ''} disabled={saving} onChange={(e) => set({ validadePadraoMeses: e.target.value ? Number(e.target.value) : null })} /></Field> : null}
        <fieldset className="doc-fieldset">
          <legend>Obrigatório para</legend>
          {OBRIG_DA_CATEGORIA[f.categoria].map((code) => (
            <Checkbox key={code} label={OBRIG_LABEL[code]} checked={f.obrigatorioPara.includes(code)} disabled={saving}
              onChange={(e) => set({ obrigatorioPara: e.target.checked ? [...f.obrigatorioPara, code] : f.obrigatorioPara.filter((x) => x !== code) })} />
          ))}
        </fieldset>
        <div className="doc-acoes">
          <Button variant="secondary" disabled={saving} onClick={() => setEditando(null)}>Voltar</Button>
          <Button type="submit" form={formId} loading={saving}>Salvar tipo</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="doc-form">
      {CATEGORIAS.map((c) => (
        <section key={c.value} className="doc-checklist">
          <h3 className="doc-checklist__title">{c.label}</h3>
          <ul className="doc-checklist__list">
            {porCategoria(c.value).map((t) => (
              <li key={t.id} className="doc-item" aria-label={t.nome}>
                <div className="doc-item__head">
                  <strong className="doc-item__nome">{t.nome}</strong>
                  <Button size="compact" variant="ghost" onClick={() => editar(t)}>Editar</Button>
                </div>
                <p className="doc-muted">{t.codigo} · {t.temValidade ? (t.validadePadraoMeses ? `vence em ${t.validadePadraoMeses} meses` : 'validade digitada') : 'sem validade'}{t.obrigatorioPara.length ? ` · obrigatório: ${t.obrigatorioPara.map((x) => OBRIG_LABEL[x]).join(', ')}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Button icon={<Plus size={16} />} onClick={() => setEditando({ form: novoTipo('pessoas', data.tipos.length + 1) })}>Novo tipo</Button>
    </div>
  )
}

function Destinatarios({ source, data, onChanged }: { source: DocsSource; data: DocsData; onChanged: () => void }) {
  const toast = useToast()
  const [escolha, setEscolha] = useState<Record<Categoria, string>>({ pessoas: '', frota: '' })
  const [ocupado, setOcupado] = useState(false)
  const funcionarios = useMemo(() => data.donos.filter((d) => d.categoria === 'pessoas' && d.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [data.donos])

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true)
    try { await fn(); toast({ tone: 'success', message: ok }); onChanged() } catch (e) { toast({ tone: 'danger', message: `Não foi possível salvar: ${msg(e)}` }) } finally { setOcupado(false) }
  }

  return (
    <div className="doc-form">
      <p className="doc-muted">Quem recebe os avisos de vencimento por e-mail. O endereço usado é o e-mail Betinhos do funcionário.</p>
      {CATEGORIAS.map((c) => {
        const atuais = data.destinatarios.filter((d) => d.categoria === c.value)
        const disponiveis = funcionarios.filter((f) => !atuais.some((a) => a.funcionarioId === f.id))
        const rotulo = `Adicionar em ${c.label}`
        const rotuloSelect = `Funcionário para ${c.label}`
        return (
          <section key={c.value} className="doc-checklist">
            <h3 className="doc-checklist__title">{c.label}</h3>
            <ul className="doc-checklist__list">
              {atuais.length ? atuais.map((d) => {
                const f = funcionarios.find((x) => x.id === d.funcionarioId)
                return (
                  <li key={d.id} className="doc-item doc-item__head">
                    <span><strong className="doc-item__nome">{d.nome}</strong>{f && !f.email ? <span className="doc-muted"> · sem e-mail Betinhos</span> : null}</span>
                    <Button size="compact" variant="ghost" icon={<Trash2 size={14} />} disabled={ocupado} aria-label={`Remover ${d.nome} de ${c.label}`} onClick={() => void agir(() => source.removerDestinatario(d.id), 'Destinatário removido')} />
                  </li>
                )
              }) : <li className="doc-muted">Ninguém recebe avisos de {c.label}.</li>}
            </ul>
            <div className="doc-acoes">
              <select className="doc-select" aria-label={rotuloSelect} value={escolha[c.value]} disabled={ocupado} onChange={(e) => setEscolha({ ...escolha, [c.value]: e.target.value })}>
                <option value="">Escolha um funcionário</option>
                {disponiveis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <Button size="compact" disabled={ocupado || !escolha[c.value]} aria-label={rotulo}
                onClick={() => { const f = funcionarios.find((x) => x.id === escolha[c.value]); if (f) void agir(() => source.adicionarDestinatario(c.value, f.id, f.nome), 'Destinatário adicionado').then(() => setEscolha({ ...escolha, [c.value]: '' })) }}>Adicionar</Button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

Nota de DS: preferir o `Select` do DS (`value: string | null`, `onChange(value | null)`, `aria-label`) no lugar do `<select>` nativo; se trocar, ajuste o teste para interagir com ele como `InfracoesPage.test.tsx` interage com selects. `Switch`/`Checkbox` recebem o rótulo por `label` (conferido).

CSS (acrescentar em `documentos.css`):

```css
.doc-fieldset { display: grid; gap: var(--bt-space-1-5); margin: 0; padding: 0; border: 0; }
.doc-fieldset legend { margin-bottom: var(--bt-space-1); font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-semibold); color: var(--bt-color-text-primary); }
.doc-select { min-height: var(--bt-control-height-touch); padding: 0 var(--bt-space-2); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-sm); background-color: #FCFCFB; font: inherit; }
```

(`#FCFCFB` é o neutro obrigatório de campos; se o DS tiver token para ele, use o token.)

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/documentos`
Expected: PASS (todos do módulo).

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/pages/documentos
git commit -m "feat(documentos): configurações de tipos de documento e destinatários dos avisos"
```

---

### Task 11: Integração nas fichas (Funcionários e Frota)

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/FuncionariosPage.tsx` (criar `DocsSource` e repassar), `apps/shell/src/pages/funcionarios/components/Ficha.tsx` (aba Documentos)
- Modify: `apps/shell/src/pages/frota/FrotaPage.tsx`, `apps/shell/src/pages/frota/components/FichaVeiculo.tsx` (seção Documentos)
- Test: `apps/shell/src/pages/funcionarios/components/Ficha.test.tsx`, `apps/shell/src/pages/frota/components/FichaVeiculo.test.tsx` (acrescentar casos)

**Interfaces:**
- Consumes: `Checklist` (Task 8), `createDocsSource`, `createMockDocsSource`, `DocsSource` (Task 5).
- Produces: prop opcional `docs?: DocsSource | null` em `Funcionarios`, `Ficha`, `Frota`, `FichaVeiculo`. Sem `docs`, as fichas renderizam exatamente como hoje (testes atuais intactos).

- [ ] **Step 1: Testes que falham**

Em `Ficha.test.tsx`, acrescentar (reaproveitando o helper de render existente no arquivo; se ele monta `<Ficha source={…} id=… />`, acrescente a prop `docs`):

```tsx
it('aba Documentos mostra o checklist quando há fonte de documentos', async () => {
  window.location.hash = '#/funcionarios?ficha=f-ana&secao=documentos'
  // `source` e `id` como nos outros testes do arquivo; o mock de documentos usa os ids f-ana, f-bruno…
  renderFicha({ id: 'f-ana', docs: createMockDocsSource() })
  expect(await screen.findByRole('heading', { name: 'Documentos controlados' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Outros arquivos' })).toBeTruthy()
})
```

Import: `import { createMockDocsSource } from '../../documentos/data/source'`. Se o `id` mock de Funcionários for diferente de `f-ana`, use o id do mock de Funcionários e espere "Cadastro não encontrado na lista de documentos." — o objetivo do teste é a presença da seção, não os dados.

Em `FichaVeiculo.test.tsx`, acrescentar caso equivalente esperando `heading` "Documentos" quando `docs={createMockDocsSource()}` é passado.

Run: `pnpm --filter @betinhos/shell test -- src/pages/funcionarios/components/Ficha.test.tsx src/pages/frota/components/FichaVeiculo.test.tsx`
Expected: FAIL — headings não existem.

- [ ] **Step 2: Funcionários**

`FuncionariosPage.tsx`: ao lado da criação do `source`, criar o de documentos sem derrubar a tela se falhar:

```tsx
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
```

Repassar: `<Funcionarios source={source} docs={docs} />`; em `Funcionarios({ source, docs }: { source: DataSource; docs?: DocsSource | null })` repassar para `<Ficha … docs={docs} />`.

`Ficha.tsx`: acrescentar `docs?: DocsSource | null` em `Props` e no destructuring; no bloco `tab === 'documentos'`, envolver o conteúdo atual:

```tsx
          {!loading && original && tab === 'documentos' && (
            <div className="docs">
              {docs ? <Checklist source={docs} donoId={original.id} /> : null}
              <h3 className="doc-checklist__title">Outros arquivos</h3>
              <DocumentosArquivos source={source} id={original.id} />
              {/* … imagens, link da pasta antiga e SecretText exatamente como estão … */}
            </div>
          )}
```

Imports: `import { Checklist } from '../../documentos/components/Checklist'` e `import type { DocsSource } from '../../documentos/data/source'`.

- [ ] **Step 3: Frota**

`FrotaPage.tsx`: mesmo `useMemo` de `docs` em `FrotaPage`, repassado para `Frota` e daí para `<FichaVeiculo … docs={docs} />`.

`FichaVeiculo.tsx`: acrescentar `docs?: DocsSource | null` às props; entre a seção "Dados" e "Custo de manutenção":

```tsx
          {docs ? (
            <section className="frota-group" aria-labelledby={`${id}-docs`}>
              <h3 id={`${id}-docs`} className="frota-group__title">Documentos</h3>
              <Checklist source={docs} donoId={id} titulo="" />
            </section>
          ) : null}
```

Em `Checklist.tsx`, quando `titulo === ''` não renderizar o `h3` interno (usar `aria-label="Documentos"` na `section`):

```tsx
    <section className="doc-checklist" aria-labelledby={titulo ? `${donoId}-docs` : undefined} aria-label={titulo ? undefined : 'Documentos'}>
      {titulo ? <h3 id={`${donoId}-docs`} className="doc-checklist__title">{titulo}</h3> : null}
```

- [ ] **Step 4: Rodar e ver passar (inclui suítes antigas)**

Run: `pnpm --filter @betinhos/shell test -- src/pages/funcionarios src/pages/frota src/pages/documentos` e `pnpm typecheck`
Expected: PASS em todas; nenhum teste antigo alterado além dos casos novos.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/funcionarios apps/shell/src/pages/frota apps/shell/src/pages/documentos
git commit -m "feat(documentos): checklist na ficha do funcionário e seção Documentos na ficha do veículo"
```

---

### Task 12: Contador na sidebar

**Files:**
- Create: `apps/shell/src/app/useDocumentosBadge.ts`
- Modify: `apps/shell/src/app/AppShell.tsx` (prop `badges` → `NavItem.badge`), `apps/shell/src/App.tsx` (usar o hook e repassar)
- Test: `apps/shell/src/app/useDocumentosBadge.test.ts`

**Interfaces:**
- Consumes: `createDocsSource`, `montarPendencias`, `contarKpis`, `urgentes`, `todaySP`.
- Produces: `contarUrgentes(data: DocsData, hoje: string): number`; `useDocumentosBadge(host: Host): number | null` (recarrega a cada 10 min; `null` em erro ou mock indisponível); prop `badges?: Record<string, ReactNode>` no `AppShell` do shell.

- [ ] **Step 1: Teste da contagem (falha)**

```ts
// app/useDocumentosBadge.test.ts
import { describe, expect, it } from 'vitest'
import { createMockData } from '../pages/documentos/data/mock'
import { contarUrgentes } from './useDocumentosBadge'

describe('contador de documentos', () => {
  it('soma vencidos e até 7 dias das duas categorias', () => {
    // mock: Ana CNH vencida, Bruno CNH em 6 dias, ABC1D23 CRLV em 3 dias, ABC1D23 IPVA vencido
    expect(contarUrgentes(createMockData('2026-10-13'), '2026-10-13')).toBe(4)
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/app/useDocumentosBadge.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 2: Implementar o hook**

```ts
// app/useDocumentosBadge.ts
import { useEffect, useState } from 'react'
import type { Host } from '../host'
import { todaySP } from '../pages/funcionarios/data/dates'
import { createDocsSource } from '../pages/documentos/data/source'
import { contarKpis, montarPendencias, urgentes } from '../pages/documentos/domain/pendencias'
import type { DocsData } from '../pages/documentos/domain/types'

const INTERVALO_MS = 10 * 60 * 1000

export const contarUrgentes = (data: DocsData, hoje: string) => urgentes(contarKpis(montarPendencias(data.tipos, data.donos, data.docs, hoje)))

/** Vencidos + vencem em até 7 dias, para o badge de "Documentos" no menu. Falha silenciosa: sem número, sem badge. */
export function useDocumentosBadge(host: Host) {
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    let source: ReturnType<typeof createDocsSource>
    try { source = createDocsSource(host) } catch { return }
    const carregar = () => source.carregar().then((d) => { if (vivo) setTotal(contarUrgentes(d, todaySP())) }).catch(() => { if (vivo) setTotal(null) })
    void carregar()
    const timer = window.setInterval(carregar, INTERVALO_MS)
    return () => { vivo = false; window.clearInterval(timer) }
  }, [host])
  return total
}
```

- [ ] **Step 3: Plumbing no AppShell**

Em `apps/shell/src/app/AppShell.tsx`:
- `type Props` ganha `badges?: Record<string, ReactNode>`.
- `toNavGroup(group, entityLabels, badges)` e, em cada item, `badge: badges?.[item.id]`.
- `groups={MENU.map((group) => toNavGroup(group, entityLabels, badges))}`.

Em `apps/shell/src/App.tsx`, onde o `host` já existe e o `<AppShell …>` é montado:

```tsx
  const docsUrgentes = useDocumentosBadge(host)
  const badges = useMemo(() => (docsUrgentes ? { documentos: docsUrgentes } : undefined), [docsUrgentes])
  // …
  <AppShell activeId={activeId} title={label} entityLabels={labels} connection={connection} badges={badges}>
```

(Se `host` em `App.tsx` tiver outro nome, use o existente; não crie um segundo host.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/app` e `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/app apps/shell/src/App.tsx
git commit -m "feat(documentos): contador de vencidos e vencendo em 7 dias no menu"
```

---

### Task 13: Regra única de vencimento em Funcionários e Dashboard

**Files:**
- Modify: `apps/shell/src/pages/funcionarios/data/alerts.ts:16-17`
- Modify: `apps/shell/src/pages/dashboard/domain/alertas.ts:9-11`
- Modify: `apps/shell/src/pages/dashboard/domain/analises.test.ts` (caso "até 90 dias")

**Interfaces:**
- Consumes: `JANELA_DIAS` (Task 1).
- Produces: `DIAS_ATENCAO === JANELA_DIAS`; `cnhEmAtencao` com janela de 60 dias.

- [ ] **Step 1: Ajustar o teste do Dashboard para 60 dias (falha)**

Em `analises.test.ts`, no teste `'CNH: só funcionário "ativo" com validade até 90 dias; …'`: renomear para `até 60 dias` e mudar o funcionário de fronteira para validade em +61 dias (não entra) e +60 dias (entra). Ler o teste atual antes e mexer só nos valores de fronteira.

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/analises.test.ts`
Expected: FAIL — +61 dias ainda entra com a regra de 90.

- [ ] **Step 2: Implementar**

`dashboard/domain/alertas.ts`:

```ts
import { JANELA_DIAS } from '../../documentos/domain/vencimento'
/** `cnhWarn`: só status "ativo" e validade preenchida até a janela única de documentos (60 dias). */
export const cnhEmAtencao = (funcionarios: Funcionario[], nowMs: number) =>
  funcionarios.filter((f) => stL(f.statusLabel) === 'ativo' && Number.isFinite(f.cnhMs) && (f.cnhMs - nowMs) / DIA_MS <= JANELA_DIAS)
```

`funcionarios/data/alerts.ts`:

```ts
import { JANELA_DIAS } from '../../documentos/domain/vencimento'
export const DIAS_CRITICO = 30
export const DIAS_ATENCAO = JANELA_DIAS
```

Procurar textos fixos "90 dias" nos componentes do Dashboard (`grep -rn "90 dias" apps/shell/src/pages/dashboard`) e trocar por `${JANELA_DIAS} dias` onde descrevem esta regra.

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard src/pages/funcionarios`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/shell/src/pages/dashboard apps/shell/src/pages/funcionarios/data/alerts.ts
git commit -m "fix(documentos): janela única de 60 dias para CNH/ASO em Funcionários e no Dashboard"
```

---

### Task 14: Schema no DEV — tabelas, colunas, lookups e tipos iniciais

**Files:**
- Create: `packages/deploy/provision-documentos.ps1` (salvo em UTF-8 **com BOM**)

**Interfaces:**
- Produces: tabelas `cr40f_tipodocumento`, `cr40f_documento`, `cr40f_avisodestinatario` na solução do `.env` (`DV_SOLUTION`, AppBetinhos), com os nomes lógicos e choices da Global Constraints; 11 tipos iniciais (seed idempotente por `cr40f_codigo`).

- [ ] **Step 1: Montar o script a partir do da Escala**

Copiar de `apps/escala-fds/schema/provision-escala-fds.ps1` as linhas 1–108 (param, helpers, `.env`, autenticação, `Invoke-Dataverse`, `Get-Rows`, solução, `Add-SolutionComponent`, `Get-EntityId`, `Get-AttributeId`) e as funções `Picklist` e `Ensure-AttributeOn` (linhas 153–158 e 200–211). Trocar o prefixo de log `[escala-fds]` por `[documentos]` e `$root` para `(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path` (o script fica em `packages/deploy`). Acrescentar os helpers:

```powershell
function MultiPicklist([string] $Schema, [string] $Display, [string] $Description, [string[]] $Labels) {
  $options = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $options += @{ Value = 100000000 + $i; Label = Label $Labels[$i] } }
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = "None" }
    OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $options } }
}
function Text([string] $Schema, [string] $Display, [string] $Description, [int] $Max) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function DateOnly([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
}
function YesNo([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; DefaultValue = $false
     OptionSet = @{ TrueOption = @{ Value = 1; Label = Label "Sim" }; FalseOption = @{ Value = 0; Label = Label "Não" } } }
}
function Ensure-Table([string] $Logical, [string] $Schema, [string] $Display, [string] $Plural, [string] $Description) {
  $id = Get-EntityId $Logical
  if (-not $id -and $Apply) {
    Invoke-Dataverse "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema; DisplayName = Label $Display; DisplayCollectionName = Label $Plural
      Description = Label $Description; OwnershipType = "UserOwned"; HasActivities = $false; HasNotes = $false; IsActivity = $false; PrimaryNameAttribute = "cr40f_name"
      Attributes = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_Name"; IsPrimaryName = $true; MaxLength = 850; FormatName = @{ Value = "Text" }; RequiredLevel = @{ Value = "None" }; DisplayName = Label "Nome"; Description = Label "Nome exibido" })
    } | Out-Null
    Write-Step "tabela criada $Logical"
    $id = Get-EntityId $Logical
  }
  elseif (-not $id) { Write-Step "DRY RUN criaria a tabela $Logical" }
  if ($id) { Add-SolutionComponent $id 1 "tabela $Logical" -IncludeSubcomponents }
  return $id
}
$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
function Ensure-Lookup([string] $Relationship, [string] $Referenced, [string] $Referencing, [string] $Schema, [string] $Display, [string] $Description, [string] $Delete) {
  $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  if ($rows.Count -eq 0 -and $Apply) {
    Invoke-Dataverse "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $Relationship
      ReferencedEntity = $Referenced; ReferencedAttribute = "${Referenced}id"; ReferencingEntity = $Referencing
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = $Delete; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "lookup criado $Referencing.$($Schema.ToLowerInvariant())"
    $rows = @(Get-Rows $relPath "MetadataId" "SchemaName eq '$Relationship'")
  }
  elseif ($rows.Count -eq 0) { Write-Step "DRY RUN criaria lookup $Referencing.$($Schema.ToLowerInvariant())" }
  if ($rows.Count -eq 1) {
    Add-SolutionComponent $rows[0].MetadataId 10 "relacionamento $Relationship"
    Add-SolutionComponent (Get-AttributeId $Referencing $Schema.ToLowerInvariant()) 2 "$Referencing.$($Schema.ToLowerInvariant())"
  }
}
```

`ReferencedAttribute` = `${Referenced}id` funciona para as três referências (`cr40f_tipodocumentoid`, `cr40f_funcionariosid`, `cr40f_veiculosid`).

- [ ] **Step 2: Definições**

```powershell
foreach ($required in @("cr40f_funcionarios", "cr40f_veiculos")) { if (-not (Get-EntityId $required)) { throw "Tabela $required nao existe neste ambiente." } }

$tipo = "cr40f_tipodocumento"; $doc = "cr40f_documento"; $dest = "cr40f_avisodestinatario"
$tipoId = Ensure-Table $tipo "cr40f_TipoDocumento" "Tipo de documento" "Tipos de documento" "Catálogo de documentos controlados (CNH, ASO, CRLV…)"
$docId = Ensure-Table $doc "cr40f_Documento" "Documento" "Documentos" "Documento emitido de funcionário ou veículo, com validade e histórico."
$destId = Ensure-Table $dest "cr40f_AvisoDestinatario" "Destinatário de aviso" "Destinatários de aviso" "Quem recebe os avisos de vencimento por categoria."
if (-not $Apply -and (-not $tipoId -or -not $docId -or -not $destId)) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

# Tipo de documento — valores espelham domain/codes.ts
Ensure-AttributeOn $tipo (Text "cr40f_Codigo" "Código" "Código curto e nome da subpasta (CNH, ASO, CRLV…)" 40)
Ensure-AttributeOn $tipo (Picklist "cr40f_Categoria" "Categoria" "Pessoas ou Frota" @("Pessoas", "Frota") "ApplicationRequired")
Ensure-AttributeOn $tipo (YesNo "cr40f_TemValidade" "Tem validade" "O documento vence?")
Ensure-AttributeOn $tipo @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_ValidadePadraoMeses"; DisplayName = Label "Validade padrão (meses)"; Description = Label "Sugere a validade a partir da emissão"; MinValue = 1; MaxValue = 240; Format = "None" }
Ensure-AttributeOn $tipo (MultiPicklist "cr40f_ObrigatorioPara" "Obrigatório para" "Quem precisa ter este documento" @("Motorista", "Administrativo", "Próprio", "Terceiro", "Aluguel"))
Ensure-AttributeOn $tipo @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Ordem"; DisplayName = Label "Ordem"; Description = Label "Ordem no checklist"; MinValue = 0; MaxValue = 999; Format = "None" }

# Documento
Ensure-AttributeOn $doc (Text "cr40f_Numero" "Número" "Número do documento" 100)
Ensure-AttributeOn $doc (DateOnly "cr40f_Emissao" "Emissão" "Data de emissão")
Ensure-AttributeOn $doc (DateOnly "cr40f_Validade" "Validade" "Data de vencimento")
Ensure-AttributeOn $doc (Picklist "cr40f_Situacao" "Situação" "Vigente ou substituído por renovação" @("Vigente", "Substituído") "ApplicationRequired")
Ensure-AttributeOn $doc (Text "cr40f_Pasta" "Pasta" "Caminho da pasta no SharePoint" 400)
Ensure-AttributeOn $doc @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Observacao"; DisplayName = Label "Observação"; Description = Label "Seguradora, valor do IPVA etc."; MaxLength = 2000; Format = "TextArea" }
Ensure-AttributeOn $doc (Picklist "cr40f_UltimoMarcoAvisado" "Último marco avisado" "Controle anti-repetição dos e-mails" @("60 dias", "30 dias", "7 dias", "Vencido"))
Ensure-AttributeOn $doc @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_UltimoAvisoEm"; DisplayName = Label "Último aviso em"; Description = Label "Quando o último e-mail foi enviado"; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }
Ensure-Lookup "cr40f_tipodocumento_cr40f_documento_tipo" $tipo $doc "cr40f_Tipo" "Tipo" "Tipo do documento" "Restrict"
Ensure-Lookup "cr40f_funcionarios_cr40f_documento_funcionario" "cr40f_funcionarios" $doc "cr40f_Funcionario" "Funcionário" "Dono do documento (pessoas)" "Cascade"
Ensure-Lookup "cr40f_veiculos_cr40f_documento_veiculo" "cr40f_veiculos" $doc "cr40f_Veiculo" "Veículo" "Dono do documento (frota)" "Cascade"

# Destinatário
Ensure-AttributeOn $dest (Picklist "cr40f_Categoria" "Categoria" "Pessoas ou Frota" @("Pessoas", "Frota") "ApplicationRequired")
Ensure-Lookup "cr40f_funcionarios_cr40f_avisodestinatario_funcionario" "cr40f_funcionarios" $dest "cr40f_Funcionario" "Funcionário" "Quem recebe o aviso" "Cascade"
```

- [ ] **Step 3: Publicar, validar e semear tipos**

```powershell
if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$tipo</entity><entity>$doc</entity><entity>$dest</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $tipo = @("cr40f_name", "cr40f_codigo", "cr40f_categoria", "cr40f_temvalidade", "cr40f_validadepadraomeses", "cr40f_obrigatoriopara", "cr40f_ordem")
    $doc = @("cr40f_name", "cr40f_numero", "cr40f_emissao", "cr40f_validade", "cr40f_situacao", "cr40f_pasta", "cr40f_observacao", "cr40f_ultimomarcoavisado", "cr40f_ultimoavisoem", "cr40f_tipo", "cr40f_funcionario", "cr40f_veiculo")
    $dest = @("cr40f_name", "cr40f_categoria", "cr40f_funcionario")
  }
  $missing = @(); foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @($tipoId, $docId, $destId)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $t and componenttype eq 1").Count -eq 0) { throw "Tabela $t nao esta na solucao $SolutionUniqueName." }
  }

  # Seed: Pessoas 100000000 / Frota 100000001; obrigatorio: 100000000 Motorista, 100000001 Administrativo, 100000002 Proprio, 100000003 Terceiro, 100000004 Aluguel
  $set = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$tipo')?`$select=EntitySetName").EntitySetName
  $seed = @(
    @("CNH", "CNH", 100000000, $true, $null, "100000000", 1),
    @("ASO", "ASO", 100000000, $true, 12, "100000000,100000001", 2),
    @("ANTECEDENTES", "Antecedentes criminais", 100000000, $true, $null, "100000000", 3),
    @("CERTIDAO", "Certidões", 100000000, $true, $null, $null, 4),
    @("RG", "RG", 100000000, $false, $null, "100000000,100000001", 5),
    @("CPF", "CPF", 100000000, $false, $null, "100000000,100000001", 6),
    @("RESIDENCIA", "Comprovante de residência", 100000000, $false, $null, "100000000,100000001", 7),
    @("CONTRATO", "Contrato", 100000000, $false, $null, "100000000,100000001", 8),
    @("CRLV", "CRLV / Licenciamento", 100000001, $true, $null, "100000002,100000003,100000004", 1),
    @("IPVA", "IPVA", 100000001, $true, $null, "100000002", 2),
    @("SEGURO", "Seguro", 100000001, $true, $null, "100000002,100000003,100000004", 3)
  )
  foreach ($s in $seed) {
    if (@(Get-Rows $set "cr40f_tipodocumentoid" "cr40f_codigo eq '$($s[0])'").Count -gt 0) { continue }
    Invoke-Dataverse "POST" $set @{ cr40f_codigo = $s[0]; cr40f_name = $s[1]; cr40f_categoria = $s[2]; cr40f_temvalidade = $s[3]; cr40f_validadepadraomeses = $s[4]; cr40f_obrigatoriopara = $s[5]; cr40f_ordem = $s[6] } | Out-Null
    Write-Step "tipo criado $($s[0])"
  }
  Write-Step "SCHEMA OK: tabelas publicadas, na solucao $SolutionUniqueName e tipos semeados"
}
else { Write-Step "DRY RUN OK; use -Apply" }
```

- [ ] **Step 4: Dry run (Claude pode rodar se o `.env` existir; senão o Renan roda)**

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-documentos.ps1 -DeviceCode
```

Expected: linhas `DRY RUN criaria …` e `DRY RUN OK; use -Apply`; nenhum erro de host bloqueado (o script recusa PROD via `DV_BLOCKED_HOSTS`).

- [ ] **Step 5: Aplicar no DEV — só com ok explícito do Renan**

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-documentos.ps1 -Apply -DeviceCode
```

Expected: `SCHEMA OK …`. Validar com MCP `Dataverse_DEV`: `describe tables/cr40f_documento` lista as colunas e lookups; `SELECT cr40f_codigo, cr40f_categoria FROM cr40f_tipodocumento` devolve 11 linhas. Conferir as navigation properties reais (`cr40f_Tipo`, `cr40f_Funcionario`, `cr40f_Veiculo`) com `EntityDefinitions(LogicalName='cr40f_documento')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName`; se diferirem, ajustar `NAV` em `data/queries.ts` e o teste da Task 4.

- [ ] **Step 6: Commit**

```bash
git add packages/deploy/provision-documentos.ps1
git commit -m "feat(documentos): provisionamento das tabelas de documentos no DEV com tipos iniciais"
```

---

### Task 15: Migração de CNH e ASO existentes

**Files:**
- Create: `packages/deploy/migrar-documentos.ps1` (UTF-8 com BOM)

**Interfaces:**
- Consumes: tabelas e tipos da Task 14.
- Produces: um `cr40f_documento` Vigente por funcionário com `cr40f_validadedacnh` (CNH) e por funcionário com `cr40f_datadoaso` (ASO: emissão = data do ASO, validade = +12 meses). Idempotente.

- [ ] **Step 1: Script**

Mesmo cabeçalho/helpers da Task 14 (linhas 1–108 da Escala, com `$root` de `packages/deploy`), sem `Ensure-*`. Corpo:

```powershell
$tipoSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_tipodocumento')?`$select=EntitySetName").EntitySetName
$docSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_documento')?`$select=EntitySetName").EntitySetName
$funcSet = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='cr40f_funcionarios')?`$select=EntitySetName").EntitySetName
# Mesma regra de getDataverseEnvironmentLabel (pages/funcionarios/data/dataverse.ts:24-29)
$envLabel = switch ($environmentHost) { 'org23b93544.crm2.dynamics.com' { 'DEV' } 'orgf261ae8e.crm2.dynamics.com' { 'PROD' } default { 'Dataverse' } }

$tipos = @{}
foreach ($t in Get-Rows $tipoSet "cr40f_tipodocumentoid,cr40f_codigo" "cr40f_codigo eq 'CNH' or cr40f_codigo eq 'ASO'") { $tipos[$t.cr40f_codigo] = $t.cr40f_tipodocumentoid }
if (-not $tipos.CNH -or -not $tipos.ASO) { throw "Tipos CNH/ASO ausentes. Rode provision-documentos.ps1 -Apply antes." }

$existentes = @{}
foreach ($d in Get-Rows $docSet "_cr40f_tipo_value,_cr40f_funcionario_value" "cr40f_situacao eq 100000000 and _cr40f_funcionario_value ne null") { $existentes["$($d._cr40f_funcionario_value)|$($d._cr40f_tipo_value)"] = $true }

$funcs = Get-Rows $funcSet "cr40f_funcionariosid,new_apelido,cr40f_nomecompleto,cr40f_validadedacnh,cr40f_datadoaso" "statecode eq 0 and (cr40f_validadedacnh ne null or cr40f_datadoaso ne null)"
$criados = 0; $pulados = 0
foreach ($f in $funcs) {
  $nome = if ($f.new_apelido) { $f.new_apelido } else { $f.cr40f_nomecompleto }
  $pasta = "Funcionarios/$(if ($envLabel -eq 'DEV') { 'DEV/' })$($f.cr40f_funcionariosid)/Documentos"
  $itens = @()
  if ($f.cr40f_validadedacnh) { $itens += @{ codigo = "CNH"; emissao = $null; validade = $f.cr40f_validadedacnh } }
  if ($f.cr40f_datadoaso) { $itens += @{ codigo = "ASO"; emissao = $f.cr40f_datadoaso; validade = ([datetime]::ParseExact($f.cr40f_datadoaso.Substring(0, 10), 'yyyy-MM-dd', $null)).AddMonths(12).ToString('yyyy-MM-dd') } }
  foreach ($i in $itens) {
    $tid = $tipos[$i.codigo]
    if ($existentes.ContainsKey("$($f.cr40f_funcionariosid)|$tid")) { $pulados++; continue }
    $body = @{
      cr40f_name = "$($i.codigo) · $nome"; cr40f_emissao = $i.emissao; cr40f_validade = $i.validade.Substring(0, 10); cr40f_situacao = 100000000
      cr40f_pasta = "$pasta/$($i.codigo)"; cr40f_observacao = "Migrado da ficha do funcionário em $(Get-Date -Format 'dd/MM/yyyy')"
      "cr40f_Tipo@odata.bind" = "/$tipoSet($tid)"; "cr40f_Funcionario@odata.bind" = "/$funcSet($($f.cr40f_funcionariosid))"
    }
    if ($Apply) { Invoke-Dataverse "POST" $docSet $body | Out-Null }
    $criados++
    Write-Step "$(if ($Apply) { 'criado' } else { 'DRY RUN criaria' }) $($i.codigo) · $nome"
  }
}
Write-Step "$(if ($Apply) { 'MIGRACAO OK' } else { 'DRY RUN OK' }): $criados a criar/criados, $pulados ja existiam"
```

- [ ] **Step 2: Dry run no DEV e conferência**

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packages/deploy/migrar-documentos.ps1 -DeviceCode
```

Expected: uma linha por CNH/ASO a criar e o total. Comparar o total com `SELECT COUNT(cr40f_validadedacnh), COUNT(cr40f_datadoaso) FROM cr40f_funcionarios WHERE statecode = 0` no MCP `Dataverse_DEV`.

- [ ] **Step 3: Aplicar no DEV — só com ok do Renan; rodar duas vezes**

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packages/deploy/migrar-documentos.ps1 -Apply -DeviceCode
```

Expected: 1ª execução `MIGRACAO OK: N …, 0 ja existiam`; 2ª execução `0 …, N ja existiam` (idempotência provada).

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/migrar-documentos.ps1
git commit -m "feat(documentos): migração idempotente de CNH e ASO da ficha para cr40f_documento"
```

---

### Task 16: Verificação final e publicação no DEV

**Files:** nenhum novo (só build/versão gerados pelo `pnpm push`).

- [ ] **Step 1: Suíte e tipos**

Run: `pnpm test` e `pnpm typecheck`
Expected: tudo verde. Anotar o total de testes do shell.

- [ ] **Step 2: Verificação no navegador em mock**

`preview_start` do dev server do shell (porta reservada 36472; conferir se outra worktree a ocupa antes — `dev-restart.mjs` falha com PID e comando se for outro serviço). Conferir em `#/documentos`:
1. KPIs Pessoas: Vencidos 1 · Até 7 dias 1 · 8 a 30 dias 1 · 31 a 60 dias 1 · Faltando ≥ 1; clique filtra e grava `kpi=` na URL.
2. Aba Frota mostra ABC1D23 (CRLV até 7 dias; IPVA vencido) e EFG4H56.
3. Renovar: emissão preenche validade sugerida (ASO); Esc com alteração abre "Descartar alterações?"; salvar mostra toast e a linha sai/atualiza.
4. Configurações: novo tipo e destinatário.
5. `#/funcionarios?ficha=<id>&secao=documentos` mostra checklist + "Outros arquivos"; ficha da Frota mostra seção Documentos.
6. Badge "Documentos" no menu = 4 no mock.
7. Largura de celular (375 px): KPIs em 2 colunas, cartões no lugar da tabela, sem rolagem horizontal.
8. Console sem erros. Rodapé mostra a versão `vX.Y.Z · dd/mm/aaaa HH:mm`.

Screenshot da central como prova.

- [ ] **Step 3: Publicar no DEV — só com ok do Renan**

Pré-requisitos: Tasks 14 e 15 aplicadas no DEV; `.env` copiado pelo Renan para a worktree.

```bash
pnpm push
```

Expected: build incrementa o PATCH em `apps/shell/package.json`, publica `cr40f_SistemaBetinhos.html` no DEV. Informar ao Renan a versão publicada.

- [ ] **Step 4: Teste autenticado no DEV (com o Renan logado)**

Na central em DEV: dados reais aparecem (45 motoristas → faltantes de RG/CPF etc. esperados); renovar a CNH de um funcionário de teste com um PDF pequeno → conferir no Dataverse DEV o novo `cr40f_documento` Vigente, o anterior Substituído, `cr40f_validadedacnh` atualizado e o arquivo em `Funcionarios/DEV/<id>/Documentos/CNH` no SharePoint. Registrar o que não foi possível validar.

- [ ] **Step 5: Commit do build**

```bash
git add apps/shell/package.json pnpm-lock.yaml
git commit -m "build: Sistema Betinhos vX.Y.Z publicado no DEV (gestão de documentos)"
```

(`vX.Y.Z` = versão gerada pelo `bump-version.mjs`; conferir `git diff --cached` antes — só versão e data de build.)

---

## Fora deste plano (Entrega 2 — plano próprio)

Flows "Documentos | Aviso diário" e "Documentos | Resumo semanal", variáveis `new_URLSistemaBetinhos` e `new_EmailAdminAvisos`, provisionamento por az CLI no padrão de `packages/deploy/provision-flow-consultar-onedrive.ps1`, teste no DEV com documentos em 60/30/7/−1 dias. Começa depois da Task 16 validada.
