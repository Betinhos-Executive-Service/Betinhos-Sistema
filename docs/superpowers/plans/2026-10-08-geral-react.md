# Geral (lista editável de serviços) em React — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** substituir a lista nativa "Geral" de `cr40f_reservadeveculos` pela rota React `#/geral` do shell, com visões e colunas lidas do Dataverse, motor FetchXML no servidor e edição na célula com feedback inline. O formulário continua sendo o WebResource Formulário Geral.

**Arquitetura:**
- Domínio puro e testado em `apps/shell/src/pages/geral/domain` (FetchXML, layout, células, formatação, edição, colunas, texto de cópia).
- `Source` com duas implementações: Dataverse (Web API `?fetchXml=`) e mock em memória para o `pnpm dev`.
- Hook `useGeral` cuida de visão ativa, página, ordenação, busca, seleção e estado de cada célula.
- UI com `@betinhos/ui` (`PageHeader`, `PageToolbar`, `Select`, `Input`, `Textarea`, `Switch`, `Dialog`, `Drawer`, `Sheet`, `Menu`, `Pagination`, `StatusBadge`, `Spinner`, `Tooltip`, `EmptyState`, `Alert`).

**Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 3 (`// @vitest-environment jsdom` nos testes que usam `DOMParser` ou React), lucide-react, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-10-08-geral-react-design.md`. Leia antes de começar. Leia também `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` inteiro antes de qualquer tarefa de UI (Tarefas 9 a 12).

## Restrições globais

- Toda resposta sobre UI começa com `DESIGN CONTEXTO`.
- Fuso `America/Sao_Paulo`, offset fixo `-03:00`. Datas `dd/mm/aaaa HH:mm`. Moeda `R$ 1.234,00` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- Visual: só tokens `--bt-*` do Design System 1.4.0 (arquivo `packages/ui/src/design-tokens.css`). Nenhuma cor nova, nenhum gradiente, sem dark mode. Cabeçalhos neutros em `var(--bt-color-surface-neutral)`. Azul só em foco, seleção, status, ícones e ações.
- Motion: anima só `transform`, `opacity` e `background-color` da célula; nunca `transition: all`; hover só em `@media (hover: hover) and (pointer: fine)`; pressionar = `scale(.97)`; nenhuma animação em Enter/Tab/Esc; `@media (prefers-reduced-motion: reduce)` remove movimento e mantém ícone.
- Status nunca é comunicado só por cor (ícone com `aria-label` ou texto). Alvos touch de 44 px no celular.
- Textos em pt-BR com acentos. Botões começam com verbo.
- Entity sets vêm de `host.metadata.entities()`; navigation properties de lookup vêm de `ManyToOneRelationships`; nomes primários de `PrimaryNameAttribute`. Nada disso fixo no código, exceto no mock.
- PROD é somente leitura. Escrita só em DEV e só na Tarefa 14, com ok do Renan.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Todos os comandos rodam na raiz da worktree `C:\Users\mendo\Desktop\vscode\Sistema Betinhos\.claude\worktrees\tela-geral-react-9f9bc1`. Testes: `pnpm --filter @betinhos/shell test -- <arquivo>`; typecheck: `pnpm typecheck`.
- Não edite `legacy/`, `apps/escala-fds` nem outras páginas, salvo onde o plano manda (`nav/menu.ts`, `app/RouteLayout.tsx`, `packages/dataverse/src/metadata.ts`).

## Mapa de arquivos

```
packages/dataverse/src/metadata.ts        + attributes(entity) e primaryName em EntityInfo
packages/dataverse/src/dataverse.test.ts  + testes de attributes()

apps/shell/src/pages/geral/
  domain/types.ts        View, Column, AttributeInfo, CellKind, Sort, Page, CellStatus, LookupOption, Reserva (mock)
  domain/layout.ts       parseLayout(layoutxml) -> Column[]; rowKey(column, info)
  domain/fetch.ts        parseFetch, injectSort, injectSearch, injectPaging, serializeFetch, linkEntities, quickFindAttributes
  domain/cells.ts        cellKind(attribute, info, column) e READONLY
  domain/format.ts       formatCell, toDateTimeLocal, fromDateTimeLocal, parseMoney, formatMoney
  domain/edit.ts         validateEdit, buildPatch, LookupBind, reduceCell (máquina de estados)
  domain/columns.ts      loadColumnPrefs, saveColumnPrefs, applyColumnPrefs, KV
  domain/copy.ts         copyText(rows) — mesmo bloco do script Copiar Serviços
  data/queries.ts        caminhos e parsers: views, quickFind, attributes, fetch page, paging cookie, search de lookup
  data/mock.ts           3 visões, ~60 reservas, motoristas, veículos, clientes, pessoas
  data/source.ts         Source (Dataverse e mock), openForm, openVoucher
  useGeral.ts            estado da página
  components/GeralToolbar.tsx   visão, busca, colunas, comandos sobre selecionados, menu "⋮"
  components/ColumnsMenu.tsx    mostrar/ocultar/reordenar colunas
  components/GeralTable.tsx     grid com cabeçalho ordenável, seleção e células
  components/Cell.tsx           célula: leitura, edição por tipo, feedback inline
  components/GeralCards.tsx     cards (≤ 820 px)
  components/GeralSheet.tsx     edição da linha no celular
  components/Dialogs.tsx        Copiar Serviços, Desativar/Ativar, aviso de formulário em mock
  components/VoucherOverlay.tsx overlay com iframe do voucher
  components/EscalaFdsDrawer.tsx Drawer wide com iframe da Escala FDS
  GeralPage.tsx
  GeralPage.test.tsx
  geral.css

apps/shell/src/nav/menu.ts        item 'geral' no lugar de table('cr40f_reservadeveculos')
apps/shell/src/nav/menu.test.ts   + teste da rota
apps/shell/src/app/RouteLayout.tsx + GeralPage
```

---

### Tarefa 0: Preparação

**Arquivos:** nenhum editado.

- [ ] **Passo 1: instalar e conferir a base**

```bash
pnpm install
pnpm typecheck
pnpm --filter @betinhos/shell test
pnpm --filter @betinhos/dataverse test
```
Esperado: tudo verde. Se algo falhar, pare e reporte antes de continuar.

- [ ] **Passo 2: ler a spec e o Design System**

Leia `docs/superpowers/specs/2026-10-08-geral-react-design.md` inteira e `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` inteiro. Não há commit nesta tarefa.

---

### Tarefa 1: Metadata de atributos no `@betinhos/dataverse`

**Arquivos:**
- Modificar: `packages/dataverse/src/metadata.ts`
- Modificar: `packages/dataverse/src/index.ts`
- Testar: `packages/dataverse/src/dataverse.test.ts`

**Interfaces:**
- Produz: `EntityInfo.primaryName: string`; `createMetadata(client).attributes(entity: string): Promise<AttributeMeta[]>` com
  `type AttributeMeta = { logicalName: string; type: string; label: string; updatable: boolean; targets: string[] }` (`type` é o `AttributeType` do Dataverse: `String`, `Memo`, `DateTime`, `Picklist`, `Lookup`, `Money`, `Boolean`, `Integer`, `Decimal`, `Uniqueidentifier`, `Owner`, `State`, `Status`, `Virtual`, `BigInt`...). Lookups trazem `targets` da coleção `Microsoft.Dynamics.CRM.LookupAttributeMetadata`.

- [ ] **Passo 1: teste que falha**

Acrescente em `packages/dataverse/src/dataverse.test.ts`, dentro de um novo `describe('metadata attributes')`:

```ts
describe('metadata attributes', () => {
  it('lê tipo, rótulo, updatable e alvos de lookup em duas chamadas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [
        { LogicalName: 'cr40f_status', AttributeType: 'Picklist', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Status de Operação' } } },
        { LogicalName: 'cr40f_motorista', AttributeType: 'Lookup', IsValidForUpdate: true, DisplayName: { UserLocalizedLabel: { Label: 'Motorista' } } },
        { LogicalName: 'cr40f_id', AttributeType: 'String', IsValidForUpdate: false, DisplayName: { UserLocalizedLabel: null } },
      ] }))
      .mockResolvedValueOnce(json({ value: [{ LogicalName: 'cr40f_motorista', Targets: ['cr40f_funcionarios'] }] }))
    const meta = createMetadata(createClient('https://org.example', fetchMock))
    const list = await meta.attributes('cr40f_reservadeveculos')
    expect(list).toEqual([
      { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status de Operação', updatable: true, targets: [] },
      { logicalName: 'cr40f_motorista', type: 'Lookup', label: 'Motorista', updatable: true, targets: ['cr40f_funcionarios'] },
      { logicalName: 'cr40f_id', type: 'String', label: 'cr40f_id', updatable: false, targets: [] },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain("EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsValidForUpdate")
    expect(fetchMock.mock.calls[1][0]).toContain('/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets')
    // segunda leitura vem do cache
    await meta.attributes('cr40f_reservadeveculos')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expõe o nome primário da tabela', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ LogicalName: 'cr40f_veiculos', EntitySetName: 'cr40f_veiculoses', PrimaryNameAttribute: 'cr40f_placa', DisplayCollectionName: { UserLocalizedLabel: { Label: 'Veículos' } } }))
    const info = await createMetadata(createClient('https://org.example', fetchMock)).entity('cr40f_veiculos')
    expect(info.primaryName).toBe('cr40f_placa')
    expect(fetchMock.mock.calls[0][0]).toContain('PrimaryNameAttribute')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/dataverse test` — esperado: falha com `attributes is not a function` e `primaryName` undefined.

- [ ] **Passo 3: implementar**

Em `packages/dataverse/src/metadata.ts`:

```ts
export type EntityInfo = { logicalName: string; entitySetName: string; label: string; primaryName: string }

type EntityDefinition = {
  LogicalName: string
  EntitySetName: string
  PrimaryNameAttribute?: string
  DisplayCollectionName?: { UserLocalizedLabel?: { Label?: string } | null }
}

export type AttributeMeta = { logicalName: string; type: string; label: string; updatable: boolean; targets: string[] }

type AttributeDefinition = {
  LogicalName: string
  AttributeType: string
  IsValidForUpdate?: boolean
  DisplayName?: { UserLocalizedLabel?: { Label?: string } | null }
}

const SELECT = '$select=LogicalName,EntitySetName,PrimaryNameAttribute,DisplayCollectionName'
```

Em `toInfo`, acrescente `primaryName: definition.PrimaryNameAttribute ?? ''`.

Antes do `return { entity, entities, choices }`:

```ts
  const attributeCache = new Map<string, Promise<AttributeMeta[]>>()

  /** Tipo, rótulo e alvos de lookup de todas as colunas de uma tabela, em duas chamadas, com cache. */
  function attributes(entityName: string) {
    let list = attributeCache.get(entityName)
    if (!list) {
      const base = `EntityDefinitions(LogicalName='${odataString(entityName)}')/Attributes`
      list = Promise.all([
        client.request<{ value: AttributeDefinition[] }>(`${base}?$select=LogicalName,AttributeType,DisplayName,IsValidForUpdate`),
        client.request<{ value: { LogicalName: string; Targets?: string[] }[] }>(`${base}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`),
      ]).then(([all, lookups]) => {
        const targets = new Map(lookups.value.map((l) => [l.LogicalName, l.Targets ?? []]))
        return all.value.map((a) => ({
          logicalName: a.LogicalName,
          type: a.AttributeType,
          label: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName,
          updatable: a.IsValidForUpdate === true,
          targets: targets.get(a.LogicalName) ?? [],
        }))
      })
      list.catch(() => attributeCache.delete(entityName))
      attributeCache.set(entityName, list)
    }
    return list
  }

  return { entity, entities, choices, attributes }
```

Em `packages/dataverse/src/index.ts`, exporte `type AttributeMeta` junto de `createMetadata`.

- [ ] **Passo 4: rodar testes e typecheck**

`pnpm --filter @betinhos/dataverse test && pnpm typecheck` — esperado: verde. Se algum uso de `EntityInfo` em outra página quebrar por `primaryName` obrigatório, ajuste só os mocks de teste que constroem `EntityInfo` acrescentando `primaryName: ''`.

- [ ] **Passo 5: commit**

```bash
git add packages/dataverse/src/metadata.ts packages/dataverse/src/index.ts packages/dataverse/src/dataverse.test.ts
git commit -m "Dataverse: metadata de atributos (tipo, rótulo, updatable, alvos) e nome primário da tabela

Acrescenta attributes(entity) ao createMetadata, em duas chamadas (Attributes e
LookupAttributeMetadata) com cache por tabela, e PrimaryNameAttribute em EntityInfo.
Base para a tela Geral decidir o tipo de cada célula e buscar lookups pelo nome real.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 2: Tipos e layout das colunas

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/domain/types.ts`
- Criar: `apps/shell/src/pages/geral/domain/layout.ts`
- Testar: `apps/shell/src/pages/geral/domain/layout.test.ts`

**Interfaces:**
- Produz `types.ts`:

```ts
import type { AttributeMeta, ChoiceOption, Row } from '@betinhos/dataverse'

export type ViewGroup = 'sistema' | 'minhas'
export type View = { id: string; nome: string; grupo: ViewGroup; fetchxml: string; layoutxml: string; padrao: boolean }

/** Coluna do layoutxml. `alias` e `entity` só em colunas de link-entity (`alias.atributo`). */
export type Column = { key: string; attribute: string; alias: string | null; entity: string | null; width: number }

export type CellKind = 'choice' | 'lookup' | 'datetime' | 'text' | 'memo' | 'money' | 'boolean' | 'readonly'

/** Metadata de um atributo mais as opções de choice/boolean já carregadas. */
export type AttributeInfo = AttributeMeta & { options: ChoiceOption[] }
export type AttributeMap = Map<string, AttributeInfo>

export type Sort = { attribute: string; alias: string | null; descending: boolean } | null
export type Page = { rows: Row[]; cookie: string | null; more: boolean; total: number | null }

export type CellStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

export type LookupOption = { id: string; nome: string }
export type LookupBind = { nav: string; set: string }

export const ENTITY = 'cr40f_reservadeveculos'
export const ID_ATTRIBUTE = 'cr40f_reservadeveculosid'
export const PAGE_SIZE = 50
```

- Produz `layout.ts`: `parseLayout(layoutxml: string): Column[]`, `columnLabel(column, info: AttributeInfo | undefined): string`, `rowKey(column, info: AttributeInfo | undefined): string`.

- [ ] **Passo 1: teste que falha**

`apps/shell/src/pages/geral/domain/layout.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { columnLabel, parseLayout, rowKey } from './layout'
import type { AttributeInfo } from './types'

const LAYOUT = `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">
<cell name="cr40f_id" width="100" /><cell name="cr40f_status" width="120" /><cell name="cr40f_motorista" width="150" />
<cell name="a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal" width="110" /><cell name="createdon" width="130" ishidden="1" />
</row></grid>`

const info = (type: string, label: string): AttributeInfo => ({ logicalName: 'x', type, label, updatable: true, targets: [], options: [] })

describe('layout', () => {
  it('lê colunas na ordem, com largura, alias e sem as ocultas', () => {
    expect(parseLayout(LAYOUT)).toEqual([
      { key: 'cr40f_id', attribute: 'cr40f_id', alias: null, entity: null, width: 100 },
      { key: 'cr40f_status', attribute: 'cr40f_status', alias: null, entity: null, width: 120 },
      { key: 'cr40f_motorista', attribute: 'cr40f_motorista', alias: null, entity: null, width: 150 },
      { key: 'a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal', attribute: 'new_valortotal', alias: 'a_2b630d980aca46fc8dedc3c3ffe23fcf', entity: null, width: 110 },
    ])
  })

  it('layout inválido vira lista vazia', () => {
    expect(parseLayout('')).toEqual([])
    expect(parseLayout('<grid>')).toEqual([])
  })

  it('chave da linha: lookup usa _x_value; link usa alias.atributo', () => {
    const [id, , motorista, total] = parseLayout(LAYOUT)
    expect(rowKey(id, info('String', 'ID'))).toBe('cr40f_id')
    expect(rowKey(motorista, info('Lookup', 'Motorista'))).toBe('_cr40f_motorista_value')
    expect(rowKey(total, undefined)).toBe('a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal')
  })

  it('rótulo vem da metadata e cai no nome lógico', () => {
    const [id, , , total] = parseLayout(LAYOUT)
    expect(columnLabel(id, info('String', 'ID'))).toBe('ID')
    expect(columnLabel(total, undefined)).toBe('new_valortotal')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell test -- layout` — esperado: falha por módulo inexistente.

- [ ] **Passo 3: implementar**

Crie `types.ts` com o conteúdo da seção Interfaces. Crie `layout.ts`:

```ts
import type { AttributeInfo, Column } from './types'

/** Colunas do `layoutxml` de uma visão, na ordem do grid, sem as marcadas `ishidden`. */
export function parseLayout(layoutxml: string): Column[] {
  if (!layoutxml.trim()) return []
  const doc = new DOMParser().parseFromString(layoutxml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) return []
  return Array.from(doc.querySelectorAll('row > cell'))
    .filter((cell) => cell.getAttribute('ishidden') !== '1')
    .flatMap((cell) => {
      const name = cell.getAttribute('name') ?? ''
      if (!name) return []
      const dot = name.indexOf('.')
      const alias = dot > 0 ? name.slice(0, dot) : null
      const attribute = dot > 0 ? name.slice(dot + 1) : name
      const width = Number(cell.getAttribute('width')) || 120
      return [{ key: name, attribute, alias, entity: null, width }]
    })
}

/** Chave do valor na linha da Web API: lookup vem como `_x_value`; coluna de link vem como `alias.atributo`. */
export function rowKey(column: Column, info: AttributeInfo | undefined) {
  if (column.alias) return column.key
  return info && (info.type === 'Lookup' || info.type === 'Customer' || info.type === 'Owner') ? `_${column.attribute}_value` : column.attribute
}

export function columnLabel(column: Column, info: AttributeInfo | undefined) {
  return info?.label || column.attribute
}
```

- [ ] **Passo 4: rodar testes**

`pnpm --filter @betinhos/shell test -- layout` — esperado: verde.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/domain/types.ts apps/shell/src/pages/geral/domain/layout.ts apps/shell/src/pages/geral/domain/layout.test.ts
git commit -m "Geral: tipos do domínio e leitura das colunas do layoutxml da visão

Define View, Column, AttributeInfo, Sort, Page, CellStatus e constantes da tabela, e
parseLayout/rowKey/columnLabel para transformar o layoutxml de uma visão em colunas
com largura, alias de link-entity e a chave do valor na resposta da Web API.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 3: Motor FetchXML

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/domain/fetch.ts`
- Testar: `apps/shell/src/pages/geral/domain/fetch.test.ts`

**Interfaces:**
- Produz:
  - `buildFetch(fetchxml: string, opts: { page: number; pageSize: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }): string` — FetchXML pronto para a Web API.
  - `linkEntities(fetchxml: string): { alias: string; name: string }[]` — para carregar metadata das tabelas ligadas.
  - `quickFindAttributes(fetchxml: string): string[]` — atributos do filtro `isquickfindfields="1"` cujo `value` é `{0}`.
  - `defaultSort(fetchxml: string): Sort` — primeiro `<order>` da entidade raiz, ou `null`.

- [ ] **Passo 1: teste que falha**

`apps/shell/src/pages/geral/domain/fetch.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildFetch, defaultSort, linkEntities, quickFindAttributes } from './fetch'

const AGENDA = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="25" page="3" paging-cookie="x" returntotalrecordcount="false">
<entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /><attribute name="cr40f_status" /><attribute name="cr40f_dataehorriodesada" />
<order attribute="cr40f_dataehorriodesada" descending="false" />
<filter type="and"><condition attribute="cr40f_dataehorriodesada" operator="next-x-years" value="3" /></filter>
<link-entity name="cr40f_composicaodeprecos" from="cr40f_composicaodeprecosid" to="new_composicaodepreco" link-type="outer" alias="a_2b63"><attribute name="new_valortotal" /></link-entity>
</entity></fetch>`

const QUICK = `<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" />
<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>
<filter type="or" isquickfindfields="1"><condition attribute="new_visualizacaodomotorista" operator="on" value="{3}" /><condition attribute="cr40f_veiculo" operator="like" value="{0}" /><condition attribute="cr40f_trajeto" operator="like" value="{0}" /><condition attribute="cr40f_id" operator="like" value="{0}" /></filter>
</entity></fetch>`

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml')
const base = { page: 1, pageSize: 50, cookie: null, sort: null, query: '', quickFind: [] as string[] }

describe('buildFetch', () => {
  it('troca paginação, pede total e preserva filtro, ordem e link-entity', () => {
    const doc = parse(buildFetch(AGENDA, base))
    const fetch = doc.documentElement
    expect(fetch.getAttribute('count')).toBe('50')
    expect(fetch.getAttribute('page')).toBe('1')
    expect(fetch.getAttribute('paging-cookie')).toBeNull()
    expect(fetch.getAttribute('returntotalrecordcount')).toBe('true')
    expect(doc.querySelectorAll('entity > filter > condition').length).toBe(1)
    expect(doc.querySelector('entity > order')?.getAttribute('attribute')).toBe('cr40f_dataehorriodesada')
    expect(doc.querySelector('link-entity')?.getAttribute('alias')).toBe('a_2b63')
  })

  it('página 2 leva o cookie e o número', () => {
    const fetch = parse(buildFetch(AGENDA, { ...base, page: 2, cookie: '<cookie page="1"><cr40f_id last="OS-1" /></cookie>' })).documentElement
    expect(fetch.getAttribute('page')).toBe('2')
    expect(fetch.getAttribute('paging-cookie')).toBe('<cookie page="1"><cr40f_id last="OS-1" /></cookie>')
  })

  it('ordenação da coluna substitui a ordem da visão', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, sort: { attribute: 'cr40f_status', alias: null, descending: true } }))
    const orders = doc.querySelectorAll('entity > order')
    expect(orders.length).toBe(1)
    expect(orders[0].getAttribute('attribute')).toBe('cr40f_status')
    expect(orders[0].getAttribute('descending')).toBe('true')
  })

  it('ordenação por coluna de link entra dentro do link-entity', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, sort: { attribute: 'new_valortotal', alias: 'a_2b63', descending: false } }))
    expect(doc.querySelectorAll('entity > order').length).toBe(0)
    expect(doc.querySelector('link-entity > order')?.getAttribute('attribute')).toBe('new_valortotal')
  })

  it('busca vira filtro OR com like nos campos de localização rápida', () => {
    const doc = parse(buildFetch(AGENDA, { ...base, query: "OS-19 d'água", quickFind: ['cr40f_id', 'cr40f_trajeto'] }))
    const filters = doc.querySelectorAll('entity > filter')
    expect(filters.length).toBe(2)
    const or = filters[1]
    expect(or.getAttribute('type')).toBe('or')
    const conditions = Array.from(or.querySelectorAll('condition'))
    expect(conditions.map((c) => c.getAttribute('attribute'))).toEqual(['cr40f_id', 'cr40f_trajeto'])
    expect(conditions[0].getAttribute('operator')).toBe('like')
    expect(conditions[0].getAttribute('value')).toBe("%OS-19 d'água%")
  })

  it('busca vazia ou sem campos não acrescenta filtro', () => {
    expect(parse(buildFetch(AGENDA, { ...base, query: '   ', quickFind: ['cr40f_id'] })).querySelectorAll('entity > filter').length).toBe(1)
    expect(parse(buildFetch(AGENDA, { ...base, query: 'x', quickFind: [] })).querySelectorAll('entity > filter').length).toBe(1)
  })

  it('FetchXML inválido lança erro legível', () => {
    expect(() => buildFetch('<fetch><entity>', base)).toThrow('FetchXML da visão inválido.')
  })
})

