# Geral fase 2 — Bloco B (filtros, colunas e visões pessoais) — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`).

**Objetivo:** filtros por coluna e "Editar filtros" injetados no FetchXML da visão, redimensionar/reordenar colunas, visões pessoais salvas no Dataverse e link compartilhável.

**Spec:** `docs/superpowers/specs/2026-10-08-geral-fase2-design.md`, Bloco B. **Base:** HEAD `08c0575` (Bloco A).

## Restrições globais
As do plano `2026-10-08-geral-react.md` (tokens `--bt-*`, sem gradiente, hover só em ponteiro fino, sem `transition: all`, pt-BR, botões com verbo, status nunca só por cor, 44 px no celular, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, testes por arquivo com `pnpm --filter @betinhos/shell exec vitest run <arquivo>`, `pnpm typecheck`). Datas em America/Sao_Paulo (offset fixo `-03:00`). Nada de nome de entity set, navigation property ou nome primário fixo fora do mock. Só `apps/shell/src/pages/geral/**`, mais `apps/shell/src/nav/useHashRoute.ts` (+ teste) na B5.

## Mapa de arquivos
```
domain/filters.ts        tipos Filter/FilterSet, operadores por CellKind, injectFilters(fetchxml, filters, attributes), describeFilter, encode/decodeFilters (URL)
domain/filters.test.ts
data/mock.ts             applyMockFetch avalia as condições novas (eq, in, like, not-like, begins-with, null, not-null, on-or-after, on-or-before, today, tomorrow, yesterday, this-week, next-x-days, last-x-days, this-month, ge, le)
useGeral.ts              filters, setFilter, clearFilters; fetch efetivo = injectFilters(view.fetchxml, …) para page e count; URL state
components/ColumnMenu.tsx  menu ▾ do cabeçalho: ordenar, filtrar, limpar filtro, ocultar
components/FilterEditor.tsx editor por tipo (texto, choice, lookup, data, dinheiro, Sim/Não)
components/FilterChips.tsx chips + "Limpar filtros"
components/FiltersDrawer.tsx "Editar filtros" com todos os campos filtráveis
components/GeralTable.tsx  ▾ no cabeçalho, alça de redimensionar, arrastar para reordenar, Alt+←/→
domain/columns.ts        ColumnPrefs ganha widths: Record<string, number>; applyColumnPrefs aplica largura
data/source.ts + queries.ts  createView/updateView/renameView/deleteView (userquery) + mock em memória
domain/views.ts          buildViewFetch(baseFetch, filters, sort, attributes), buildLayout(columns, widths), descrição
components/ViewMenu.tsx  Salvar como visão / Salvar / Renomear / Excluir (só pessoais)
domain/urlState.ts       encode/decode `view, q, sort, f` ↔ `#/geral?...`
apps/shell/src/nav/useHashRoute.ts  routeFromHash ignora a query (`#/geral?x=1` → `geral`), expõe `queryFromHash`
GeralPage.tsx / geral.css  composição e estilos
```

---

### Tarefa B1: domínio de filtros + FetchXML + mock

**Arquivos:** criar `domain/filters.ts`, `domain/filters.test.ts`; modificar `data/mock.ts`, `data/data.test.ts`.

**Interfaces (`domain/filters.ts`):**
```ts
export type TextOp = 'contains' | 'not-contains' | 'eq' | 'begins' | 'empty' | 'not-empty'
export type ChoiceOp = 'in' | 'empty'
export type LookupOp = 'in' | 'empty'
export type DateOp = 'today' | 'tomorrow' | 'yesterday' | 'this-week' | 'next-7' | 'last-7' | 'this-month' | 'range' | 'empty'
export type NumberOp = 'eq' | 'ge' | 'le' | 'between' | 'empty'
export type BoolOp = 'yes' | 'no'
export type Filter =
  | { kind: 'text'; op: TextOp; value?: string }
  | { kind: 'choice'; op: ChoiceOp; values?: number[] }
  | { kind: 'lookup'; op: LookupOp; values?: LookupOption[] }      // id + nome (nome só para o chip)
  | { kind: 'date'; op: DateOp; from?: string; to?: string }          // 'YYYY-MM-DD' local
  | { kind: 'number'; op: NumberOp; value?: number; to?: number }
  | { kind: 'bool'; op: BoolOp }
