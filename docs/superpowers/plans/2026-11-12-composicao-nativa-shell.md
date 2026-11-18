# Composição de Preço nativa no shell — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** a Composição de Preço abre em `#/composicao` dentro do shell, sem iframe, tão rápido quanto a Geral, com o mesmo comportamento do web resource `new_TelaComposicaoPreco.html`.

**Arquitetura:** o código da tela (repo `tela-composicao-de-preco`, `origin/main` em `2d1b877`, v0.1.105 + PR #24) é copiado para `apps/shell/src/pages/composicao/` e passa a ser a fonte. A camada de dados e o motor de fórmulas portam quase sem mudança (o shell já define `window.Xrm`, real ou shim, que é o que `getXrmHost()` lê). A abertura muda em três pontos: (1) sem iframe, sem segundo boot; (2) a primeira página usa o FetchXML guardado na própria view (ou a consulta padrão) e não espera o catálogo de 2 níveis, que carrega em segundo plano; (3) reserva e cliente entram na consulta principal como `link-entity`, e as fórmulas chegam depois sem bloquear a grade. A grade é a `DataTable` da tela (`@tanstack/react-table`) virtualizada com `useVirtualRows` do shell. Visual: CSS da tela com escopo `.composicao`; botão, menu, diálogo e toast do `@betinhos/ui` no lugar do shadcn/Tailwind.

**Stack:** React 19, TypeScript, Vite 7, Vitest 3 + Testing Library (shell), `@betinhos/ui` 1.22, `@betinhos/dataverse`, `@tanstack/react-table` (novo no shell), `@tanstack/react-virtual`, `big.js` (novo no shell).

**Spec:** brief aprovado em 12/11/2026 (mensagem da sessão; fase 1 = tela#24). Decisões de 12/11: portar a DataTable; shell vira a fonte (repo da tela congela depois do PROD validado); CSS da tela com escopo.

## Restrições globais

- PR próprio para a `develop`. PROD fora do alcance (develop → main normal).
- Não pode quebrar: edição e fórmulas na grade (Custom API `new_AplicarEntradaCelulaComposicao`), Gerar OP (uma OP para todos os selecionados, flow em `new_FlowUrlCriarOP`), Excel só dos selecionados, visões pessoais (`userquery`) e públicas (`savedquery`), pins (`new_configuracaovisualizacaocomposicao`).
- Catálogo continua com 2 níveis; carrega sem bloquear a primeira página. Cache do catálogo da fase 1 (`localStorage`, 12 h) mantido, mesma chave (`tela-composicao-preco:catalog:v1:<url>`), para o cache do web resource valer no shell.
- Rolagem carrega sozinha, uma página (100) por vez.
- A rota antiga `#/new_telacomposicaopreco` fica no menu até a validação no DEV; sai em PR seguinte.
- Shell não usa Tailwind: nenhuma classe utilitária nova; CSS só em `composicao.css` com prefixo `.composicao`.
- Repo é público: nada de `sig=`, segredo ou dado real nos mocks.
- Versão visível do shell continua sendo a do shell (`v0.0.x · dd/mm/aaaa HH:mm`), já no AppShell.
- Power Platform: nenhuma mudança de schema, Custom API, plugin ou flow.

## Mapa de arquivos

Origem = repo da tela (`git show origin/main:<arquivo>`). Destino = `apps/shell/src/pages/composicao/`.

| Destino | Origem | Mudança |
|---|---|---|
| `formula/*` | `src/formula/*` + `contracts/formula-engine-v1.json` | cópia; contrato vai para `formula/formula-engine-v1.json` |
| `data/*` (views, composition-query, compositions, column-filter*, filter-options, grid-*, record-navigation, related-field-edit, view-field-presentation, audit, catalog-cache, mock-store, mock-views, composition-*) | `src/data/*` | cópia; alias `@/` vira caminho relativo |
| `data/xrm.ts` | `src/data/xrm.ts` | lê só `window.Xrm` (o shell já é a página de cima) |
| `data/dataverse.ts` | `src/data/dataverse.ts` | Tarefas 3 e 4 (link-entity, fórmulas sem bloquear) |
| `data/open-query.ts` | novo | Tarefa 2: consulta da abertura sem catálogo |
| `components/*` | `src/components/price-composition/*`, `data-table/*` | cópia; `ui/*` do shadcn trocado por `@betinhos/ui` (Tarefa 5) |
| `ComposicaoPage.tsx` | `PriceCompositionPage.tsx` | abertura nova (Tarefa 6), `host` por props |
| `composicao.css` | `src/styles.css` + `design-tokens.css` | escopo `.composicao`, tokens do DS (Tarefa 5) |
| `apps/shell/src/nav/menu.ts`, `app/routes.tsx`, `app/AppShell.tsx` | — | rota `composicao` (Tarefa 7) |

---

### Tarefa 1: Portar camada de dados, fórmulas e testes puros

**Arquivos:**
- Criar: `apps/shell/src/pages/composicao/formula/*`, `apps/shell/src/pages/composicao/data/*` (todos os `.ts` de `src/data` e `src/formula`, com testes)
- Modificar: `apps/shell/package.json` (+ `big.js`, `@types/big.js`, `@tanstack/react-table` na mesma versão da tela), `pnpm-lock.yaml`

**Interfaces produzidas:** as mesmas exportações da tela (`loadCompositions`, `countCompositions`, `applyCompositionCellInput`, `inspectCompositionsForOp`, `getOpFlowUrl`, `triggerOpFlow`, `loadColumnCatalog`, `fetchViewRows`, `buildViews`, `saveView`, `deleteView`, `resolveCompositionQuery`, `buildCountQuery`, `readCachedCatalog`, `writeCachedCatalog`, `sameCatalog`, `analyzeFormula`, `evaluateFormulaSet`…), sem mudar assinatura.

- [ ] **Passo 1:** exportar os arquivos da `origin/main` da tela para uma pasta de rascunho e copiar para o destino:
  ```bash
  T="$HOME/Desktop/vscode/Tela Composição de Preço"; D=apps/shell/src/pages/composicao
  mkdir -p $D/data $D/formula
  for f in $(git -C "$T" ls-tree -r --name-only origin/main src/data src/formula); do git -C "$T" show origin/main:$f > $D/${f#src/}; done
  git -C "$T" show origin/main:contracts/formula-engine-v1.json > $D/formula/formula-engine-v1.json
  ```
- [ ] **Passo 2:** trocar `from '@/data/...'`/`'@/formula'` por caminhos relativos (`rg -l "from '@/" $D | xargs sed -i ...`) e o import do contrato para `./formula-engine-v1.json`.
- [ ] **Passo 3:** `data/xrm.ts`: `getXrmHost()` devolve `window.Xrm` (sem `window.parent`), comentário: "No shell a página é a de cima; o shell define `window.Xrm` (model-driven ou shim)."
- [ ] **Passo 4:** adicionar dependências: `pnpm --filter @betinhos/shell add big.js @tanstack/react-table@<versão da tela> && pnpm --filter @betinhos/shell add -D @types/big.js`. Conferir `git diff pnpm-lock.yaml | head` (só essas entradas).
- [ ] **Passo 5:** rodar `pnpm --filter @betinhos/shell exec vitest run src/pages/composicao` — esperado: todos os testes de `data/` e `formula/` passam (diferenças de Vitest 5→3 se resolvem no teste, não no código; registrar cada uma).
- [ ] **Passo 6:** `pnpm --filter @betinhos/shell typecheck`; commit `feat(composicao): porta dados e motor de fórmulas da tela para o shell`.

### Tarefa 2: Consulta de abertura sem catálogo

Hoje `resolveCompositionQuery` precisa do catálogo para views nativas com colunas vinculadas (reescreve aliases `a_67d5…` para `r1, r2…`) e `buildViews` só interpreta a view com o catálogo. A abertura passa a usar o FetchXML guardado na view, como está, e lê as colunas vinculadas pelos aliases da própria view.

**Arquivos:**
- Criar: `apps/shell/src/pages/composicao/data/open-query.ts`, `open-query.test.ts`

**Interfaces produzidas:**
```ts
export type OpenColumn = { id: string; valueKey: string; label: string; width: number }
/** Colunas e consulta da primeira página a partir só da linha da view (fetchxml + layoutxml), sem metadata. */
export function openQueryFromViewRow(row: { fetchxml?: unknown; layoutxml?: unknown; name?: unknown }): { fetchXml: string; columns: OpenColumn[] } | null
/** Visão padrão escolhida na abertura: última usada (localStorage `composicao:ultima-visao`), senão a padrão do Dataverse, senão null (consulta padrão). */
export function pickOpenView(rows: ViewRows, lastId: string | null): { id: string; kind: 'personal' | 'public'; row: Record<string, unknown> } | null
```

- [ ] **Passo 1: teste que falha** (`open-query.test.ts`):
  ```ts
  import { describe, expect, it } from 'vitest'
  import { openQueryFromViewRow, pickOpenView } from './open-query'
  const fetchxml = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/><link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" alias="a_1"><attribute name="cr40f_trajeto"/></link-entity></entity></fetch>'
  const layoutxml = '<grid><row><cell name="new_status" width="120"/><cell name="a_1.cr40f_trajeto" width="200"/></row></grid>'
  describe('openQueryFromViewRow', () => {
    it('usa o FetchXML da view e lê colunas vinculadas pelo alias da view', () => {
      const q = openQueryFromViewRow({ fetchxml, layoutxml })!
      expect(q.fetchXml).toBe(fetchxml)
      expect(q.columns.map((c) => c.valueKey)).toEqual(['new_status', 'a_1.cr40f_trajeto'])
      expect(q.columns[1].width).toBe(200)
    })
    it('view sem FetchXML devolve null (cai na consulta padrão)', () => {
      expect(openQueryFromViewRow({ fetchxml: '', layoutxml })).toBeNull()
    })
  })
  describe('pickOpenView', () => {
    const rows = { personal: [{ userqueryid: 'p1', name: 'Minha' }], publicViews: [{ savedqueryid: 's1', name: 'Ativas', isdefault: true }], pins: [] }
    it('prefere a última usada', () => expect(pickOpenView(rows, 'p1')?.id).toBe('p1'))
    it('sem última, usa a padrão', () => expect(pickOpenView(rows, null)?.id).toBe('s1'))
    it('última que sumiu cai na padrão', () => expect(pickOpenView(rows, 'x')?.id).toBe('s1'))
  })
  ```
- [ ] **Passo 2:** rodar e ver falhar ("Cannot find module './open-query'").
- [ ] **Passo 3: implementar** `open-query.ts` reaproveitando `parseLayoutXml` de `views.ts` para larguras e o `DOMParser` para as `<cell name>`; rótulo provisório = nome do atributo; `pickOpenView` lê `isdefault` (acrescentar `isdefault` ao `$select` de `savedquery` em `fetchViewRows`).
- [ ] **Passo 4:** confirmar como a tela guarda a última visão hoje (`rg -n "localStorage" src/components` no repo da tela) e usar a mesma chave, se houver; senão `composicao:ultima-visao`.
- [ ] **Passo 5:** testes passam; commit `feat(composicao): consulta de abertura pelo FetchXML da própria view`.

### Tarefa 3: Reserva e cliente na consulta principal

`loadCompositions` hoje faz página → reservas (lotes de 50) + fórmulas → clientes (`enrichCompositionClients`). Passa a pedir reserva e cliente como `link-entity` `outer` na própria consulta, com aliases fixos que não colidem com os da view.

**Arquivos:**
- Modificar: `apps/shell/src/pages/composicao/data/composition-query.ts` (nova função), `data/dataverse.ts` (`loadCompositions`, `toComposition`)
- Teste: `data/composition-query.test.ts`, `data/dataverse-loading.test.ts`

**Interfaces produzidas:**
```ts
export const ROW_LINKS = { reserva: 'cmp_res', cliente: 'cmp_cli' } as const
/** Garante na consulta os atributos base e os vínculos reserva→cliente usados pela linha; idempotente. */
export function withRowLinks(fetchXml: string): string
```

- [ ] **Passo 1: teste que falha** em `composition-query.test.ts`:
  ```ts
  it('acrescenta reserva e cliente como link-entity sem duplicar', () => {
    const base = '<fetch><entity name="cr40f_composicaodeprecos"><attribute name="new_status"/></entity></fetch>'
    const once = withRowLinks(base)
    expect(once).toContain('<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_servicorelacionadogeral" link-type="outer" alias="cmp_res">')
    expect(once).toContain('<link-entity name="cr40f_clientes1" from="cr40f_clientes1id" to="cr40f_cliente" link-type="outer" alias="cmp_cli">')
    expect(withRowLinks(once)).toBe(once)
  })
  ```
  Atributos da reserva: `cr40f_trajeto, cr40f_dataehorriodesada, cr40f_cliente, cr40f_status, cr40f_tipodoservico, cr40f_tipodeveiculo, cr40f_passageiro1..4`; do cliente: `cr40f_nomedocliente, cr40f_registro, cr40f_endereco` (os mesmos `$select` de hoje).
- [ ] **Passo 2:** teste de `dataverse-loading.test.ts`: com um `window.Xrm` falso que conta chamadas, `loadCompositions(undefined, view)` faz **1** `retrieveMultipleRecords` (antes: 3+) e a linha sai com `client`, `route`, `passengers`, `clientRegistration` preenchidos a partir de `cmp_res.*`/`cmp_cli.*` (valores formatados `@OData.Community.Display.V1.FormattedValue`).
- [ ] **Passo 3:** implementar: `loadCompositions` aplica `withRowLinks(withBaseAttributes(...))` em toda consulta FetchXML; a consulta padrão (sem view) vira FetchXML (`statecode eq 0`, `modifiedon desc`, `count=100`) para também levar os vínculos; o caminho "view sem FetchXML" (`?userQuery=`) mantém a releitura em lote de hoje, agora com `withRowLinks` na releitura. `enrichCompositionClients` só continua sendo usado por `loadCompositionById` se o teste mostrar necessidade; senão sai.
- [ ] **Passo 4:** `buildCountQuery` ignora `cmp_res`/`cmp_cli` (contagem só com os filtros da view) — teste: contagem da consulta com vínculos == contagem sem.
- [ ] **Passo 5:** usuário sem leitura na reserva ou no cliente: o Dataverse recusa a consulta inteira (`0x80040220`). Teste: primeira tentativa falha com esse código → repete sem `withRowLinks` e marca `rowLinks: false`; linhas saem com "Trajeto não informado"/"Cliente sem nome" como hoje. Implementar.
- [ ] **Passo 6:** testes da pasta passam; commit `perf(composicao): reserva e cliente na consulta principal`.

### Tarefa 4: Fórmulas sem bloquear a grade

**Arquivos:**
- Modificar: `data/dataverse.ts` (`loadCompositions` devolve `formulas: Promise<Map<…>>` à parte), `ComposicaoPage.tsx` (Tarefa 6 consome)
- Teste: `data/dataverse-loading.test.ts`, `components/PriceCompositionPage.formula-ux.test.tsx` (portado)

**Interfaces produzidas:**
```ts
export type CompositionPage = { records: Composition[]; source: 'dataverse' | 'mock'; nextLink: string | null; formulas: Promise<Map<string, Partial<Record<MoneyField, CellFormula>>>> }
```

- [ ] **Passo 1: teste que falha:** `loadCompositions` resolve antes de a consulta de `new_formuladecelulacomposicao` responder (Xrm falso com a chamada de fórmulas presa numa promessa manual); `records[i].formulas` é `{}` e `page.formulas` resolve depois com o mapa.
- [ ] **Passo 2:** implementar; a página mescla o mapa nas linhas quando chega (`setRows(rows => rows.map(...))`).
- [ ] **Passo 3:** edição numa célula antes das fórmulas chegarem espera `page.formulas` daquela página (a edição não pode sobrescrever fórmula que ainda não foi lida). Teste em `formula-ux`: abrir editor com fórmulas pendentes mostra o valor e só habilita gravar depois de o mapa chegar.
- [ ] **Passo 4:** testes passam; commit `perf(composicao): fórmulas carregam depois da primeira página`.

### Tarefa 5: Componentes, grade virtualizada e CSS com escopo

**Arquivos:**
- Criar: `apps/shell/src/pages/composicao/components/*` (de `src/components/price-composition/*` e `src/components/data-table/*`, com testes), `apps/shell/src/pages/composicao/composicao.css`
- Não portar: `src/components/ui/{button,dropdown-menu,popover,toast,table}.tsx`, `src/components/layout/AppShell.tsx`, `src/lib/utils.ts`

- [ ] **Passo 1:** copiar componentes e testes como na Tarefa 1; trocar imports `@/components/ui/*`:
  - `button` → `Button` do `@betinhos/ui` (variantes: conferir `rg -n "variant=" components` e mapear para `primary|secondary|ghost|danger` do DS);
  - `dropdown-menu`/`popover` → `Menu`/`Tooltip`/`Dialog` do `@betinhos/ui` conforme uso (inventário: `rg -n "DropdownMenu|Popover" components`); onde o DS não cobre (popover de sugestões de fórmula, prévia de lookup), manter o elemento posicionado em CSS da própria tela, sem base-ui;
  - `toast` → `useToast` do `@betinhos/ui` (o shell já monta `ToastProvider`);
  - `SearchableSelect` fica (é da tela, sem Tailwind).
- [ ] **Passo 2:** `composicao.css`: `styles.css` + `design-tokens.css` da tela com todo seletor prefixado por `.composicao` (script `postcss-prefix-selector` não entra no repo: prefixar uma vez com um script de rascunho no scratchpad e versionar só o CSS resultante); tokens `--...` da tela mapeados para os do DS onde houver par (`rg -o "var\(--[a-z-]+" composicao.css | sort -u`), o resto fica local; `@font-face` da Centabel sai (o shell já carrega a fonte do DS). Conferir: `rg -n "^[^.@:}/ ]" composicao.css` vazio (nenhum seletor global).
- [ ] **Passo 3: virtualização.** Em `components/DataTable.tsx`, renderizar o `tbody` com `useVirtualRows(rows, (r) => r.id, scroller, margin, 36)` de `apps/shell/src/app/VirtualTable.tsx` (linhas espaçadoras `before`/`after` como em `VirtualTable`). Teste em `DataTable.performance.test.tsx` (portado): com 1.200 linhas e scroller com altura, o DOM tem < 100 `<tr>` no corpo; seleção de todas marca as 1.200; navegação por teclado (`grid-cell-focus`) rola até a linha alvo antes de focar (ajustar `grid-cell-focus.ts` para pedir `scrollToIndex` quando a célula não existe no DOM).
- [ ] **Passo 4:** `pnpm --filter @betinhos/shell exec vitest run src/pages/composicao` — todos os testes portados de componentes passam (exceto `PriceCompositionPage.*`, que entram na Tarefa 6).
- [ ] **Passo 5:** commit `feat(composicao): componentes e grade virtualizada no shell`.

### Tarefa 6: Página `ComposicaoPage` com abertura nova

**Arquivos:**
- Criar: `apps/shell/src/pages/composicao/ComposicaoPage.tsx` (de `PriceCompositionPage.tsx`), testes `ComposicaoPage.*.test.tsx` (de `PriceCompositionPage.*.test.tsx`)

**Interfaces consumidas:** `openQueryFromViewRow`, `pickOpenView` (T2), `withRowLinks` (T3), `CompositionPage.formulas` (T4), `DataTable` virtualizada (T5), `Host` do shell (`apps/shell/src/host.ts`).
**Interface produzida:** `export function ComposicaoPage({ host }: { host: Host })`.

Sequência da abertura (substitui o `useEffect` das linhas 258–297 da tela):
1. Em paralelo: `fetchViewRows()` (3 consultas leves), cores do status por `host.metadata` (cache do shell; mock = `{}`), catálogo do cache (`readCachedCatalog`) e `loadColumnCatalog()` em segundo plano.
2. Com as views: `pickOpenView` → `openQueryFromViewRow` → `loadCompositions(undefined, { fetchXml })` + `countCompositions` (as duas únicas consultas de dados da abertura). Sem view ou view sem FetchXML: consulta padrão.
3. Catálogo pronto (cache ou rede): `buildViews(rows, catalog)` e a página passa ao fluxo atual (`resolveCompositionQuery`). Para não refazer a consulta, a view ativa só é trocada pela versão interpretada; se a consulta resolvida for diferente da de abertura (ex.: aliases `a_*` → `r*`), os valores já carregados são remapeados pelo `valueKey` em vez de reler (teste abaixo).
4. Catálogo vencido ou falho: grade segue com as colunas da abertura; editar/filtrar/gerenciar colunas mostra "Carregando campos…" até o catálogo chegar; falha mantém a mensagem atual ("Campos indisponíveis… As views nativas continuam disponíveis.").

- [ ] **Passo 1:** portar `PriceCompositionPage.tsx` → `ComposicaoPage.tsx` e os 11 arquivos de teste; wrapper raiz `<div className="composicao">`; título pelo `PageLayout`/`PageHeader` do shell no lugar do `AppShell` próprio da tela (sem barra lateral nem rodapé de versão próprios).
- [ ] **Passo 2: teste que falha** (`ComposicaoPage.abertura.test.tsx`): com Xrm falso que registra a ordem das chamadas e um `loadColumnCatalog` que nunca resolve, a grade mostra as linhas da primeira página; as chamadas de dados foram exatamente `userquery`, `savedquery`, pins, `cr40f_composicaodeprecos` (página) e `cr40f_composicaodeprecos` (contagem); nenhuma `EntityDefinitions` de tabela relacionada bloqueou.
- [ ] **Passo 3: teste que falha:** catálogo chega depois → nenhuma releitura da página (contador de chamadas a `cr40f_composicaodeprecos` não muda), coluna vinculada mantém o valor.
- [ ] **Passo 4:** implementar a sequência acima; rodar os 12 testes da página.
- [ ] **Passo 5:** casos de borda com teste: view sem FetchXML (cai em `?userQuery=` com releitura); usuário sem leitura numa relacionada (T3 passo 5, agora pela página: aviso discreto e grade carregada); 1.000+ composições (rolagem carrega página a página até o fim, sem página repetida — `REPEATED_PAGE_MESSAGE` mantido); cache vencido (`readCachedCatalog` devolve null → abertura igual, catálogo da rede depois).
- [ ] **Passo 6:** commit `feat(composicao): página nativa com abertura sem esperar a metadata`.

### Tarefa 7: Rota `#/composicao`, menu e mock

**Arquivos:**
- Modificar: `apps/shell/src/nav/menu.ts` (item `{ kind: 'page', id: 'composicao', label: 'Composição de Preço', page: 'composicao' }` ao lado do `wr('Composição de Preço', …)` atual, que passa a se chamar "Composição de Preço (antiga)"), tipo `page` em `menu.ts:13`, `apps/shell/src/app/routes.tsx` (`PAGE_LOADERS.composicao`), `apps/shell/src/app/AppShell.tsx` (ícone `composicao: <Calculator />`; o antigo ganha ícone distinto, regra da sidebar), `routes.test.tsx`, `RouteLayout.test.tsx`
- Teste: `apps/shell/src/app/routes.test.tsx`

- [ ] **Passo 1: teste que falha:** `findItem('composicao')` existe, é `kind: 'page'`, e `#/composicao` renderiza `ComposicaoPage` sem `<iframe>`; `#/new_telacomposicaopreco` continua renderizando o iframe.
- [ ] **Passo 2:** implementar; `AppShell.icons.test.tsx` passa (ícones distintos).
- [ ] **Passo 3:** mock (`pnpm dev`, host `mock`): sem `window.Xrm`, a camada de dados já cai em `getMockRows`/`loadMockViews`; conferir que a página abre com as linhas mock, edição e fórmula funcionam no mock.
- [ ] **Passo 4:** `pnpm --filter @betinhos/shell typecheck && pnpm --filter @betinhos/shell test`; commit `feat(shell): rota #/composicao com a Composição de Preço nativa`.

### Tarefa 8: Medição, qualidade e verificação

- [ ] **Passo 1: antes (DEV autenticado, iframe):** abrir `#/new_telacomposicaopreco` com DevTools (cache vazio e com cache), registrar tempo até a primeira linha e número de requisições até ela (`performance.getEntriesByType('resource')` filtrado por `/api/data/`). Guardar em `docs/superpowers/plans/2026-11-12-composicao-medicao.md`.
- [ ] **Passo 2: depois:** igual em `#/composicao` (precisa do Deploy do DEV com o PR; ver passo 6). Esperado: 1 consulta de página + 1 contagem até a primeira linha, nenhuma `EntityDefinitions` antes dela.
- [ ] **Passo 3:** `qualidade-antes-do-pr` (2–3 passadas `/simplify` + `karpathy-coder`, `/code-review high --fix`).
- [ ] **Passo 4:** `verificacao-manter`: `verificar-shell` + criar `verificar-composicao` (`.claude/skills/verificar-composicao/SKILL.md`: subir mock, abrir `#/composicao`, editar `=100+50` → R$ 150,00 e Enter desce, selecionar 3 → Excel com 3 linhas, Gerar OP no DEV com 3 selecionadas cria 1 OP, visão pessoal do web resource com pins aparece igual) no mesmo commit.
- [ ] **Passo 5:** print no chat (mock: grade, editor de fórmula, menu de visões) e `ux-audit` modo Fluxo.
- [ ] **Passo 6:** PR para a `develop`; depois do merge o Deploy publica a tela no DEV; rodar no DEV autenticado as 4 verificações do brief e a medição do passo 2; a remoção de `#/new_telacomposicaopreco` do menu fica para um PR seguinte, depois da validação do Renan.

## Riscos

- **Aliases da view nativa × aliases gerados (`r1…`):** o remapeamento da Tarefa 6 passo 3 é a parte mais delicada; se o remapeamento não cobrir algum caso, cai na releitura (uma consulta a mais, só quando o catálogo chega), nunca em valor errado.
- **Vitest 5 → 3 e jsdom 30 → 27** nos testes portados: ajustes ficam nos testes.
- **Recusa por privilégio em `link-entity`** derruba a consulta inteira no Dataverse; coberto pela repetição sem vínculos (T3 passo 5).
- **Tamanho do chunk:** a página é carregada sob demanda (`PAGE_LOADERS`), não pesa nas outras telas; meta: chunk da Composição < 250 kB (sem Tailwind/shadcn/base-ui).
- **Duas fontes até o PROD:** hotfix no PROD antes da validação ainda vai pelo repo da tela; cada hotfix precisa ser replicado aqui.