describe('leitura da visão', () => {
  it('lista link-entities com alias e tabela', () => {
    expect(linkEntities(AGENDA)).toEqual([{ alias: 'a_2b63', name: 'cr40f_composicaodeprecos' }])
    expect(linkEntities(QUICK)).toEqual([])
  })
  it('campos de localização rápida são os com value {0}', () => {
    expect(quickFindAttributes(QUICK)).toEqual(['cr40f_veiculo', 'cr40f_trajeto', 'cr40f_id'])
  })
  it('ordem padrão é o primeiro order da raiz', () => {
    expect(defaultSort(AGENDA)).toEqual({ attribute: 'cr40f_dataehorriodesada', alias: null, descending: false })
    expect(defaultSort(QUICK)).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell test -- fetch.test` — esperado: módulo inexistente.

- [ ] **Passo 3: implementar**

`apps/shell/src/pages/geral/domain/fetch.ts`:

```ts
import type { Sort } from './types'

type BuildOptions = { page: number; pageSize: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }

function parse(fetchxml: string) {
  const doc = new DOMParser().parseFromString(fetchxml, 'text/xml')
  const root = doc.documentElement
  const entity = root?.tagName === 'fetch' ? Array.from(root.children).find((c) => c.tagName === 'entity') : undefined
  if (!root || doc.getElementsByTagName('parsererror').length || !entity) throw new Error('FetchXML da visão inválido.')
  return { doc, root, entity }
}

/** FetchXML da visão com paginação, ordenação da coluna e busca por palavra-chave injetadas; o resto fica intacto. */
export function buildFetch(fetchxml: string, { page, pageSize, cookie, sort, query, quickFind }: BuildOptions) {
  const { doc, root, entity } = parse(fetchxml)

  for (const name of ['count', 'page', 'paging-cookie', 'returntotalrecordcount']) root.removeAttribute(name)
  root.setAttribute('count', String(pageSize))
  root.setAttribute('page', String(page))
  if (cookie) root.setAttribute('paging-cookie', cookie)
  root.setAttribute('returntotalrecordcount', 'true')

  if (sort) {
    for (const order of Array.from(entity.children).filter((c) => c.tagName === 'order')) order.remove()
    const order = doc.createElement('order')
    order.setAttribute('attribute', sort.attribute)
    order.setAttribute('descending', String(sort.descending))
    const link = sort.alias ? Array.from(entity.querySelectorAll('link-entity')).find((l) => l.getAttribute('alias') === sort.alias) : null
    if (sort.alias && !link) throw new Error(`Coluna ${sort.alias}.${sort.attribute} não pertence a esta visão.`)
    ;(link ?? entity).appendChild(order)
  }

  const text = query.trim()
  if (text && quickFind.length) {
    const filter = doc.createElement('filter')
    filter.setAttribute('type', 'or')
    for (const attribute of quickFind) {
      const condition = doc.createElement('condition')
      condition.setAttribute('attribute', attribute)
      condition.setAttribute('operator', 'like')
      condition.setAttribute('value', `%${text}%`)
      filter.appendChild(condition)
    }
    entity.appendChild(filter)
  }

  return new XMLSerializer().serializeToString(doc)
}

export function linkEntities(fetchxml: string) {
  const { entity } = parse(fetchxml)
  return Array.from(entity.querySelectorAll('link-entity')).flatMap((link) => {
    const alias = link.getAttribute('alias')
    const name = link.getAttribute('name')
    return alias && name ? [{ alias, name }] : []
  })
}

/** Atributos da visão de localização rápida: condições do filtro `isquickfindfields` com valor `{0}`. */
export function quickFindAttributes(fetchxml: string) {
  const { entity } = parse(fetchxml)
  return Array.from(entity.querySelectorAll('filter[isquickfindfields="1"] > condition'))
    .filter((c) => c.getAttribute('value') === '{0}')
    .flatMap((c) => (c.getAttribute('attribute') ? [c.getAttribute('attribute') as string] : []))
}

export function defaultSort(fetchxml: string): Sort {
  const { entity } = parse(fetchxml)
  const order = Array.from(entity.children).find((c) => c.tagName === 'order')
  const attribute = order?.getAttribute('attribute')
  return attribute ? { attribute, alias: null, descending: order?.getAttribute('descending') === 'true' } : null
}
```

- [ ] **Passo 4: rodar testes**

`pnpm --filter @betinhos/shell test -- fetch.test` — esperado: verde.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/domain/fetch.ts apps/shell/src/pages/geral/domain/fetch.test.ts
git commit -m "Geral: motor FetchXML da visão (paginação, ordenação da coluna e busca)

buildFetch injeta count/page/paging-cookie e returntotalrecordcount, substitui a ordem
da visão pela coluna clicada (inclusive dentro de link-entity) e acrescenta o filtro OR
com like nos campos de localização rápida, preservando filtros e links da visão.
linkEntities, quickFindAttributes e defaultSort leem o que a tela precisa da visão.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 4: Tipo da célula e formatação

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/domain/cells.ts`
- Criar: `apps/shell/src/pages/geral/domain/format.ts`
- Testar: `apps/shell/src/pages/geral/domain/cells.test.ts`

**Interfaces:**
- `cells.ts`: `READONLY: ReadonlySet<string>`; `cellKind(column: Column, info: AttributeInfo | undefined): CellKind`; `statusTone(attribute: string, value: number | null): StatusTone` (import de `@betinhos/ui`).
- `format.ts`: `formatCell(kind: CellKind, row: Row, key: string): string`; `toDateTimeLocal(iso: string | null): string` (`YYYY-MM-DDTHH:mm` em São Paulo); `fromDateTimeLocal(local: string): string | null` (ISO UTC); `formatMoney(value: number | null): string`; `parseMoney(text: string): number | null`.

- [ ] **Passo 1: teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { READONLY, cellKind, statusTone } from './cells'
import { formatCell, formatMoney, fromDateTimeLocal, parseMoney, toDateTimeLocal } from './format'
import type { AttributeInfo, Column } from './types'

const col = (attribute: string, alias: string | null = null): Column => ({ key: alias ? `${alias}.${attribute}` : attribute, attribute, alias, entity: null, width: 100 })
const info = (type: string, updatable = true): AttributeInfo => ({ logicalName: 'x', type, label: 'X', updatable, targets: [], options: [] })
const F = '@OData.Community.Display.V1.FormattedValue'

describe('cellKind', () => {
  it('mapeia tipos editáveis', () => {
    expect(cellKind(col('cr40f_status'), info('Picklist'))).toBe('choice')
    expect(cellKind(col('cr40f_motorista'), info('Lookup'))).toBe('lookup')
    expect(cellKind(col('cr40f_dataehorriodesada'), info('DateTime'))).toBe('datetime')
    expect(cellKind(col('cr40f_trajeto'), info('String'))).toBe('text')
    expect(cellKind(col('cr40f_destino'), info('Memo'))).toBe('memo')
    expect(cellKind(col('cr40f_cotao'), info('Money'))).toBe('money')
    expect(cellKind(col('cr40f_receber'), info('Boolean'))).toBe('boolean')
  })
  it('só leitura: lista fixa, não atualizável, sem metadata, link-entity e tipos desconhecidos', () => {
    expect(cellKind(col('cr40f_id'), info('String'))).toBe('readonly')
    expect(cellKind(col('cr40f_passageirosetelefonedecontato'), info('Memo'))).toBe('readonly')
    expect(cellKind(col('new_linkdovoucher'), info('String'))).toBe('readonly')
    expect(cellKind(col('createdon'), info('DateTime', false))).toBe('readonly')
    expect(cellKind(col('cr40f_x'), undefined)).toBe('readonly')
    expect(cellKind(col('new_valortotal', 'a_1'), info('Money'))).toBe('readonly')
    expect(cellKind(col('ownerid'), info('Owner'))).toBe('readonly')
    expect(READONLY.has('cr40f_endereodesada')).toBe(true)
  })
})

describe('statusTone', () => {
  it('status de operação e faturamento têm tom por valor', () => {
    expect(statusTone('cr40f_status', 202410001)).toBe('success')     // Confirmado
    expect(statusTone('cr40f_status', 202410002)).toBe('danger')      // Cancelado
    expect(statusTone('cr40f_status', 100000001)).toBe('warning')     // Requer Análise
    expect(statusTone('cr40f_status', 202410006)).toBe('info')        // Em Execução
    expect(statusTone('cr40f_statusdefaturamento', 202410010)).toBe('success') // Pago
    expect(statusTone('cr40f_statusdefaturamento', 202410012)).toBe('danger')  // Pagamento em atraso
    expect(statusTone('cr40f_statusdefaturamento', 202410005)).toBe('warning') // Pendente
    expect(statusTone('cr40f_tipodeveiculo', 1)).toBe('neutral')
    expect(statusTone('cr40f_status', null)).toBe('neutral')
  })
})

describe('format', () => {
  it('formatCell usa o valor formatado e trata vazios', () => {
    const row = { cr40f_status: 1, [`cr40f_status${F}`]: 'Confirmado', cr40f_receber: true, [`cr40f_receber${F}`]: 'Sim', cr40f_trajeto: null }
    expect(formatCell('choice', row, 'cr40f_status')).toBe('Confirmado')
    expect(formatCell('boolean', row, 'cr40f_receber')).toBe('Sim')
    expect(formatCell('text', row, 'cr40f_trajeto')).toBe('—')
    expect(formatCell('lookup', row, '_cr40f_motorista_value')).toBe('—')
  })
  it('data/hora vai e volta no fuso de São Paulo', () => {
    expect(toDateTimeLocal('2026-10-08T19:00:00Z')).toBe('2026-10-08T16:00')
    expect(fromDateTimeLocal('2026-10-08T16:00')).toBe('2026-10-08T19:00:00.000Z')
    expect(toDateTimeLocal(null)).toBe('')
    expect(fromDateTimeLocal('')).toBeNull()
    expect(fromDateTimeLocal('abc')).toBeNull()
    expect(formatCell('datetime', { d: '2026-10-08T19:00:00Z' }, 'd')).toBe('08/10/2026 16:00')
  })
  it('dinheiro em BRL', () => {
    expect(formatMoney(1234.5)).toBe('R$ 1.234,50')
    expect(formatMoney(null)).toBe('—')
    expect(parseMoney('R$ 1.234,50')).toBe(1234.5)
    expect(parseMoney('1234.5')).toBe(1234.5)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(formatCell('money', { v: 10 }, 'v')).toBe('R$ 10,00')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell test -- cells.test` — esperado: módulos inexistentes.

- [ ] **Passo 3: implementar**

`cells.ts`:

```ts
import type { StatusTone } from '@betinhos/ui'
import type { AttributeInfo, CellKind, Column } from './types'

/** Nunca editáveis na célula: identificação, auditoria, campos VIEW gerados por flow e voucher. */
export const READONLY: ReadonlySet<string> = new Set([
  'cr40f_id', 'cr40f_idjuntado', 'cr40f_idnovo', 'cr40f_reservadeveculosid', 'createdon', 'createdby', 'modifiedon', 'modifiedby', 'ownerid',
  'cr40f_passageirosetelefonedecontato', 'cr40f_endereodesada', 'cr40f_perfildopassageiro', 'new_linkdovoucher', 'statecode', 'statuscode',
])

const KINDS: Record<string, CellKind> = {
  Picklist: 'choice', Lookup: 'lookup', DateTime: 'datetime', String: 'text', Memo: 'memo', Money: 'money', Boolean: 'boolean',
}

export function cellKind(column: Column, info: AttributeInfo | undefined): CellKind {
  if (column.alias || !info || !info.updatable || READONLY.has(column.attribute)) return 'readonly'
  return KINDS[info.type] ?? 'readonly'
}

// Valores reais das choices de cr40f_reservadeveculos (metadata DEV 08/10/2026); rótulos vêm da metadata.
const STATUS: Record<number, StatusTone> = {
  202410001: 'success', 202410005: 'success', 202410008: 'success',            // Confirmado, Programado, Concluído
  202410002: 'danger', 202410010: 'danger',                                    // Cancelado, Cancelado com Ressalvas
  100000001: 'warning', 202410000: 'warning', 202410004: 'warning',            // Requer Análise, Pré-reserva, Solicitado
  202410006: 'info',                                                           // Em Execução
}
const FATURAMENTO: Record<number, StatusTone> = {
  202410010: 'success', 100000001: 'success', 202410008: 'success',            // Pago, Composição Realizada, Faturamento Mensal
  202410012: 'danger', 202410002: 'danger',                                    // Pagamento Em Atraso, Cancelado Com Taxa
  202410005: 'warning', 202410007: 'warning', 202410006: 'warning',            // Pendente, Pagamento Pendente, Pagante em Viagem
}

export function statusTone(attribute: string, value: number | null): StatusTone {
  if (value == null) return 'neutral'
  if (attribute === 'cr40f_status') return STATUS[value] ?? 'neutral'
  if (attribute === 'cr40f_statusdefaturamento') return FATURAMENTO[value] ?? 'neutral'
  return 'neutral'
}
```

`format.ts`:

```ts
import { formatted, type Row } from '@betinhos/dataverse'
import type { CellKind } from './types'

export const TZ = 'America/Sao_Paulo'
const OFFSET = '-03:00'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

export const formatMoney = (value: number | null) => (value == null ? '—' : money.format(value))

export function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '')
  if (!clean) return null
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const parseIso = (iso: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d }

export function formatDateTime(iso: string | null) {
  const d = parseIso(iso)
  return d ? dateTime.format(d).replace(',', '') : '—'
}

/** `YYYY-MM-DDTHH:mm` no horário de São Paulo, para `input type="datetime-local"`. */
export function toDateTimeLocal(iso: string | null) {
  const d = parseIso(iso)
  if (!d) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

export function fromDateTimeLocal(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const d = new Date(`${local}:00${OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function formatCell(kind: CellKind, row: Row, key: string) {
  const raw = row[key]
  if (raw == null || raw === '') return '—'
  if (kind === 'datetime') return formatDateTime(String(raw))
  if (kind === 'money') return typeof raw === 'number' ? formatMoney(raw) : formatted(row, key)
  return formatted(row, key) || '—'
}
```

- [ ] **Passo 4: rodar testes**

`pnpm --filter @betinhos/shell test -- cells.test` — esperado: verde.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/domain/cells.ts apps/shell/src/pages/geral/domain/format.ts apps/shell/src/pages/geral/domain/cells.test.ts
git commit -m "Geral: tipo de cada célula pela metadata e formatação pt-BR

cellKind decide choice/lookup/datetime/text/memo/money/boolean ou só leitura (lista
fixa de ID, auditoria, campos VIEW e voucher; colunas de link-entity; não atualizáveis).
statusTone dá o tom dos badges de status e faturamento pelos valores reais das choices.
format.ts formata valores da Web API e converte datetime-local no fuso de São Paulo.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 5: Edição — validação, patch e máquina de estados da célula

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/domain/edit.ts`
- Testar: `apps/shell/src/pages/geral/domain/edit.test.ts`

**Interfaces:**
- `type EditValue = string | number | boolean | null | LookupOption` (string em text/memo/datetime-local; number em choice/money; boolean em boolean; `LookupOption | null` em lookup).
- `validateEdit(kind: CellKind, value: EditValue): string | null` — mensagem de erro ou `null`.
- `buildPatch(kind: CellKind, attribute: string, value: EditValue, bind?: LookupBind): { patch: Row } | { clearLookup: true } | null` — `null` quando o valor não é gravável.
- `reduceCell(state: CellStatus, event: CellEvent): CellStatus` com `type CellEvent = { type: 'save' } | { type: 'ok'; at: number } | { type: 'fail'; message: string } | { type: 'settle' } | { type: 'reset' }`.
- `SAVED_VISIBLE_MS = 1500`.

- [ ] **Passo 1: teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { SAVED_VISIBLE_MS, buildPatch, reduceCell, validateEdit } from './edit'

describe('validateEdit', () => {
  it('aceita valores válidos e recusa os inválidos com mensagem', () => {
    expect(validateEdit('text', 'Rota A')).toBeNull()
    expect(validateEdit('text', 'x'.repeat(4001))).toBe('Texto acima de 4000 caracteres.')
    expect(validateEdit('money', -1)).toBe('Valor não pode ser negativo.')
    expect(validateEdit('money', null)).toBeNull()
    expect(validateEdit('datetime', '2026-10-08T16:00')).toBeNull()
    expect(validateEdit('datetime', '2026-13-99T99:99')).toBe('Data ou hora inválida.')
    expect(validateEdit('datetime', '')).toBeNull()
    expect(validateEdit('choice', 202410001)).toBeNull()
    expect(validateEdit('lookup', { id: 'a', nome: 'João' })).toBeNull()
    expect(validateEdit('readonly', 'x')).toBe('Este campo não pode ser editado aqui.')
  })
})

describe('buildPatch', () => {
  it('grava só o campo, no formato do tipo', () => {
    expect(buildPatch('text', 'cr40f_trajeto', ' Rota A ')).toEqual({ patch: { cr40f_trajeto: 'Rota A' } })
    expect(buildPatch('text', 'cr40f_trajeto', '')).toEqual({ patch: { cr40f_trajeto: null } })
    expect(buildPatch('choice', 'cr40f_status', 202410001)).toEqual({ patch: { cr40f_status: 202410001 } })
    expect(buildPatch('choice', 'cr40f_status', null)).toEqual({ patch: { cr40f_status: null } })
    expect(buildPatch('money', 'cr40f_cotao', 1234.567)).toEqual({ patch: { cr40f_cotao: 1234.57 } })
    expect(buildPatch('boolean', 'cr40f_receber', true)).toEqual({ patch: { cr40f_receber: true } })
    expect(buildPatch('datetime', 'cr40f_dataehorriodesada', '2026-10-08T16:00')).toEqual({ patch: { cr40f_dataehorriodesada: '2026-10-08T19:00:00.000Z' } })
    expect(buildPatch('datetime', 'cr40f_dataehorriodesada', '')).toEqual({ patch: { cr40f_dataehorriodesada: null } })
  })
  it('lookup usa bind da metadata e limpar vira DELETE da referência', () => {
    const bind = { nav: 'cr40f_Motorista', set: 'cr40f_funcionarioses' }
    expect(buildPatch('lookup', 'cr40f_motorista', { id: '{ABC-1}', nome: 'João' }, bind)).toEqual({ patch: { 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(abc-1)' } })
    expect(buildPatch('lookup', 'cr40f_motorista', null, bind)).toEqual({ clearLookup: true })
    expect(buildPatch('lookup', 'cr40f_motorista', { id: 'x', nome: 'y' })).toBeNull()
    expect(buildPatch('readonly', 'cr40f_id', 'x')).toBeNull()
  })
})

describe('reduceCell', () => {
  it('idle -> saving -> saved -> idle, e erro mantém até reset', () => {
    const saving = reduceCell({ kind: 'idle' }, { type: 'save' })
    expect(saving).toEqual({ kind: 'saving' })
    const saved = reduceCell(saving, { type: 'ok', at: 1000 })
    expect(saved).toEqual({ kind: 'saved', at: 1000 })
    expect(reduceCell(saved, { type: 'settle' })).toEqual({ kind: 'idle' })
    const failed = reduceCell(saving, { type: 'fail', message: 'Sem permissão.' })
    expect(failed).toEqual({ kind: 'error', message: 'Sem permissão.' })
    expect(reduceCell(failed, { type: 'settle' })).toEqual(failed)
    expect(reduceCell(failed, { type: 'reset' })).toEqual({ kind: 'idle' })
    expect(reduceCell(failed, { type: 'save' })).toEqual({ kind: 'saving' })
    expect(SAVED_VISIBLE_MS).toBe(1500)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

`pnpm --filter @betinhos/shell test -- edit.test`

- [ ] **Passo 3: implementar**

```ts
import { cleanId, type Row } from '@betinhos/dataverse'
import { fromDateTimeLocal } from './format'
import type { CellKind, CellStatus, LookupBind, LookupOption } from './types'

export type EditValue = string | number | boolean | null | LookupOption
export type CellEvent = { type: 'save' } | { type: 'ok'; at: number } | { type: 'fail'; message: string } | { type: 'settle' } | { type: 'reset' }

export const SAVED_VISIBLE_MS = 1500
const MAX_TEXT = 4000

export function validateEdit(kind: CellKind, value: EditValue): string | null {
  if (kind === 'readonly') return 'Este campo não pode ser editado aqui.'
  if ((kind === 'text' || kind === 'memo') && typeof value === 'string' && value.length > MAX_TEXT) return `Texto acima de ${MAX_TEXT} caracteres.`
  if (kind === 'money' && typeof value === 'number' && value < 0) return 'Valor não pode ser negativo.'
  if (kind === 'datetime' && typeof value === 'string' && value !== '' && !fromDateTimeLocal(value)) return 'Data ou hora inválida.'
  return null
}

const isLookup = (value: EditValue): value is LookupOption => typeof value === 'object' && value !== null

/** Só o campo alterado, no formato que a Web API espera. `null` quando não há o que gravar. */
export function buildPatch(kind: CellKind, attribute: string, value: EditValue, bind?: LookupBind): { patch: Row } | { clearLookup: true } | null {
  switch (kind) {
    case 'text': case 'memo': {
      const text = typeof value === 'string' ? value.trim() : ''
      return { patch: { [attribute]: text || null } }
    }
    case 'choice': return { patch: { [attribute]: typeof value === 'number' ? value : null } }
    case 'money': return { patch: { [attribute]: typeof value === 'number' ? Math.round(value * 100) / 100 : null } }
    case 'boolean': return { patch: { [attribute]: value === true } }
    case 'datetime': return { patch: { [attribute]: typeof value === 'string' && value ? fromDateTimeLocal(value) : null } }
    case 'lookup': {
      if (!bind) return null
      if (value == null) return { clearLookup: true }
      return isLookup(value) ? { patch: { [`${bind.nav}@odata.bind`]: `/${bind.set}(${cleanId(value.id)})` } } : null
    }
    default: return null
  }
}

export function reduceCell(state: CellStatus, event: CellEvent): CellStatus {
  switch (event.type) {
    case 'save': return { kind: 'saving' }
    case 'ok': return { kind: 'saved', at: event.at }
    case 'fail': return { kind: 'error', message: event.message }
    case 'settle': return state.kind === 'saved' ? { kind: 'idle' } : state
    case 'reset': return { kind: 'idle' }
  }
}
```

- [ ] **Passo 4: rodar testes** — `pnpm --filter @betinhos/shell test -- edit.test`, esperado verde.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/domain/edit.ts apps/shell/src/pages/geral/domain/edit.test.ts
git commit -m "Geral: validação por tipo, patch mínimo e máquina de estados da célula

validateEdit recusa texto longo, valor negativo e data inválida; buildPatch grava só o
campo alterado (texto aparado, choice, dinheiro com 2 casas, boolean, data em UTC,
lookup por @odata.bind da metadata e limpeza por DELETE da referência); reduceCell
modela gravando -> salvo -> idle e erro persistente até reset.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 6: Preferências de colunas e texto de Copiar Serviços

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/domain/columns.ts`
- Criar: `apps/shell/src/pages/geral/domain/copy.ts`
- Testar: `apps/shell/src/pages/geral/domain/columns.test.ts`

**Interfaces:**
- `columns.ts`: `type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`; `type ColumnPrefs = { hidden: string[]; order: string[] }`; `STORAGE_KEY = 'betinhos.geral.colunas.v1'`; `loadColumnPrefs(kv, viewId): ColumnPrefs | null`; `saveColumnPrefs(kv, viewId, prefs | null)`; `applyColumnPrefs(columns: Column[], prefs: ColumnPrefs | null): Column[]`.
- `copy.ts`: `copyText(rows: Row[]): string` — usa chaves `cr40f_dataehorriodesada`, `cr40f_id`, `_cr40f_cliente_value` (formatado), `cr40f_receber`, `cr40f_trajeto`, `cr40f_passageirosetelefonedecontato`, `cr40f_endereodesada`, `cr40f_destino`, `cr40f_obsdeoperao`, `cr40f_perfildopassageiro`; `COPY_SELECT: string[]` com essas colunas para a consulta.

- [ ] **Passo 1: teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, applyColumnPrefs, loadColumnPrefs, saveColumnPrefs } from './columns'
import { COPY_SELECT, copyText } from './copy'
import type { Column } from './types'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } }
const col = (key: string): Column => ({ key, attribute: key, alias: null, entity: null, width: 100 })
const F = '@OData.Community.Display.V1.FormattedValue'

describe('colunas', () => {
  it('salva e lê por visão, ignorando lixo', () => {
    const kv = mem()
    saveColumnPrefs(kv, 'v1', { hidden: ['b'], order: ['c', 'a'] })
    expect(loadColumnPrefs(kv, 'v1')).toEqual({ hidden: ['b'], order: ['c', 'a'] })
    expect(loadColumnPrefs(kv, 'v2')).toBeNull()
    kv.setItem(STORAGE_KEY, '{"v3": {"hidden": "x", "order": [1]}}')
    expect(loadColumnPrefs(kv, 'v3')).toBeNull()
    kv.setItem(STORAGE_KEY, 'não é json')
    expect(loadColumnPrefs(kv, 'v1')).toBeNull()
    saveColumnPrefs(kv, 'v1', null)
    expect(kv.getItem(STORAGE_KEY)).toBe('{}')
  })
  it('aplica ordem e ocultas; colunas novas da visão entram no fim', () => {
    const cols = [col('a'), col('b'), col('c'), col('d')]
    expect(applyColumnPrefs(cols, { hidden: ['b'], order: ['c', 'a'] }).map((c) => c.key)).toEqual(['c', 'a', 'd'])
    expect(applyColumnPrefs(cols, null).map((c) => c.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(applyColumnPrefs(cols, { hidden: ['a', 'b', 'c', 'd'], order: [] }).map((c) => c.key)).toEqual(['a'])
  })
})

describe('copyText', () => {
  it('monta o mesmo bloco do script Copiar Serviços, ordenado por data', () => {
    const rows = [
      { cr40f_dataehorriodesada: '2026-10-09T13:30:00Z', cr40f_id: 'OS-2', _cr40f_cliente_value: 'x', [`_cr40f_cliente_value${F}`]: 'Tenaris', cr40f_receber: false, cr40f_trajeto: 'GRU → Hotel' },
      { cr40f_dataehorriodesada: '2026-10-08T19:00:00Z', cr40f_id: 'OS-1', cr40f_receber: true, cr40f_trajeto: null, cr40f_passageirosetelefonedecontato: 'Ana (11) 9', cr40f_endereodesada: 'Rua A', cr40f_destino: 'Rua B', cr40f_obsdeoperao: 'Placa', cr40f_perfildopassageiro: 'VIP' },
    ]
    expect(copyText(rows)).toBe([
      '*Data:* 08/10/2026 16:00', '*ID:* OS-1', '*Horário:* 16:00', '*Cliente:* —', '*Receber:* ✓', '*Trajeto:* —', '*Passageiro:* Ana (11) 9',
      '*Local de saída:* Rua A', '*Destino:* Rua B', '*Obs ao motorista:* Placa', '*Perfil do Passageiro:* VIP',
      '',
      '*Data:* 09/10/2026 10:30', '*ID:* OS-2', '*Horário:* 10:30', '*Cliente:* Tenaris', '*Receber:* ✗', '*Trajeto:* GRU → Hotel', '*Passageiro:* —',
      '*Local de saída:* —', '*Destino:* —', '*Obs ao motorista:* —', '*Perfil do Passageiro:* —',
    ].join('\n'))
    expect(COPY_SELECT).toContain('_cr40f_cliente_value')
    expect(copyText([])).toBe('')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- columns.test`

- [ ] **Passo 3: implementar**

`columns.ts`:

```ts
import type { Column } from './types'

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ColumnPrefs = { hidden: string[]; order: string[] }
export const STORAGE_KEY = 'betinhos.geral.colunas.v1'

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function readAll(kv: KV): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch { return {} }
}

export function loadColumnPrefs(kv: KV, viewId: string): ColumnPrefs | null {
  const raw = readAll(kv)[viewId]
  if (!raw || typeof raw !== 'object') return null
  const { hidden, order } = raw as Record<string, unknown>
  return strings(hidden) && strings(order) ? { hidden, order } : null
}

export function saveColumnPrefs(kv: KV, viewId: string, prefs: ColumnPrefs | null) {
  const all = readAll(kv)
  if (prefs) all[viewId] = prefs
  else delete all[viewId]
  try { kv.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* sem armazenamento: fica só em memória */ }
}

/** Ordem salva primeiro, depois colunas novas da visão; ocultas saem, mas nunca todas (a primeira fica). */
export function applyColumnPrefs(columns: Column[], prefs: ColumnPrefs | null): Column[] {
  if (!prefs) return columns
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const ordered = [...prefs.order.flatMap((k) => (byKey.get(k) ? [byKey.get(k) as Column] : [])), ...columns.filter((c) => !prefs.order.includes(c.key))]
  const visible = ordered.filter((c) => !prefs.hidden.includes(c.key))
  return visible.length ? visible : ordered.slice(0, 1)
}
```

`copy.ts`:

```ts
import { formatted, type Row } from '@betinhos/dataverse'
import { TZ } from './format'

export const COPY_SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_dataehorriodesada', 'cr40f_id', '_cr40f_cliente_value', 'cr40f_receber', 'cr40f_trajeto',
  'cr40f_passageirosetelefonedecontato', 'cr40f_endereodesada', 'cr40f_destino', 'cr40f_obsdeoperao', 'cr40f_perfildopassageiro',
]

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const date = (v: unknown) => { const d = typeof v === 'string' ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—')

/** Mesmo bloco do WebResource new_ScriptCopiarServicos (texto para WhatsApp), um serviço por bloco, por data. */
export function copyText(rows: Row[]) {
  return [...rows]
    .sort((a, b) => (date(a.cr40f_dataehorriodesada)?.getTime() ?? 0) - (date(b.cr40f_dataehorriodesada)?.getTime() ?? 0))
    .map((r) => {
      const d = date(r.cr40f_dataehorriodesada)
      const receber = r.cr40f_receber === true ? '✓' : r.cr40f_receber === false ? '✗' : '—'
      return [
        `*Data:* ${d ? dateTime.format(d).replace(',', '') : '—'}`,
        `*ID:* ${text(r.cr40f_id)}`,
        `*Horário:* ${d ? hour.format(d) : '—'}`,
        `*Cliente:* ${r._cr40f_cliente_value ? formatted(r, '_cr40f_cliente_value') || '—' : '—'}`,
        `*Receber:* ${receber}`,
        `*Trajeto:* ${text(r.cr40f_trajeto)}`,
        `*Passageiro:* ${text(r.cr40f_passageirosetelefonedecontato)}`,
        `*Local de saída:* ${text(r.cr40f_endereodesada)}`,
        `*Destino:* ${text(r.cr40f_destino)}`,
        `*Obs ao motorista:* ${text(r.cr40f_obsdeoperao)}`,
        `*Perfil do Passageiro:* ${text(r.cr40f_perfildopassageiro)}`,
      ].join('\n')
    })
    .join('\n\n')
}
```

- [ ] **Passo 4: rodar testes** — `pnpm --filter @betinhos/shell test -- columns.test`, esperado verde.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/domain/columns.ts apps/shell/src/pages/geral/domain/copy.ts apps/shell/src/pages/geral/domain/columns.test.ts
git commit -m "Geral: preferências locais de colunas por visão e texto do Copiar Serviços

columns.ts guarda ocultas e ordem por visão em betinhos.geral.colunas.v1, validando
campo a campo e aplicando sobre as colunas da visão sem perder colunas novas.
copy.ts reproduz o bloco do script new_ScriptCopiarServicos (Data, ID, Horário, Cliente,
Receber, Trajeto, Passageiro, saída, destino, obs e perfil), ordenado por data.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 7: Camada de dados — queries, mock e Source

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/data/queries.ts`
- Criar: `apps/shell/src/pages/geral/data/mock.ts`
- Criar: `apps/shell/src/pages/geral/data/source.ts`
- Testar: `apps/shell/src/pages/geral/data/data.test.ts`

**Interfaces:**
- `queries.ts`:
  - `viewsPaths(): string[]` — dois caminhos: `savedqueries?$select=savedqueryid,name,fetchxml,layoutxml,isdefault&$filter=returnedtypecode eq 'cr40f_reservadeveculos' and querytype eq 0 and statecode eq 0&$orderby=name asc` e `userqueries?$select=userqueryid,name,fetchxml,layoutxml&$filter=returnedtypecode eq 'cr40f_reservadeveculos' and statecode eq 0&$orderby=name asc`.
  - `mapViews(system: Row[], mine: Row[]): View[]`.
  - `quickFindPath()`: `savedqueries?$select=fetchxml&$filter=returnedtypecode eq 'cr40f_reservadeveculos' and isquickfindquery eq true and statecode eq 0`.
  - `fetchPath(set: string, fetchxml: string)`: `${set}?fetchXml=${encodeURIComponent(fetchxml)}`.
  - `parsePage(body: FetchResponse): Page` com `type FetchResponse = { value: Row[]; '@odata.count'?: number; '@Microsoft.Dynamics.CRM.totalrecordcount'?: number; '@Microsoft.Dynamics.CRM.morerecords'?: boolean; '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'?: string }` — o cookie da resposta é `<cookie pagenumber="2" pagingcookie="%253ccookie..." .../>`: extraia `pagingcookie`, aplique `decodeURIComponent` duas vezes.
  - `searchPath(set: string, idAttribute: string, nameAttribute: string, query: string)`: `${set}?$select=${idAttribute},${nameAttribute}&$filter=statecode eq 0 and contains(${nameAttribute},'<q escapado>')&$orderby=${nameAttribute} asc&$top=25` (sem `contains` quando vazio).
  - `reloadPath(set: string, id: string, keys: string[])`: `${set}(${id})?$select=` com as colunas da visão (sem alias; `_x_value` vira `x`), sempre com `cr40f_reservadeveculosid`.
  - `relationshipPath(attribute)`: `EntityDefinitions(LogicalName='cr40f_reservadeveculos')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity&$filter=ReferencingAttribute eq '${attribute}'`.
- `source.ts`:

```ts
export type Source = {
  mock: boolean
  views(): Promise<View[]>
  quickFind(): Promise<string[]>
  attributes(entity: string): Promise<AttributeMap>
  page(req: { fetchxml: string; page: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }): Promise<Page>
  update(id: string, patch: Row): Promise<void>
  clearLookup(id: string, attribute: string): Promise<void>
  lookupBind(attribute: string): Promise<LookupBind>
  setState(ids: string[], active: boolean): Promise<{ ok: string[]; failed: { id: string; message: string }[] }>
  search(attribute: string, text: string): Promise<LookupOption[]>
  reload(id: string, keys: string[]): Promise<Row>
  copyRows(ids: string[]): Promise<Row[]>
  openForm(mode: 'create' | 'edit', id?: string): Promise<'closed' | 'external' | 'mock'>
  openVoucher(ids: string[]): string | null   // URL do iframe, ou null em mock
  escalaFdsUrl(): string | null
  kv: KV
}
```

- `mock.ts`: `createMockViews(): View[]` (Agenda padrão com colunas `cr40f_id, cr40f_status, cr40f_statusdefaturamento, cr40f_dataehorriodesada, cr40f_motorista, cr40f_veiculo, cr40f_tipodeveiculo, cr40f_cliente, cr40f_trajeto, cr40f_cotao, cr40f_receber, cr40f_observaointerna`; "Hoje" com filtro `today`; "Sem motorista" com `cr40f_motorista null`), `createMockRows(now: Date): Row[]` (60 reservas com anotações `@OData.Community.Display.V1.FormattedValue` para choices, lookups, datas e dinheiro), `MOCK_ATTRIBUTES: AttributeMap`, `MOCK_LOOKUPS: Record<string, LookupOption[]>` (motorista, veículo, cliente, solicitante), e `applyMockFetch(rows, fetchxml, opts): Page` — simula só o que o mock precisa: filtro `today`, `null`, `like` da busca, `order` e paginação de 50 (use `DOMParser`; não precisa cobrir outros operadores).

- [ ] **Passo 1: teste que falha**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fetchPath, mapViews, parsePage, reloadPath, searchPath } from './queries'
import { applyMockFetch, createMockRows, createMockViews } from './mock'
import { createSource } from './source'

describe('queries', () => {
  it('mapeia visões do sistema e pessoais, marcando a padrão', () => {
    const views = mapViews(
      [{ savedqueryid: 'A', name: '🗓️Agenda', fetchxml: '<fetch/>', layoutxml: '<grid/>', isdefault: true }, { savedqueryid: 'B', name: 'Hoje', fetchxml: '<fetch/>', layoutxml: '<grid/>', isdefault: false }],
      [{ userqueryid: 'U', name: 'Tenaris', fetchxml: '<fetch/>', layoutxml: '<grid/>' }],
    )
    expect(views.map((v) => [v.id, v.grupo, v.padrao])).toEqual([['A', 'sistema', true], ['B', 'sistema', false], ['U', 'minhas', false]])
  })
  it('fetchPath codifica o FetchXML', () => {
    expect(fetchPath('cr40f_reservadeveculoses', '<fetch count="50"/>')).toBe('cr40f_reservadeveculoses?fetchXml=%3Cfetch%20count%3D%2250%22%2F%3E')
  })
  it('parsePage extrai total, cookie decodificado e se há mais', () => {
    const page = parsePage({
      value: [{ cr40f_id: 'OS-1' }],
      '@Microsoft.Dynamics.CRM.totalrecordcount': 120,
      '@Microsoft.Dynamics.CRM.morerecords': true,
      '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': '<cookie pagenumber="2" pagingcookie="%253ccookie%2520page%253d%25221%2522%253e%253c%252fcookie%253e" istracking="False" />',
    })
    expect(page.total).toBe(120)
    expect(page.more).toBe(true)
    expect(page.cookie).toBe('<cookie page="1"></cookie>')
    expect(parsePage({ value: [] })).toEqual({ rows: [], cookie: null, more: false, total: null })
    expect(parsePage({ value: [], '@Microsoft.Dynamics.CRM.totalrecordcount': -1 }).total).toBeNull()
  })
  it('busca de lookup e releitura da linha', () => {
    expect(searchPath('cr40f_funcionarioses', 'cr40f_funcionariosid', 'cr40f_nomecompleto', "jo'ao")).toBe("cr40f_funcionarioses?$select=cr40f_funcionariosid,cr40f_nomecompleto&$filter=statecode%20eq%200%20and%20contains(cr40f_nomecompleto%2C'jo''ao')&$orderby=cr40f_nomecompleto%20asc&$top=25")
    expect(reloadPath('cr40f_reservadeveculoses', '{ABC}', ['cr40f_id', '_cr40f_motorista_value', 'a_1.new_valortotal'])).toBe('cr40f_reservadeveculoses(abc)?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_motorista')
  })
})

describe('mock', () => {
  it('visões, linhas e fetch simulado', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const views = createMockViews()
    const rows = createMockRows(now)
    expect(views.find((v) => v.padrao)?.nome).toContain('Agenda')
    expect(rows.length).toBeGreaterThanOrEqual(60)
    const page = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: 50, sort: null, query: '', quickFind: ['cr40f_id'], now })
    expect(page.rows.length).toBe(50)
    expect(page.more).toBe(true)
    expect(page.total).toBe(rows.length)
    const hoje = applyMockFetch(rows, views.find((v) => v.nome === 'Hoje')!.fetchxml, { page: 1, pageSize: 50, sort: null, query: '', quickFind: [], now })
    expect(hoje.rows.every((r) => String(r.cr40f_dataehorriodesada).startsWith('2026-10-08'))).toBe(true)
    const busca = applyMockFetch(rows, views[0].fetchxml, { page: 1, pageSize: 50, sort: null, query: 'OS-10', quickFind: ['cr40f_id'], now })
    expect(busca.rows.every((r) => String(r.cr40f_id).includes('OS-10'))).toBe(true)
  })
  it('source mock grava e relê', async () => {
    const source = createSource({ mode: 'mock' })
    const views = await source.views()
    const first = (await source.page({ fetchxml: views[0].fetchxml, page: 1, cookie: null, sort: null, query: '', quickFind: [] })).rows[0]
    const id = String(first.cr40f_reservadeveculosid)
    await source.update(id, { cr40f_trajeto: 'Nova rota' })
    expect((await source.reload(id, ['cr40f_trajeto'])).cr40f_trajeto).toBe('Nova rota')
    expect((await source.search('cr40f_motorista', 'a')).length).toBeGreaterThan(0)
    expect(await source.openForm('create')).toBe('mock')
    expect(source.openVoucher([id])).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- data.test`

- [ ] **Passo 3: implementar `queries.ts`**

```ts
import { cleanId, odataString, type Row } from '@betinhos/dataverse'
import { ENTITY, ID_ATTRIBUTE, type Page, type View } from '../domain/types'

export const RESERVA_FILTER = `returnedtypecode eq '${ENTITY}' and statecode eq 0`

export const viewsPaths = () => [
  `savedqueries?$select=savedqueryid,name,fetchxml,layoutxml,isdefault&$filter=${encodeURIComponent(`${RESERVA_FILTER} and querytype eq 0`)}&$orderby=name asc`,
  `userqueries?$select=userqueryid,name,fetchxml,layoutxml&$filter=${encodeURIComponent(RESERVA_FILTER)}&$orderby=name asc`,
]
export const quickFindPath = () => `savedqueries?$select=fetchxml&$filter=${encodeURIComponent(`${RESERVA_FILTER} and isquickfindquery eq true`)}`

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function mapViews(system: Row[], mine: Row[]): View[] {
  const map = (rows: Row[], idKey: string, grupo: View['grupo']): View[] => rows
    .filter((r) => str(r.fetchxml) && str(r.layoutxml))
    .map((r) => ({ id: cleanId(str(r[idKey])), nome: str(r.name).trim() || 'Sem nome', grupo, fetchxml: str(r.fetchxml), layoutxml: str(r.layoutxml), padrao: r.isdefault === true }))
  return [...map(system, 'savedqueryid', 'sistema'), ...map(mine, 'userqueryid', 'minhas')]
}

export const fetchPath = (set: string, fetchxml: string) => `${set}?fetchXml=${encodeURIComponent(fetchxml)}`

export type FetchResponse = {
  value: Row[]
  '@odata.count'?: number
  '@Microsoft.Dynamics.CRM.totalrecordcount'?: number
  '@Microsoft.Dynamics.CRM.morerecords'?: boolean
  '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'?: string
}

/** O cookie volta embrulhado e codificado duas vezes: `<cookie pagingcookie="%253c..." />`. */
export function parsePage(body: FetchResponse): Page {
  const wrapped = body['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'] ?? ''
  const match = /pagingcookie="([^"]*)"/.exec(wrapped)
  let cookie: string | null = null
  if (match?.[1]) { try { cookie = decodeURIComponent(decodeURIComponent(match[1])) } catch { cookie = null } }
  const count = body['@Microsoft.Dynamics.CRM.totalrecordcount'] ?? body['@odata.count']
  return { rows: body.value, cookie, more: body['@Microsoft.Dynamics.CRM.morerecords'] === true, total: typeof count === 'number' && count >= 0 ? count : null }
}

export function searchPath(set: string, idAttribute: string, nameAttribute: string, query: string) {
  const q = query.trim()
  const filter = q ? `statecode eq 0 and contains(${nameAttribute},'${odataString(q)}')` : 'statecode eq 0'
  return `${set}?$select=${idAttribute},${nameAttribute}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(`${nameAttribute} asc`)}&$top=25`
}

/** Releitura da linha com as colunas da visão (lookups voltam ao nome lógico; colunas de link ficam de fora). */
export function reloadPath(set: string, id: string, keys: string[]) {
  const select = new Set([ID_ATTRIBUTE])
  for (const key of keys) {
    if (key.includes('.')) continue
    const lookup = /^_(.+)_value$/.exec(key)
    select.add(lookup ? lookup[1] : key)
  }
  return `${set}(${cleanId(id)})?$select=${Array.from(select).join(',')}`
}

export const relationshipPath = (attribute: string) =>
  `EntityDefinitions(LogicalName='${ENTITY}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity&$filter=${encodeURIComponent(`ReferencingAttribute eq '${odataString(attribute)}'`)}`

export const copyPath = (set: string, ids: string[], select: string[]) =>
  `${set}?$select=${select.join(',')}&$filter=${encodeURIComponent(ids.map((id) => `${ID_ATTRIBUTE} eq ${cleanId(id)}`).join(' or '))}`
```

- [ ] **Passo 4: implementar `mock.ts`**

Regras: ids `aaaaaaaa-0000-4000-8000-0000000000NN`; 60 reservas distribuídas de hoje-2 a hoje+20 dias (hora 06:00–22:00), 12 sem motorista, status variados com os valores reais das choices (`202410001` Confirmado, `202410002` Cancelado, `100000001` Requer Análise, `202410005` Programado, `202410006` Em Execução, `202410008` Concluído), faturamento (`202410005` Pendente, `202410010` Pago, `202410011` Não Faturável), tipo de veículo (`202410001` Executivo, `202410000` Básico, `202410002` Blindado), 4 motoristas (`Carlos Lima`, `Ana Souza`, `Bruno Dias`, `Teste`), 4 veículos (`ABC1D23 · Corolla`, …), 3 clientes (`Tenaris`, `Grupo Atlântico`, `Particular`), 4 solicitantes. Cada linha traz as anotações formatadas (`cr40f_status@OData.Community.Display.V1.FormattedValue`, `_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue`, etc.).

`MOCK_ATTRIBUTES`: um `AttributeInfo` por coluna usada nas visões mock (`type`, `label`, `updatable: true`, `targets` dos lookups, `options` das choices com os valores acima; `cr40f_id` e `createdon` com `updatable: false`).

`createMockViews()` gera `fetchxml` e `layoutxml` reais, por exemplo para Agenda:

```ts
const fetch = (filter: string, order = '<order attribute="cr40f_dataehorriodesada" descending="false" />') =>
  `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false"><entity name="cr40f_reservadeveculos">${AGENDA_COLS.map((c) => `<attribute name="${c}" />`).join('')}${order}${filter}</entity></fetch>`
const layout = (cols: string[]) => `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">${cols.map((c) => `<cell name="${c}" width="130" />`).join('')}</row></grid>`
```

`applyMockFetch(rows, fetchxml, { page, pageSize, sort, query, quickFind, now })`: lê com `DOMParser` as condições da raiz (`today`, `null`, `next-x-years` = sem efeito, `eq` em `cr40f_status`), aplica o `like` da busca (case-insensitive, sem acento, sobre `String(row[attr] ?? formatted)`), ordena por `sort` ou pelo `<order>` da visão, e devolve `{ rows: fatia, cookie: null, more, total }`.

- [ ] **Passo 5: implementar `source.ts`**

```ts
import { cleanId, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { browserKV } from '../../pagantes/data/source'
import { buildFetch } from '../domain/fetch'
import type { KV } from '../domain/columns'
import { COPY_SELECT } from '../domain/copy'
import { ENTITY, type AttributeMap, type LookupBind, type LookupOption, type Page, type Sort, type View } from '../domain/types'
import { MOCK_ATTRIBUTES, MOCK_LOOKUPS, applyMockFetch, createMockRows, createMockViews } from './mock'
import { copyPath, fetchPath, mapViews, parsePage, quickFindPath, relationshipPath, reloadPath, searchPath, viewsPaths, type FetchResponse } from './queries'
import { quickFindAttributes } from '../domain/fetch'

export const FORM_WEBRESOURCE = 'new_formulario_geral.html'
export const VOUCHER_WEBRESOURCE = 'cr40f_VoucherConfirmacao.html'
export const ESCALA_FDS_WEBRESOURCE = 'cr40f_EscalaFDS.html'

export type PageRequest = { fetchxml: string; page: number; cookie: string | null; sort: Sort; query: string; quickFind: string[] }
export type Source = { /* assinatura da seção Interfaces */ }
```

Implementação Dataverse (pontos que importam):
- `views()`: `Promise.all(viewsPaths().map((p) => host.client.getAll(p)))` → `mapViews`. Se `userqueries` falhar (403), segue só com as do sistema.
- `quickFind()`: `getAll(quickFindPath())`, pega o primeiro `fetchxml` e devolve `quickFindAttributes`; em erro, `[]`.
- `attributes(entity)`: `host.metadata.attributes(entity)` e, para cada `Picklist`/`Boolean`, `host.metadata.choices(entity, logicalName).catch(() => [])` — booleanos usam `Microsoft.Dynamics.CRM.BooleanAttributeMetadata`; para eles use `options: [{ value: 1, label: 'Sim' }, { value: 0, label: 'Não' }]` sem chamada. Devolve `Map`.
- `page(req)`: `host.client.request<FetchResponse>(fetchPath(set, buildFetch(req.fetchxml, { ...req, pageSize: PAGE_SIZE })))` → `parsePage`.
- `lookupBind(attribute)`: cache por atributo; `relationshipPath` → `nav` e `ReferencedEntity`; entity set do alvo por `host.metadata.entity(ReferencedEntity)`.
- `update(id, patch)`: `host.client.update(set, id, patch)`.
- `clearLookup(id, attribute)`: `host.client.request(`${set}(${cleanId(id)})/${(await lookupBind(attribute)).nav}/$ref`, { method: 'DELETE' })`.
- `setState(ids, active)`: para cada id, `update(set, id, active ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 })` com `Promise.allSettled`; devolve ok/failed.
- `search(attribute, text)`: alvo = `attributes(ENTITY)` → `targets[0]`; `info = host.metadata.entity(alvo)`; `request(searchPath(info.entitySetName, `${alvo}id`, info.primaryName, text))` → `{ id, nome }`.
- `reload(id, keys)`: `request<Row>(reloadPath(set, id, keys))`.
- `copyRows(ids)`: em blocos de 20 ids (`chunk`), `getAll(copyPath(set, bloco, COPY_SELECT))`.
- `openForm(mode, id)`: dentro do model-driven (`host.insideModelDriven` e `getHostXrm()?.Navigation.navigateTo`): `await navigateTo({ pageType: 'webresource', webresourceName: FORM_WEBRESOURCE, data: JSON.stringify({ mode, entityName: ENTITY, ...(id ? { id, recordId: id, entityId: id } : {}) }) }, { target: 1 })` e devolve `'closed'`; fora, `window.open(`${host.clientUrl}/WebResources/${FORM_WEBRESOURCE}?data=${encodeURIComponent(json)}`, '_blank', 'noopener')` e devolve `'external'`.
- `openVoucher(ids)`: `${host.clientUrl}/WebResources/${VOUCHER_WEBRESOURCE}?ids=${encodeURIComponent(JSON.stringify(ids))}&cacheBust=${Date.now()}`.
- `escalaFdsUrl()`: `${host.clientUrl}/WebResources/${ESCALA_FDS_WEBRESOURCE}`.
- `kv: browserKV()`.

Mock: `views` → `createMockViews()`; `page` → `applyMockFetch` com latência 300 ms; `update` altera a linha em memória e a anotação formatada de choice/lookup conforme `MOCK_ATTRIBUTES`/`MOCK_LOOKUPS`; `update` em uma linha com `cr40f_id === 'OS-1013'` rejeita com `new Error('Sem permissão para alterar este serviço.')` (para testar o estado de erro); `search` filtra `MOCK_LOOKUPS[attribute]`; `openForm` → `'mock'`; `openVoucher` e `escalaFdsUrl` → `null`.

- [ ] **Passo 6: rodar testes e typecheck** — `pnpm --filter @betinhos/shell test -- data.test && pnpm typecheck`, esperado verde.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src/pages/geral/data
git commit -m "Geral: camada de dados (visões, FetchXML na Web API, lookups, releitura) e mock

queries.ts monta os caminhos de savedqueries/userqueries, localização rápida, execução
por ?fetchXml= com paging cookie decodificado, busca de lookup pelo nome primário,
releitura da linha e relação do lookup. source.ts implementa a Source no Dataverse
(inclui abrir o Formulário Geral, voucher e Escala FDS) e em memória para o pnpm dev,
com 3 visões e 60 serviços gerados.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 8: Hook `useGeral`

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/useGeral.ts`
- Testar: `apps/shell/src/pages/geral/useGeral.test.tsx`

**Interfaces:**
- Produz `useGeral(source: Source)`:

```ts
export type GeralState = {
  views: View[]; viewsError: string | null
  view: View | null                       // visão ativa
  columns: Column[]                       // colunas da visão (sem preferências aplicadas)
  attributes: AttributeMap | null         // raiz + tabelas ligadas (chave `alias.atributo` para links); null = metadata indisponível
  attributesError: string | null
  quickFind: string[]
  rows: Row[]; page: number; total: number | null; more: boolean; cookies: (string | null)[]  // cookies[n] = cookie para pedir a página n+1
  loading: boolean; pageError: string | null
  sort: Sort; query: string
  selected: Set<string>
  cells: Map<string, CellStatus>          // chave `${id}|${attribute}`
}
export function useGeral(source: Source): GeralState & {
  selectView(id: string): void
  setSort(sort: Sort): void
  setQuery(query: string): void
  goTo(page: number): void
  reload(): void                          // mesma visão, página 1
  toggle(id: string): void; toggleAll(): void; clearSelection(): void
  save(id: string, column: Column, value: EditValue): Promise<boolean>   // valida, patch, otimista, reload da linha, estados
  resetCell(id: string, attribute: string): void
}
```

- Regras:
  - Ao montar: `views()` e `quickFind()` em paralelo; visão inicial = `padrao` ou primeira. Token contra respostas fora de ordem, como em `usePessoas`.
  - Ao trocar de visão: `columns = parseLayout(view.layoutxml)`, `sort = defaultSort(view.fetchxml)`, `page = 1`, `cookies = [null]`, seleção limpa, `attributes` = união de `source.attributes(ENTITY)` com `source.attributes(link.name)` para cada `linkEntities(view.fetchxml)` (as do link entram com chave `${alias}.${logicalName}`). Erro de metadata não impede a listagem: `attributes = null` e `attributesError` preenchido.
  - `page(req)` roda a cada mudança de `view`, `sort`, `query` (já com debounce feito pela `SearchBox`) ou `page`; `cookies[page]` guarda o cookie devolvido para pedir `page + 1`. Trocar `sort`/`query` volta à página 1.
  - `save`: `kind = cellKind(column, attributes.get(column.key))`; erro de `validateEdit` → `cells = error` e retorna `false` sem chamar o servidor. Senão `cells = saving`, aplica valor otimista na linha (`rowKey`), chama `update`/`clearLookup` (com `lookupBind` para lookups), depois `reload(id, keys das colunas)` e substitui a linha inteira; `cells = saved` (`at = Date.now()`), e um `setTimeout(SAVED_VISIBLE_MS)` manda `settle`. Em erro, restaura a linha antiga e `cells = error` com `message`.

- [ ] **Passo 1: teste que falha**

```tsx
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createSource } from './data/source'
import { useGeral } from './useGeral'

describe('useGeral', () => {
  it('carrega a visão padrão, pagina e ordena', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    expect(result.current.view?.padrao).toBe(true)
    expect(result.current.columns[0].attribute).toBe('cr40f_id')
    expect(result.current.attributes?.get('cr40f_status')?.type).toBe('Picklist')
    act(() => result.current.goTo(2))
    await waitFor(() => expect(result.current.page).toBe(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.length).toBeGreaterThan(0)
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.page).toBe(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const ids = result.current.rows.map((r) => String(r.cr40f_id))
    expect([...ids].sort().reverse()).toEqual(ids)
  })

  it('salva com estados gravando/salvo e erro restaurando o valor', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    const row = result.current.rows[0]
    const id = String(row.cr40f_reservadeveculosid)
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    let ok = false
    await act(async () => { ok = await result.current.save(id, trajeto, 'Rota nova') })
    expect(ok).toBe(true)
    expect(result.current.cells.get(`${id}|cr40f_trajeto`)?.kind).toBe('saved')
    expect(result.current.rows[0].cr40f_trajeto).toBe('Rota nova')

    const bloqueada = result.current.rows.find((r) => r.cr40f_id === 'OS-1013')
    expect(bloqueada).toBeTruthy()
    const bid = String(bloqueada!.cr40f_reservadeveculosid)
    const antes = bloqueada!.cr40f_trajeto
    await act(async () => { ok = await result.current.save(bid, trajeto, 'Não vai') })
    expect(ok).toBe(false)
    expect(result.current.cells.get(`${bid}|cr40f_trajeto`)).toEqual({ kind: 'error', message: 'Sem permissão para alterar este serviço.' })
    expect(result.current.rows.find((r) => r.cr40f_id === 'OS-1013')?.cr40f_trajeto).toBe(antes)
  })

  it('validação barra antes do servidor', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    const id = String(result.current.rows[0].cr40f_reservadeveculosid)
    const cotacao = result.current.columns.find((c) => c.attribute === 'cr40f_cotao')!
    let ok = true
    await act(async () => { ok = await result.current.save(id, cotacao, -5) })
    expect(ok).toBe(false)
    expect(result.current.cells.get(`${id}|cr40f_cotao`)).toEqual({ kind: 'error', message: 'Valor não pode ser negativo.' })
  })
})
```

Garanta que o mock tenha uma linha com `cr40f_id === 'OS-1013'` dentro das 50 primeiras da Agenda e que `cr40f_trajeto` e `cr40f_cotao` estejam no layout da Agenda mock.

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- useGeral`

- [ ] **Passo 3: implementar**

Esqueleto (complete seguindo as regras acima):

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '@betinhos/dataverse'
import type { Source } from './data/source'
import { cellKind } from './domain/cells'
import { buildPatch, reduceCell, validateEdit, SAVED_VISIBLE_MS, type CellEvent, type EditValue } from './domain/edit'
import { defaultSort, linkEntities } from './domain/fetch'
import { parseLayout, rowKey } from './domain/layout'
import { ENTITY, ID_ATTRIBUTE, type AttributeMap, type CellStatus, type Column, type Sort, type View } from './domain/types'

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
export const cellKey = (id: string, attribute: string) => `${id}|${attribute}`

export function useGeral(source: Source) {
  // ... estados conforme GeralState
  // efeito 1: views + quickFind
  // efeito 2 (depende de view): columns, sort, attributes (raiz + links)
  // efeito 3 (depende de view, sort, query, page): page()
  // save(): ver regras
}
```

Detalhe do `save`:

```ts
const save = useCallback(async (id: string, column: Column, value: EditValue) => {
  const info = attributes?.get(column.key)
  const kind = cellKind(column, info)
  const key = cellKey(id, column.attribute)
  const setCell = (event: CellEvent) => setCells((m) => { const next = new Map(m); next.set(key, reduceCell(m.get(key) ?? { kind: 'idle' }, event)); return next })
  const invalid = validateEdit(kind, value)
  if (invalid) { setCell({ type: 'fail', message: invalid }); return false }
  const bind = kind === 'lookup' ? await source.lookupBind(column.attribute).catch((e) => { setCell({ type: 'fail', message: message(e) }); return null }) : undefined
  if (kind === 'lookup' && !bind) return false
  const action = buildPatch(kind, column.attribute, value, bind ?? undefined)
  if (!action) { setCell({ type: 'fail', message: 'Este campo não pode ser editado aqui.' }); return false }
  const before = rows.find((r) => String(r[ID_ATTRIBUTE]) === id)
  if (!before) return false
  setCell({ type: 'save' })
  setRows((list) => list.map((r) => (r === before ? optimistic(r, column, info, value) : r)))
  try {
    if ('clearLookup' in action) await source.clearLookup(id, column.attribute)
    else await source.update(id, action.patch)
    const fresh = await source.reload(id, columns.map((c) => rowKey(c, attributes?.get(c.key))))
    setRows((list) => list.map((r) => (String(r[ID_ATTRIBUTE]) === id ? { ...r, ...fresh } : r)))
    setCell({ type: 'ok', at: Date.now() })
    window.setTimeout(() => setCell({ type: 'settle' }), SAVED_VISIBLE_MS)
    return true
  } catch (reason) {
    setRows((list) => list.map((r) => (String(r[ID_ATTRIBUTE]) === id ? before : r)))
    setCell({ type: 'fail', message: message(reason) })
    return false
  }
}, [attributes, columns, rows, source])
```

`optimistic(row, column, info, value)` grava o valor cru na chave `rowKey` e, para choice/lookup/boolean/datetime, a anotação formatada (`${key}@OData.Community.Display.V1.FormattedValue`) com o rótulo da opção, o `nome` do lookup, `Sim`/`Não` ou a data formatada.

- [ ] **Passo 4: rodar testes e typecheck** — `pnpm --filter @betinhos/shell test -- useGeral && pnpm typecheck`

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/geral/useGeral.ts apps/shell/src/pages/geral/useGeral.test.tsx apps/shell/src/pages/geral/data/mock.ts
git commit -m "Geral: hook useGeral (visão, página, ordenação, busca, seleção e gravação por célula)

Carrega visões e localização rápida, troca de visão recalcula colunas, ordem padrão e
metadata (raiz e tabelas ligadas), pagina com cookies por página e grava cada célula
com validação prévia, atualização otimista, releitura da linha e estados
gravando/salvo/erro com reversão do valor.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 9: Página, rota, toolbar, colunas e tabela só leitura

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/GeralPage.tsx`
- Criar: `apps/shell/src/pages/geral/components/GeralToolbar.tsx`
- Criar: `apps/shell/src/pages/geral/components/ColumnsMenu.tsx`
- Criar: `apps/shell/src/pages/geral/components/GeralTable.tsx`
- Criar: `apps/shell/src/pages/geral/geral.css`
- Modificar: `apps/shell/src/nav/menu.ts` (union de `page` e item do grupo Operacional)
- Modificar: `apps/shell/src/nav/menu.test.ts`
- Modificar: `apps/shell/src/app/RouteLayout.tsx`
- Testar: `apps/shell/src/pages/geral/GeralPage.test.tsx` (primeiros casos)

Leia `DESIGN_SYSTEM.md` §10.2, §10.2.2, §10.9 e §11 antes. Responda com `DESIGN CONTEXTO`.

**Interfaces:**
- `GeralToolbar` props: `{ views: View[]; view: View | null; onSelectView(id: string): void; query: string; onQuery(q: string): void; searching: boolean; columns: Column[]; attributes: AttributeMap | null; prefs: ColumnPrefs | null; onPrefs(p: ColumnPrefs | null): void; selectedCount: number; commands: ReactNode; shortcuts: ReactNode }`.
- `ColumnsMenu` props: `{ columns: Column[]; attributes: AttributeMap | null; prefs: ColumnPrefs | null; onChange(p: ColumnPrefs | null): void }` — `Menu`-like painel próprio (`<details>`-free): botão "Colunas" abre um `Dialog` com a lista de colunas (`Checkbox` por coluna, setas ↑/↓ para reordenar, "Restaurar colunas da visão"); salva ao fechar.
- `GeralTable` props: `{ columns: Column[]; attributes: AttributeMap | null; rows: Row[]; loading: boolean; sort: Sort; onSort(s: Sort): void; selected: Set<string>; onToggle(id: string): void; onToggleAll(): void; onOpen(id: string): void; renderCell(row: Row, column: Column): ReactNode; footer: ReactNode; empty: ReactNode }`.
  - Grid próprio (`role="grid"`), não o `Table` do `@betinhos/ui`, porque a tabela tem rolagem horizontal, seleção e células editáveis; reutilize as classes visuais `bt-table`, `bt-table__head`, `bt-table__row`, `bt-table__cell`, `bt-table__footer`, `bt-table__skeleton` (mesmo CSS do DS) e acrescente as classes `gr-*` no `geral.css`.
  - Cabeçalho: célula de seleção (`Checkbox` "Selecionar página"), uma `<button class="gr-head__sort">` por coluna com `aria-sort` (`ascending`/`descending`/`none`), ícone `ArrowUp`/`ArrowDown` (lucide, 14 px) quando ordenada; clique cicla asc → desc → ordem da visão (`onSort(null)`). Colunas de link (`column.alias`) também ordenam (vão para dentro do `link-entity`).
  - Largura: `grid-template-columns: 36px ${columns.map((c) => `minmax(${Math.max(90, c.width)}px, ${c.width}px)`).join(' ')}` em `--gr-columns`; o contêiner tem `overflow-x: auto`; primeira coluna de dados fixa à esquerda (`position: sticky; left: 36px`) junto com a de seleção (`left: 0`).
  - Primeira coluna de dados: `<button class="gr-open">` com o valor e `aria-label="Abrir serviço {valor} no Formulário Geral"`.
- `GeralPage`: `ToastProvider` + `Geral`; `PageLayout` com `eyebrow="Operacional"`, `title="Geral"`, `meta` = `{total} serviços` quando `total != null`, `actions` = Atualizar (`RefreshCw`, secundária) e "Criar serviço" (`Plus`, primária); `useShellHeader({ title: 'Geral', actions })`; `toolbar` = `GeralToolbar`. Nesta tarefa `renderCell` só mostra `formatCell` (edição vem na Tarefa 10) e `commands`/`shortcuts` ficam vazios (Tarefa 11). Estados: `viewsError` → `Alert danger` com "Tentar de novo"; `pageError` → `Alert danger` com a mensagem e botão "Voltar para a Agenda" (seleciona a visão `padrao`); `attributesError` → `Alert warning` "Edição indisponível no momento: {erro}"; vazio → `EmptyState` com `SearchX`, título "Nenhum serviço nesta visão" e ação "Limpar busca" quando `query`.
  - Rodapé: `<span>Linhas {inicio}–{fim}{total != null ? ` de ${total}` : ''}</span>` e `Pagination` quando `total != null`, senão dois botões "Anterior"/"Próxima" (`Próxima` desabilitada sem `more`).
- Rota: em `menu.ts`, `page: 'componentes' | 'operacional' | 'frota' | 'funcionarios' | 'curriculos' | 'pagantes' | 'pessoas' | 'geral'` e, no grupo Operacional, substitua `table('cr40f_reservadeveculos')` por `{ kind: 'page', id: 'geral', label: 'Geral', page: 'geral' }`. Em `RouteLayout.tsx`, `if (item.page === 'geral') return <GeralPage host={host} />`.

- [ ] **Passo 1: testes que falham**

Em `menu.test.ts`:

```ts
it('Geral é rota React do shell no lugar da lista nativa de reservas', () => {
  expect(findItem('geral')?.item).toMatchObject({ kind: 'page', page: 'geral', label: 'Geral' })
  expect(findItem('geral')?.group.id).toBe('operacional')
  expect(findItem('cr40f_reservadeveculos')).toBeNull()
})
```

`GeralPage.test.tsx` (mesmo cabeçalho de `PessoasPage.test.tsx`: jsdom, `configure({ asyncUtilTimeout: 8000 })`, `matchMedia` stub, `localStorage.clear()`):

```tsx
describe('Geral', () => {
  it('abre a Agenda com as colunas da visão, pagina e ordena', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/ })).toBeTruthy()
    expect((await screen.findAllByRole('row')).length).toBeGreaterThan(10)
    expect(screen.getByText(/Linhas 1–50 de/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Status de Operação/ }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/ }).getAttribute('aria-sort')).toBe('ascending'))
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    await screen.findByText(/Linhas 51–/)
  })

  it('troca de visão e busca por palavra-chave', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50/)
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista' }))
    await waitFor(() => expect(screen.queryByText(/Linhas 1–50/)).toBeNull())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/ })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/ })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colunas da visão' })).getByRole('button', { name: 'Restaurar colunas da visão' }))
    await screen.findByRole('columnheader', { name: /Trajeto/ })
  })
})
```

Verifique o nome acessível que o `Select` do DS dá ao gatilho (`aria-label="Visão"`) e ajuste o `getByRole` se o papel for `button` em vez de `combobox` (olhe `packages/ui/src/components/Select.tsx`).

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- menu GeralPage`