export type FilterSet = Record<string, Filter>   // chave = atributo lógico da raiz
export const filterKindFor = (cellKind: CellKind): Filter['kind'] | null  // text/memo→text, choice→choice, lookup→lookup, datetime→date, money→number, boolean→bool, readonly→text se o atributo for String/Memo (ID filtra), senão null
export function injectFilters(fetchxml: string, filters: FilterSet, attributes: AttributeMap): string
export function describeFilter(attribute: string, filter: Filter, info: AttributeInfo | undefined): string  // "Status: Confirmado, Programado" · "Saída: hoje" · "Cotação: ≥ R$ 500,00" · "Trajeto: contém GRU"
export function encodeFilters(filters: FilterSet): string   // JSON compacto → base64url (sem '=')
export function decodeFilters(text: string): FilterSet        // tolerante: inválido → {}
export const isEmptyFilter = (f: Filter) => …                 // sem valor onde valor é exigido
```
Regras do `injectFilters`: um `<filter type="and">` próprio (atributo `data-gr="filters"` não é XML válido — use um comentário? Não: simplesmente anexe o `<filter>` como último filho da `entity`; para substituir numa segunda injeção, a função recebe sempre o FetchXML **da visão**, nunca o já injetado). Condições por tipo:
- text: `contains` → `like %v%`; `not-contains` → `not-like %v%`; `eq` → `eq v`; `begins` → `like v%`; `empty` → `null`; `not-empty` → `not-null`. Valor com `%`/`_`/`[` escapado como `[%]`, `[_]`, `[[]` nos `like`.
- choice: `in` → `<condition attribute operator="in"><value>…</value>…</condition>`; `empty` → `null`.
- lookup: `in` com `<value>{guid}</value>`; `empty` → `null`.
- date: `today`/`tomorrow`/`yesterday`/`this-week`/`this-month` → operadores homônimos do FetchXML; `next-7` → `next-x-days` value 7; `last-7` → `last-x-days` value 7; `range` → `on-or-after from` e `on-or-before to` (datas `YYYY-MM-DD`; FetchXML interpreta no fuso do usuário); `empty` → `null`.
- number: `eq`/`ge`/`le`; `between` → `ge value` + `le to`; `empty` → `null`.
- bool: `yes` → `eq 1`; `no` → `eq 0`.
Filtros vazios (`isEmptyFilter`) são ignorados. Tudo via `DOMParser`/`setAttribute` (nunca concatenação).

**Mock:** `applyMockFetch` passa a avaliar as condições acima na raiz (inclusive `in` com `<value>`, `not-like`, `null`/`not-null`, datas relativas a `now` em America/Sao_Paulo, `ge/le`), com busca por `like` já existente. Testes: cada operador filtra o esperado no mock.

- [ ] Testes RED → implementação → `pnpm typecheck` → commit "Geral: modelo de filtros por coluna com injeção no FetchXML e avaliação no mock".

### Tarefa B2: hook com filtros e URL

**Arquivos:** `useGeral.ts`, `useGeral.test.tsx`, criar `domain/urlState.ts` (+ teste), modificar `apps/shell/src/nav/useHashRoute.ts` (+ `useHashRoute.test.ts` se existir, senão criar).

**Interfaces:**
- `useHashRoute`: `routeFromHash('#/geral?view=a&q=x')` → `'geral'`; novo `queryFromHash(hash): URLSearchParams`; `hrefFor(id, params?)`.
- `domain/urlState.ts`: `type UrlState = { view?: string; q?: string; sort?: Sort; filters?: FilterSet }`; `readUrlState(params): UrlState`; `writeUrlState(state): string` (query string sem `?`); `sort` como `attr:asc|desc` (alias com `alias.attr`).
- `useGeral(source, { onSaveFail, initial?: UrlState, onStateChange?(state: UrlState) })`: estado `filters: FilterSet`; `setFilter(attribute, filter | null)`; `clearFilters()`; `effectiveFetch = useMemo(() => view && attributes ? injectFilters(view.fetchxml, filters, attributes) : view?.fetchxml)`; `page`/`count` usam `effectiveFetch`; mudar filtros zera a lista como ordenar; `initial` aplica visão/busca/ordem/filtros na primeira carga (visão inexistente → padrão); `onStateChange` é chamado (debounce 0, só quando algo muda) com `{ view, q, sort, filters }`.
- `GeralPage` lê `queryFromHash` ao montar e, em `onStateChange`, faz `history.replaceState(null, '', '#/' + hrefSemHash)` (nunca `pushState`).

- [ ] Testes: filtro de status reduz as linhas no mock e volta a 100 ao limpar; estado inicial por URL aplica visão/busca/ordem/filtros; `onStateChange` recebe o estado codificado; `routeFromHash` ignora a query. Commit "Geral: filtros no hook e estado da tela na URL".

### Tarefa B3: menu da coluna, editor de filtro, chips e Editar filtros

**Arquivos:** criar `components/ColumnMenu.tsx`, `FilterEditor.tsx`, `FilterChips.tsx`, `FiltersDrawer.tsx` (+ testes); modificar `GeralTable.tsx`, `GeralToolbar.tsx`, `GeralPage.tsx`, `geral.css`, `GeralPage.test.tsx`.

**Comportamento:**
- Cabeçalho: botão ▾ (`aria-label="Opções da coluna {rótulo}"`, 24 px, visível no hover/foco e sempre quando há filtro ativo — com ponto `--bt-color-action`) abre `Menu`: "Ordenar A→Z", "Ordenar Z→A", "Filtrar por…" (abre `FilterEditor` em `Dialog` pequeno ancorado — use `Dialog` do DS centrado; título "Filtrar {rótulo}"), "Limpar filtro" (só com filtro), "Ocultar coluna". Colunas de `link-entity`: só ordenar e ocultar.
- `FilterEditor({ attribute, info, kind, value, onApply, onClear })`: por tipo — texto: `Select` de operador + `Input`; choice: lista de `Checkbox` com as opções da metadata + "Está vazio"; lookup: `Select` múltiplo pesquisável usando `source.search(attribute, texto)` + "Está vazio"; data: `SegmentedControl`/`Select` com os atalhos + dois `Input type="date"` em "Intervalo"; número: operador + 1 ou 2 `Input inputMode="decimal"` (usa `parseMoney`); bool: `Radio` Sim/Não. Botões "Aplicar" (primário) e "Limpar". Enter aplica.
- `FilterChips`: linha abaixo da toolbar (só quando há filtros), um chip por filtro com `describeFilter`, "×" remove (`aria-label="Remover filtro {rótulo}"`), clicar no texto reabre o editor, botão ghost "Limpar filtros".
- `FiltersDrawer`: `Drawer` "Editar filtros" listando todos os atributos filtráveis da raiz (da metadata, não só colunas visíveis; ordem: colunas da visão primeiro, depois os demais em ordem alfabética do rótulo), cada um com um `FilterEditor` compacto em acordeão; rodapé "Limpar tudo" / "Aplicar". Abre pelo botão "Filtros" na toolbar (ícone funil, com contagem).
- Toolbar: botão "Filtros" (compact/touch como os demais).

- [ ] Testes: menu abre e ordena; filtrar Status por Confirmado reduz linhas e cria chip; remover chip restaura; Editar filtros aplica filtro de data "Hoje"; celular: botão Filtros e chips visíveis. Commit "Geral: menu por coluna, filtros por tipo, chips e Editar filtros".

### Tarefa B4: redimensionar e reordenar colunas

**Arquivos:** `GeralTable.tsx`, `domain/columns.ts` (+ teste), `GeralPage.tsx`, `ColumnsMenu.tsx` (mostrar larguras?) não; `geral.css`; `GeralPage.test.tsx`.

- `ColumnPrefs` ganha `widths?: Record<string, number>`; `applyColumnPrefs` devolve colunas com `width` substituída quando houver; `saveColumnPrefs` valida números (90–1200).
- Alça `.gr-resize` (6 px) na borda direita de cada cabeçalho; `pointerdown` + `setPointerCapture` + `pointermove` ajusta `--gr-columns` em tempo real (via estado local `liveWidths`), `pointerup` persiste; duplo clique volta ao padrão da visão; teclado: cabeçalho focado + `Shift+←/→` muda 16 px.
- Reordenar: `draggable` no cabeçalho (exceto seleção) com `dragstart/dragover/drop` trocando a ordem em `prefs.order`; indicador de destino (`--bt-color-action`, 2 px); teclado `Alt+←/→` move a coluna.
- Tudo persistido por visão; "Restaurar colunas da visão" (já existe) também zera larguras.

- [ ] Testes: `applyColumnPrefs` aplica larguras e valida; `Shift+→` aumenta a largura da trilha (ler `--gr-columns`); `Alt+→` troca a ordem; pointer events simulados ajustam a largura. Commit "Geral: redimensionar e reordenar colunas com persistência por visão".

### Tarefa B5: visões pessoais no Dataverse e Compartilhar

**Arquivos:** criar `domain/views.ts` (+ teste), `components/ViewMenu.tsx`; modificar `data/queries.ts`, `data/source.ts`, `data/mock.ts`, `data/data.test.ts`, `GeralToolbar.tsx`, `GeralPage.tsx`, `GeralPage.test.tsx`.

- `domain/views.ts`: `buildViewFetch(baseFetch, filters, sort, attributes)` = `injectFilters` + ordenação atual substituindo a da visão (reusa `buildFetch` sem paginação: extraia de `fetch.ts` um `applySort(doc, sort)` se necessário); `buildLayout(columns, widths)` → `layoutxml` (`<grid name="resultset" object="10580" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">` + `<cell name width />` na ordem visível; `object` = objecttypecode 10580 da tabela em DEV — ler da metadata `EntityDefinitions(...)?$select=ObjectTypeCode` em runtime, nunca fixo fora do mock).
- Source: `createView({ name, fetchxml, layoutxml }) → View` (POST `userqueries` com `returnedtypecode: 'cr40f_reservadeveculos'`, `querytype: 0`, `description: 'Criada no Sistema Betinhos'`), `updateView(id, { fetchxml, layoutxml })`, `renameView(id, name)`, `deleteView(id)`; mock em memória. `metadata.entity` precisa expor `objectTypeCode` (adicione `ObjectTypeCode` ao `$select` em `packages/dataverse/src/metadata.ts` — exceção autorizada de edição fora da pasta, com teste).
- UI: ao lado do seletor de visão, `Menu` "Visão": "Salvar como visão…" (Dialog com nome, cria e seleciona), "Salvar nesta visão" (só pessoal, atualiza fetch/layout), "Renomear…" (só pessoal), "Excluir visão" (só pessoal, confirmação danger), e "Compartilhar link" (copia `location.href` atualizado; toast "Link copiado."). Após salvar, a visão nova é selecionada e os filtros avulsos somem (já estão nela).
- `useGeral` recebe `reloadViews()` para atualizar a lista após criar/renomear/excluir.

- [ ] Testes: `buildViewFetch`/`buildLayout` geram XML esperado; `createView` posta o corpo certo (host falso) e o mock lista a nova visão; renomear/excluir; "Compartilhar link" copia a URL com `view`, `q`, `sort`, `f`. Commit "Geral: visões pessoais no Dataverse (salvar, renomear, excluir) e link compartilhável".

### Tarefa B6: verificação no navegador
- [ ] 1440×900: menu ▾, filtro Status → chip → limpar; Editar filtros; redimensionar/reordenar e persistência após recarregar; salvar visão (mock), renomear, excluir; copiar link e abrir em nova aba restaura o estado; 375 px: Filtros e chips. Registrar no ledger.