- [ ] **Passo 3: implementar** `menu.ts`, `RouteLayout.tsx`, `geral.css`, `GeralToolbar`, `ColumnsMenu`, `GeralTable`, `GeralPage`.

`geral.css` (base; a Tarefa 10 acrescenta as células):

```css
/* Geral: lista editável de serviços. Só tokens do Design System 1.4.0. */
.gr-meta { font-size: var(--bt-font-size-13); color: var(--bt-color-text-secondary); font-variant-numeric: tabular-nums; }
.gr-filters__view { flex: 0 1 260px; min-width: 200px; }
.gr-filters__search { flex: 1 1 260px; min-width: 200px; max-width: 380px; }
.gr-filters__selected { display: inline-flex; align-items: center; gap: var(--bt-space-2); padding-left: var(--bt-space-2); border-left: var(--bt-border-width-default) solid var(--bt-color-border); font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }

.gr-table { overflow: auto; max-height: calc(100vh - 220px); }
.gr-table .bt-table__head, .gr-table .bt-table__row { grid-template-columns: var(--gr-columns); gap: 0; padding: 0; min-width: max-content; }
.gr-table .bt-table__head { position: sticky; top: 0; z-index: 2; }
.gr-table .bt-table__row { min-height: 54px; }
.gr-table .bt-table__cell { padding: 0 var(--bt-space-3); min-height: 54px; border-right: var(--bt-border-width-default) solid var(--bt-color-border); }
.gr-cell--select { position: sticky; left: 0; z-index: 1; justify-content: center; background-color: var(--bt-color-surface); }
.gr-cell--first { position: sticky; left: 36px; z-index: 1; background-color: var(--bt-color-surface); box-shadow: 1px 0 0 var(--bt-color-border); }
.gr-table .bt-table__head .gr-cell--select, .gr-table .bt-table__head .gr-cell--first { background-color: var(--bt-color-surface-neutral); }
.gr-head__sort { display: inline-flex; align-items: center; gap: var(--bt-space-1); min-height: 36px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
.gr-head__sort:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border); border-radius: var(--bt-radius-xs); }
.gr-open { padding: 0; border: 0; background: transparent; color: var(--bt-color-brand); font: inherit; font-weight: var(--bt-font-weight-extrabold); text-align: left; cursor: pointer; border-radius: var(--bt-radius-xs); }
.gr-open:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); }
.gr-footer__pages { display: inline-flex; gap: var(--bt-space-2); }
@media (hover: hover) and (pointer: fine) {
  .gr-open:hover { color: var(--bt-color-action); }
  .gr-table .bt-table__row:hover .bt-table__cell { background-color: var(--bt-color-surface-soft); }
}
```

`ColumnsMenu` guarda um rascunho de `{ hidden, order }` enquanto o `Dialog` (título "Colunas da visão") está aberto; "Aplicar" chama `onChange(draft)`; "Restaurar colunas da visão" chama `onChange(null)` e fecha. Setas ↑/↓ são `Button variant="ghost" iconOnly` com `aria-label="Mover {rótulo} para cima"`.

`GeralPage` aplica `applyColumnPrefs(columns, prefs)` e persiste com `saveColumnPrefs(source.kv, view.id, prefs)`; ao trocar de visão, `prefs = loadColumnPrefs(source.kv, view.id)`.

- [ ] **Passo 4: rodar testes e typecheck** — `pnpm --filter @betinhos/shell test -- menu GeralPage && pnpm typecheck`

- [ ] **Passo 5: conferir no navegador** — `pnpm dev` (porta salva 36472) e abra `http://localhost:36472/#/geral`: colunas da Agenda, ordenar, buscar, paginar, ocultar coluna, 1280 px e 1024 px sem quebrar a toolbar. Tire um screenshot para o registro.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/geral apps/shell/src/nav/menu.ts apps/shell/src/nav/menu.test.ts apps/shell/src/app/RouteLayout.tsx
git commit -m "Geral: rota #/geral com visões do Dataverse, tabela ordenável, busca, paginação e colunas

Substitui a lista nativa de cr40f_reservadeveculos no menu Operacional pela página React:
PageHeader/PageToolbar do DS, seletor de visões (sistema e minhas), busca por localização
rápida, grid com cabeçalho ordenável (aria-sort), seleção por linha, primeira coluna fixa
que abre o Formulário Geral, rodapé com contagem e paginação, e diálogo de colunas com
preferências locais por visão.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 10: Célula editável com feedback inline

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/components/Cell.tsx`
- Modificar: `apps/shell/src/pages/geral/geral.css`
- Modificar: `apps/shell/src/pages/geral/GeralPage.tsx` (`renderCell` passa a usar `Cell`)
- Testar: `apps/shell/src/pages/geral/GeralPage.test.tsx` (novos casos)

Leia `DESIGN_SYSTEM.md` §9 (motion) e §10.4–10.5 antes. Responda com `DESIGN CONTEXTO`.

**Interfaces:**
- `Cell` props: `{ row: Row; column: Column; info: AttributeInfo | undefined; status: CellStatus; onSave(value: EditValue): Promise<boolean>; onReset(): void; search(text: string): Promise<LookupOption[]>; editable: boolean }` (`editable = false` quando `attributes == null`).
- Estrutura: `<div role="gridcell" tabIndex={0} class="gr-cell gr-cell--{kind} is-{status}" aria-busy aria-invalid aria-describedby>`; modo leitura mostra o valor (`StatusBadge` para `cr40f_status`/`cr40f_statusdefaturamento` com `statusTone`, `Switch` em boolean, link em `new_linkdovoucher`, `title` com o texto completo em text/memo, cadeado `Lock` 12 px com `aria-label="Somente leitura"` no hover em readonly); modo edição troca pelo controle do tipo.
- Teclado (no `onKeyDown` do `gridcell` em leitura): `Enter`/`F2` entra em edição; tecla imprimível entra em edição já com o caractere (text/memo/money); setas movem foco para o `gridcell` vizinho (`closest('[role=row]')` e índice); em edição: `Enter` confirma (em memo, `Ctrl+Enter`), `Tab` confirma e foca a próxima célula editável da linha, `Esc` cancela. Duplo clique entra em edição. `blur` para fora da célula confirma.
- Confirmar: se o valor não mudou, só sai da edição; senão `onSave(valor)`; o controle some na hora e a célula mostra o valor otimista com o estado.
- Feedback: `.is-saving` → `Spinner size={12} label="Gravando"` no canto direito; `.is-saved` → `Check` (lucide 14 px) em `--bt-color-success` com `aria-label="Salvo"`, animação `gr-saved-flash` (background `--bt-color-success-soft` → transparente, 200 ms) e o ícone entra com `opacity`/`transform: scale(.9)` → 1 em 160 ms `var(--bt-ease-out)`; `.is-error` → `border-left: 2px solid var(--bt-color-danger)`, ícone `AlertTriangle` 14 px em `--bt-color-danger` dentro de um `Tooltip text={message}`, e um botão `Button variant="ghost" size="compact"` "Tentar de novo" que reabre a edição com o último valor digitado; `<span id={describedBy} class="gr-sr">{message}</span>` para `aria-describedby`.
- Lookup: `Select` com `searchable`, `onSearchChange` → `search(texto)` com debounce de 250 ms e `loading`, `clearable` (limpar = `onSave(null)`), opção atual pré-carregada com o valor formatado da linha; o painel abre já ao entrar em edição (foque o gatilho e dispare clique).
- Choice: `Select searchable={false}` com `info.options`; `onChange` confirma na hora.
- Datetime: `Input type="datetime-local" size="compact"` com `toDateTimeLocal(valor)`; `fromDateTimeLocal` na confirmação.
- Money: `Input inputMode="decimal" size="compact" prefix="R$"`; `parseMoney` na confirmação; valor inválido → `onSave` recebe `null` só se o campo estiver vazio, senão mostra erro local "Valor inválido." sem chamar `onSave`.
- Boolean: `Switch` sempre visível, `onChange` → `onSave(checked)`; sem modo edição.
- Memo: `Textarea rows={3}` que cresce até 8 linhas (`style.height = scrollHeight`).

- [ ] **Passo 1: testes que falham** (acrescente em `GeralPage.test.tsx`)

```tsx
it('edita texto na célula com Enter e mostra salvo', async () => {
  render(<GeralPage host={{ mode: 'mock' }} />)
  const first = (await screen.findAllByRole('row'))[1]
  const cell = within(first).getAllByRole('gridcell').find((c) => c.className.includes('gr-cell--text'))!
  fireEvent.keyDown(cell, { key: 'Enter' })
  const input = within(cell).getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Rota editada' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
  expect(within(cell).getByText('Rota editada')).toBeTruthy()
})

it('erro do servidor restaura o valor, mostra aviso e permite tentar de novo', async () => {
  render(<GeralPage host={{ mode: 'mock' }} />)
  const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral' })
  const row = opener.closest('[role="row"]') as HTMLElement
  const cell = within(row).getAllByRole('gridcell').find((c) => c.className.includes('gr-cell--text'))!
  const before = cell.textContent
  fireEvent.doubleClick(cell)
  const input = within(cell).getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Não vai' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(await within(cell).findByText('Sem permissão para alterar este serviço.')).toBeTruthy()
  expect(cell.getAttribute('aria-invalid')).toBe('true')
  expect(within(cell).getByText(before!.replace(/Somente leitura/, '').trim() || '—')).toBeTruthy()
  expect(within(cell).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
})

it('Esc cancela sem gravar e status abre um select', async () => {
  render(<GeralPage host={{ mode: 'mock' }} />)
  const first = (await screen.findAllByRole('row'))[1]
  const text = within(first).getAllByRole('gridcell').find((c) => c.className.includes('gr-cell--text'))!
  const original = text.textContent
  fireEvent.keyDown(text, { key: 'Enter' })
  fireEvent.change(within(text).getByRole('textbox'), { target: { value: 'descartar' } })
  fireEvent.keyDown(within(text).getByRole('textbox'), { key: 'Escape' })
  expect(text.textContent).toBe(original)
  const status = within(first).getAllByRole('gridcell').find((c) => c.className.includes('gr-cell--choice'))!
  fireEvent.keyDown(status, { key: 'Enter' })
  expect(await within(status).findByRole('option', { name: 'Confirmado' })).toBeTruthy()
})
```

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- GeralPage`

- [ ] **Passo 3: implementar `Cell.tsx`** e o CSS:

```css
/* Células editáveis */
.gr-cell { position: relative; display: flex; align-items: center; gap: var(--bt-space-2); min-width: 0; outline: 0; }
.gr-cell:focus-visible { box-shadow: inset 0 0 0 2px var(--bt-focus-border); }
.gr-cell__value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1 1 auto; }
.gr-cell__editor { flex: 1 1 auto; min-width: 0; }
.gr-cell__editor .bt-control { min-height: 32px; }
.gr-cell__mark { flex: 0 0 auto; display: inline-flex; align-items: center; }
.gr-cell__lock { opacity: 0; color: var(--bt-color-text-tertiary); transition: opacity var(--bt-duration-fast) ease; }
.gr-cell--readonly:hover .gr-cell__lock, .gr-cell--readonly:focus-visible .gr-cell__lock { opacity: 1; }
.gr-cell.is-saving { pointer-events: none; }
.gr-cell.is-saved { animation: gr-saved-flash var(--bt-duration-normal) var(--bt-ease-out); }
.gr-cell.is-saved .gr-cell__mark { color: var(--bt-color-success); animation: gr-mark-in 160ms var(--bt-ease-out); }
.gr-cell.is-error { box-shadow: inset 2px 0 0 var(--bt-color-danger); }
.gr-cell.is-error .gr-cell__mark { color: var(--bt-color-danger); }
.gr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes gr-saved-flash { from { background-color: var(--bt-color-success-soft); } to { background-color: transparent; } }
@keyframes gr-mark-in { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .gr-cell.is-saved, .gr-cell.is-saved .gr-cell__mark { animation: none; }
}
```

- [ ] **Passo 4: rodar testes e typecheck** — `pnpm --filter @betinhos/shell test -- GeralPage && pnpm typecheck`

- [ ] **Passo 5: conferir no navegador** — em `pnpm dev`: editar texto, status, motorista (busca), data, cotação, receber; ver spinner → ✓; forçar erro na linha OS-1013; Esc; Tab entre células; setas; `prefers-reduced-motion` no DevTools. Screenshot dos três estados.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/geral
git commit -m "Geral: edição na célula por tipo com feedback inline (gravando, salvo, erro)

Cell.tsx renderiza leitura e edição de choice, lookup (busca no servidor), data/hora,
texto, texto longo, dinheiro e Sim/Não, com teclado (Enter, Tab, Esc, setas), duplo
clique e confirmação ao sair. Spinner durante a gravação, check com flash em sucesso,
borda e aviso com Tentar de novo em erro; readonly mostra cadeado. Sem animação em
ações de teclado e com redução de movimento.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 11: Comandos — Criar/Editar, Desativar/Ativar, Copiar Serviços, Voucher e atalhos

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/components/Dialogs.tsx`
- Criar: `apps/shell/src/pages/geral/components/VoucherOverlay.tsx`
- Criar: `apps/shell/src/pages/geral/components/EscalaFdsDrawer.tsx`
- Modificar: `apps/shell/src/pages/geral/GeralPage.tsx`, `components/GeralToolbar.tsx`, `geral.css`
- Testar: `apps/shell/src/pages/geral/GeralPage.test.tsx`

Responda com `DESIGN CONTEXTO`.

**Interfaces:**
- `Dialogs.tsx`:
  - `CopyDialog({ open, text, loading, onClose, onCopied })`: `Dialog` título "Copiar serviços", `<pre class="gr-copy">` com o texto, ações "Fechar" e "Copiar" (`navigator.clipboard.writeText`; em falha, seleciona o texto e avisa "Não foi possível copiar automaticamente. Selecione e copie."); `onCopied` → toast success "Serviços copiados.".
  - `StateDialog({ request: { ids: string[]; labels: string[]; active: boolean } | null, busy, onClose, onConfirm })`: título "Desativar {n} serviço(s)?" / "Ativar {n} serviço(s)?", `tone="danger"` ao desativar, lista dos IDs (`labels`), ações "Manter como está" e "Desativar"/"Ativar".
  - `MockFormDialog({ open, onClose })`: título "Formulário Geral abre no Dataverse", texto "Fora do ambiente não há formulário. Publique com pnpm push e abra o Sistema Betinhos no Dataverse.".
- `VoucherOverlay({ url, onClose })`: `<div role="dialog" aria-modal aria-label="Voucher de confirmação" class="gr-voucher">` com backdrop (`mousedown` fecha), `<iframe title="Voucher de confirmação" src={url}>`, `Esc` fecha, `message` com `event.data.type === 'cr40f-voucher-confirmacao:close'` e `event.origin === location.origin` fecha. Entrada: `opacity` 0 → 1 em 180 ms `var(--bt-ease-out)`; saída 160 ms. Tamanho `min(1480px, calc(100% - 48px))` × `min(940px, calc(100% - 40px))`, raio `var(--bt-radius-lg)`; ≤ 820 px ocupa tudo. Backdrop `rgba(0, 26, 61, .22)` + `backdrop-filter: blur(6px)` (mesmos valores do comando atual).
- `EscalaFdsDrawer({ url, open, onClose })`: `Drawer size="wide"` título "Escala fim de semana" com `<iframe class="gr-frame" title="Escala fim de semana" src={url}>`; `url == null` (mock) mostra `EmptyState compact` "Abre dentro do Dataverse".
- `GeralToolbar` recebe `commands` (quando `selectedCount > 0`): `Button variant="action"` **Editar** (`Pencil`, só com 1 selecionado), **Gerar Voucher** (`Ticket`), **Copiar Serviços** (`Copy`), **Desativar** (`Archive`, `variant="danger"`) ou **Ativar** (`ArchiveRestore`) conforme `statecode` dos selecionados (todos 0 → Desativar; todos 1 → Ativar; misto → ambos desabilitados com `title="Selecione só serviços ativos ou só inativos."`), e "Limpar seleção" (`X`, ghost). `shortcuts`: `Menu` com gatilho `Button variant="secondary" iconOnly aria-label="Mais ações"` (`MoreVertical`) e ações **Funções Operacionais** (`location.hash = hrefFor('new_telafuncoesoperacionais')`), **Escala FDS** (abre o drawer), **Contagem de Serviços** (`location.hash = hrefFor('operacional')`).
- `GeralPage`:
  - "Criar serviço" e abrir pela primeira coluna/Editar: `const result = await source.openForm(mode, id)`; `'closed'` → `reload()`; `'external'` → toast info "O formulário abriu em outra aba. Clique em Atualizar quando terminar."; `'mock'` → `MockFormDialog`.
  - Copiar: `copyRows(ids)` → `copyText(rows)` → `CopyDialog`.
  - Desativar/Ativar: `StateDialog` → `setState(ids, active)` → toast com o resultado: tudo ok "N serviços desativados." / parcial `danger` "X de N falharam: {primeiro erro}"; depois `reload()` e `clearSelection()`.
  - Voucher: `const url = source.openVoucher(ids)`; `null` → toast info "O voucher abre dentro do Dataverse."; senão `VoucherOverlay`.
  - `statecode` precisa estar na linha: acrescente `statecode` ao `$select` do `reloadPath` e garanta que `buildFetch` inclua `<attribute name="statecode" />` na entidade raiz quando a visão não o tiver (faça em `buildFetch`: se não existir `attribute[name="statecode"]` filho direto de `entity`, acrescente; cubra com um teste em `fetch.test.ts`).

- [ ] **Passo 1: testes que falham**

Em `fetch.test.ts`:

```ts
it('garante statecode entre os atributos da raiz', () => {
  const doc = parse(buildFetch(AGENDA, base))
  expect(doc.querySelectorAll('entity > attribute[name="statecode"]').length).toBe(1)
  expect(parse(buildFetch(buildFetch(AGENDA, base), base)).querySelectorAll('entity > attribute[name="statecode"]').length).toBe(1)
})
```

Em `GeralPage.test.tsx`:

```tsx
it('seleção mostra comandos; copiar abre a prévia com o bloco; desativar pede confirmação', async () => {
  render(<GeralPage host={{ mode: 'mock' }} />)
  const rows = await screen.findAllByRole('row')
  fireEvent.click(within(rows[1]).getByRole('checkbox'))
  fireEvent.click(within(rows[2]).getByRole('checkbox'))
  expect(screen.getByText('2 selecionados')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copiar Serviços' }))
  const copy = await screen.findByRole('dialog', { name: 'Copiar serviços' })
  expect((await within(copy).findByText(/\*ID:\* OS-/)).textContent).toContain('*Trajeto:*')
  fireEvent.click(within(copy).getByRole('button', { name: 'Fechar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  const confirm = await screen.findByRole('dialog', { name: 'Desativar 2 serviços?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Desativar' }))
  expect(await screen.findByText('2 serviços desativados.')).toBeTruthy()
  await waitFor(() => expect(screen.queryByText('2 selecionados')).toBeNull())
})

it('em mock, criar avisa que o formulário abre no Dataverse', async () => {
  render(<GeralPage host={{ mode: 'mock' }} />)
  await screen.findAllByRole('row')
  fireEvent.click(screen.getByRole('button', { name: 'Criar serviço' }))
  expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
})
```

Para o teste de cópia, `navigator.clipboard` não existe no jsdom: o diálogo só precisa abrir com o texto.

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- fetch.test GeralPage`

- [ ] **Passo 3: implementar** os arquivos listados. CSS adicional:

```css
.gr-copy { max-height: 50vh; margin: 0; padding: var(--bt-space-3); overflow: auto; border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface-neutral); font: inherit; font-size: var(--bt-font-size-12); white-space: pre-wrap; }
.gr-ids { margin: 0; padding-left: var(--bt-space-5); columns: 2; font-size: var(--bt-font-size-12); }
.gr-frame { display: block; width: 100%; height: calc(100vh - 120px); border: 0; }
.gr-voucher { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; opacity: 0; transition: opacity 180ms var(--bt-ease-out); }
.gr-voucher.is-open { opacity: 1; }
.gr-voucher__backdrop { position: absolute; inset: 0; background: rgba(0, 26, 61, .22); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.gr-voucher__frame { position: relative; z-index: 1; width: min(1480px, calc(100% - 48px)); height: min(940px, calc(100% - 40px)); border: 0; border-radius: var(--bt-radius-lg); background: transparent; }
@media (max-width: 820px) { .gr-voucher__frame { width: 100%; height: 100%; border-radius: 0; } }
@media (prefers-reduced-motion: reduce) { .gr-voucher { transition: none; } }
```

- [ ] **Passo 4: rodar testes e typecheck** — `pnpm --filter @betinhos/shell test -- fetch.test GeralPage && pnpm typecheck`

- [ ] **Passo 5: conferir no navegador** em `pnpm dev`: seleção, Editar com 1, Copiar (prévia e copiar), Desativar/Ativar, menu "⋮" navegando para Funções Operacionais e Resumo Operacional, drawer da Escala FDS com o aviso de mock.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/geral apps/shell/src/pages/geral/domain/fetch.test.ts
git commit -m "Geral: comandos sobre selecionados e atalhos da barra

Criar/Editar abrem o Formulário Geral (navigateTo dentro do model-driven, nova aba por
URL direta, aviso em mock) e recarregam ao fechar; Desativar/Ativar com confirmação e
resultado parcial; Copiar Serviços com prévia e cópia; Gerar Voucher em overlay com
iframe (Esc, fundo e postMessage fecham); atalhos para Funções Operacionais, Escala FDS
(drawer) e Contagem de Serviços (Resumo Operacional). statecode passa a vir em toda visão.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 12: Mobile — cards, sheet de edição e barra de seleção

**Arquivos:**
- Criar: `apps/shell/src/pages/geral/components/GeralCards.tsx`
- Criar: `apps/shell/src/pages/geral/components/GeralSheet.tsx`
- Modificar: `apps/shell/src/pages/geral/GeralPage.tsx`, `geral.css`
- Testar: `apps/shell/src/pages/geral/GeralPage.test.tsx`

Leia `DESIGN_SYSTEM.md` §8.3, §8.4 e §10.12 antes. Responda com `DESIGN CONTEXTO`.

**Interfaces:**
- `GeralCards({ rows, columns, attributes, selected, onToggle, onOpen, onEdit(id) })`: `<ul class="gr-cards">`, um `<li class="gr-card">` por linha com `Checkbox` (44 px), ID como `<button class="gr-open">`, `StatusBadge` do status, linha com data/hora (`formatCell('datetime', …)`), cliente e motorista (ou "Sem motorista" em `warning`), trajeto com `overflow-wrap: anywhere`, e botão `Button variant="secondary" size="touch" fullWidth` "Editar campos" → `onEdit(id)`. Usa só as colunas presentes na visão (se a visão não tiver motorista, não mostra).
- `GeralSheet({ row, columns, attributes, cells, open, onClose, onSave(column, value), onReset(column), search })`: `Sheet` título `Serviço {cr40f_id}` com um `Field` por coluna editável da visão (mesmos controles da `Cell`, em `size="touch"`), cada um com o feedback do `cells` abaixo do campo (`hint` "Salvo ✓" por 1,5 s, `error` com a mensagem e "Tentar de novo"). Campos readonly aparecem como texto. Grava campo a campo ao sair do controle (`blur`) ou ao escolher no `Select`/`Switch`.
- `GeralPage`: `const mobile = useMedia('(max-width: 820px)')`; em mobile renderiza `GeralCards` em vez de `GeralTable` e, com seleção, uma barra inferior fixa `<div class="gr-selbar">` com os mesmos `commands`. A toolbar mantém visão e busca; "Colunas" some no celular.

- [ ] **Passo 1: teste que falha**

```tsx
it('no celular mostra cards e edita pela sheet', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  render(<GeralPage host={{ mode: 'mock' }} />)
  const card = (await screen.findAllByRole('listitem'))[0]
  fireEvent.click(within(card).getByRole('button', { name: 'Editar campos' }))
  const sheet = await screen.findByRole('dialog', { name: /Serviço OS-/ })
  const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
  fireEvent.change(trajeto, { target: { value: 'Rota pelo celular' } })
  fireEvent.blur(trajeto)
  expect(await within(sheet).findByText('Salvo ✓')).toBeTruthy()
})
```

- [ ] **Passo 2: rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- GeralPage`

- [ ] **Passo 3: implementar** com o CSS:

```css
.gr-cards { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; }
.gr-card { display: grid; gap: var(--bt-space-2); padding: var(--bt-space-3); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.gr-card__head { display: flex; align-items: center; gap: var(--bt-space-2); }
.gr-card__line { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); overflow-wrap: anywhere; }
.gr-card__line strong { color: var(--bt-color-text-primary); }
.gr-selbar { position: fixed; inset: auto 0 0 0; z-index: 30; display: flex; flex-wrap: wrap; gap: var(--bt-space-2); padding: var(--bt-space-2) var(--bt-space-3) calc(var(--bt-space-2) + env(safe-area-inset-bottom)); border-top: var(--bt-border-width-default) solid var(--bt-color-border); background-color: var(--bt-color-surface); box-shadow: var(--bt-shadow-panel); }
.gr-sheet { display: grid; gap: var(--bt-space-3); padding-bottom: var(--bt-space-4); }
@media (max-width: 820px) { .gr-filters__columns { display: none; } }
```

- [ ] **Passo 4: rodar testes e typecheck**; **Passo 5:** no navegador em 375 px e 320 px: cards, sheet, barra de seleção, sem rolagem horizontal.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/geral
git commit -m "Geral: cards no celular, sheet de edição por campo e barra de seleção

Até 820 px a lista vira cards com ID, status, data, cliente, motorista e trajeto; Editar
campos abre uma Sheet com os campos editáveis da visão, gravando ao sair de cada um com
o mesmo feedback (Salvo, erro com Tentar de novo). Seleção mostra os comandos numa
barra inferior fixa. Sem rolagem horizontal em 320 px.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tarefa 13: Verificação final em mock e revisão

**Arquivos:** só correções do que a revisão apontar.

- [ ] **Passo 1: suíte completa** — `pnpm typecheck && pnpm test` (raiz). Esperado: verde.
- [ ] **Passo 2: aceite em mock** (`pnpm dev`, `#/geral`), percorrendo a §8 da spec: visão, ordenar, buscar, paginar, colunas, editar cada tipo (status, motorista, data, texto, memo, cotação, receber), erro na OS-1013, Esc/Tab/setas, comandos, mobile 320 px, versão `v0.0.x · dd/mm/aaaa HH:mm` visível com a tabela, vazia, em erro e carregando. Screenshots em `docs/superpowers/plans/2026-10-08-geral-react.md` não; só reporte na conversa.
- [ ] **Passo 3: revisão** — use a skill `review-delta` sobre `git diff main...HEAD` e corrija o que for bug ou violação do DS (gradiente, cor fora dos tokens, `transition: all`, animação em teclado, hover sem media query).
- [ ] **Passo 4: commit das correções** com mensagem descritiva.

---

### Tarefa 14: Publicar em DEV e testar autenticado (só com ok do Renan)

- [ ] **Passo 1: pedir o ok** — Pare e pergunte ao Renan se pode publicar em DEV. Sem ok, a tarefa termina aqui.
- [ ] **Passo 2: `.env`** — o Renan copia o `.env` para `apps/shell` na worktree (o hook bloqueia o Claude).
- [ ] **Passo 3: publicar** — `pnpm push` (login por device code feito pelo Renan). Anote a versão impressa pelo build (`v0.0.x · dd/mm/aaaa HH:mm`) e informe.
- [ ] **Passo 4: teste autenticado** no Sistema Betinhos em DEV, `#/geral`: Agenda com as colunas reais; visões pessoais aparecem; ordenar por Data e horário e por Valor total (link); buscar "OS-"; página 2; editar status, observação interna, cotação, receber, data e motorista em um serviço de teste (`cr40f_id` começando por `OS-18`/`OS-19` da lista de DEV); conferir ✓ e a releitura; Criar abre o Formulário Geral e, ao fechar, a lista recarrega; Voucher com 1 selecionado; Copiar; Desativar e Ativar o mesmo serviço de teste. Capture erros (resposta, payload) antes de concluir.
- [ ] **Passo 5: registrar** — commit `Sistema Betinhos: versão de build v0.0.x publicada no DEV` com `package.json`/lockfile, e reporte o que passou e o que falhou.
