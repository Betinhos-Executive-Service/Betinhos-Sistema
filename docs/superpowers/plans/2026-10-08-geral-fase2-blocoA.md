# Geral fase 2 — Bloco A (rolagem infinita) — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`).

**Objetivo:** trocar a paginação da Geral por carga sob demanda ao rolar (100 por página, total por agregado), como na Composição de Preço.

**Spec:** `docs/superpowers/specs/2026-10-08-geral-fase2-design.md`, Bloco A. **Base:** HEAD `d7642d8`.

## Restrições globais
Iguais ao plano `2026-10-08-geral-react.md`: só tokens `--bt-*`, sem gradiente, hover só em `(hover: hover) and (pointer: fine)`, sem `transition: all`, pt-BR, botões com verbo, status nunca só por cor, 44 px no celular, commits em português com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Testes: `pnpm --filter @betinhos/shell exec vitest run <arquivo>`; `pnpm typecheck`. Toda resposta de UI começa com `DESIGN CONTEXTO`. Só editar `apps/shell/src/pages/geral/**`.

## Mapa de arquivos
```
domain/fetch.ts          + buildCountFetch(fetchxml, { query, quickFind })
domain/types.ts          PAGE_SIZE = 100; Page ganha nada novo
data/source.ts           + count(req) em Dataverse e mock; PageRequest perde pageSize
data/queries.ts          + parseCount(body)
domain/pageSize.ts       REMOVER (e seus testes)
useGeral.ts              rows acumuladas, more, total, loadingMore, loadError, loadMore, reload sequencial, refresh
components/LoadMore.tsx  sentinela + rodapé de estado
components/GeralTable.tsx expõe ref do contêiner de rolagem; footer = LoadMore
components/GeralCards.tsx footer = LoadMore (root null)
GeralPage.tsx            remove Pagination/Select de tamanho; meta "100 de 220 serviços"
geral.css                remove gr-footer__pages/__size/pagination; estilos do LoadMore
testes                   fetch.test, data.test, useGeral.test, GeralPage.test, LoadMore.test
```

---

### Tarefa A1: `buildCountFetch` e `source.count`

**Arquivos:** modificar `domain/fetch.ts`, `domain/fetch.test.ts`, `data/queries.ts`, `data/source.ts`, `data/mock.ts`, `data/data.test.ts`, `domain/types.ts`.

**Interfaces:**
- `buildCountFetch(fetchxml: string, opts: { query: string; quickFind: string[] }): string` — a partir do FetchXML da visão: remove de `<fetch>` os atributos `count`, `page`, `paging-cookie`, `returntotalrecordcount`, `distinct`; põe `aggregate="true"`; remove todos os `<order>` (raiz e links); remove todos os `<attribute>` da raiz e dos `<link-entity>` (mantém os `link-entity`, seus `filter` e `alias`); acrescenta `<attribute name="cr40f_reservadeveculosid" alias="total" aggregate="count" />` como primeiro filho da raiz; injeta a busca (`like` nos `quickFind`) igual ao `buildFetch`. Lança `FetchXML da visão inválido.` como o `buildFetch`.
- `parseCount(body: { value: Row[] }): number | null` — lê `value[0].total` (número) ou `null`.
- `Source.count(req: { fetchxml: string; query: string; quickFind: string[] }): Promise<number | null>` — Dataverse: `request(fetchPath(set, buildCountFetch(...)))` → `parseCount`; em erro, `null`. Mock: tamanho do resultado de `applyMockFetch` com `pageSize` infinito (`total` já devolvido).
- `PAGE_SIZE = 100`; `PageRequest` perde `pageSize` (sempre `PAGE_SIZE`); `domain/pageSize.ts` é removido com seu teste e usos.

- [ ] Testes (fetch.test.ts): count fetch tem `aggregate="true"`, sem `order`, sem `count/page/paging-cookie/returntotalrecordcount/distinct`, único `<attribute>` na raiz com `alias="total" aggregate="count"`, `link-entity` preservado sem `<attribute>` e com seu `filter`, busca injetada; inválido lança. (data.test.ts): `parseCount({ value: [{ total: 220 }] }) === 220`, `parseCount({ value: [] }) === null`; `source.count` no mock devolve `MOCK_ROW_COUNT` para a Agenda e o total filtrado para "Sem motorista"; Dataverse com host falso chama `?fetchXml=` contendo `aggregate="true"` e devolve o número; erro → `null`. Remover testes de `pageSize`.
- [ ] Implementar; `pnpm typecheck`; commit "Geral: contagem total por FetchXML agregado e página fixa de 100".

### Tarefa A2: `useGeral` com carga sob demanda

**Arquivos:** `useGeral.ts`, `useGeral.test.tsx`.

**Interfaces (novo retorno do hook):** remove `page`, `cookies`, `pageSize`, `setPageSize`, `goTo`. Acrescenta:
- `more: boolean`, `total: number | null`, `loadingMore: boolean`, `loadError: string | null`, `pagesLoaded: number`
- `loadMore(): void` — ignora se `loading`, `loadingMore`, `!more` ou `loadError`; pede `page = pagesLoaded + 1` com o `cookie` da última resposta; acrescenta só linhas com id novo; se o cookie devolvido for igual ao anterior e houver `more`, para com `loadError = 'A consulta não avançou. Tente atualizar.'`; token descarta respostas de visão/ordem/busca antigas.
- `retryLoadMore(): void` — limpa `loadError` e chama `loadMore`.
- `reload(): void` — recarrega da página 1 até `pagesLoaded` em sequência (cada página com o cookie da anterior), substitui `rows` ao final (ou progressivamente), mantém `selected` filtrando ids ainda presentes; `refresh()` = mesmo comportamento (alias).
- Primeira página: ao trocar visão/ordem/busca, `rows = []`, `pagesLoaded = 0`, `cookie = null`, `selected` limpa, `total = null`; carrega a página 1; `total` = `totalrecordcount` da resposta quando ≥ 0; senão chama `source.count` em paralelo (não bloqueia a lista) e preenche quando chegar.
- `toggleAll()` marca/desmarca todas as linhas carregadas.

- [ ] Testes (mock com latência 0, `MOCK_ROW_COUNT = 220`): abre com 100 linhas, `more = true`, `total = 220`; `loadMore` → 200; `loadMore` → 220 e `more = false`; ids sem repetição; `loadMore` com `more = false` não chama a source (espião); trocar ordenação volta a 100 e `pagesLoaded = 1`; `reload` com 2 páginas carregadas mantém 200 linhas e a seleção dos ids presentes; resposta de ordem antiga é descartada (source falsa com atraso controlado); cookie repetido gera `loadError` e não duplica; `retryLoadMore` limpa o erro. Manter os testes de `save` existentes (adaptar sem `goTo`).
- [ ] Implementar; typecheck; commit "Geral: hook com rolagem infinita (acumula páginas, total e releitura sequencial)".

### Tarefa A3: `LoadMore`, tabela, cards, página e CSS

**Arquivos:** criar `components/LoadMore.tsx` (+ `LoadMore.test.tsx`); modificar `GeralTable.tsx`, `GeralCards.tsx`, `GeralPage.tsx`, `geral.css`, `GeralPage.test.tsx`.

**Interfaces:**
- `LoadMore({ root, more, loading, loadingMore, error, loaded, total, onLoadMore, onRetry })`:
  - Sentinela `<div class="gr-sentinel" aria-hidden />` renderizado quando `more && !loadingMore && !error`; `IntersectionObserver` (se existir) com `{ root: root?.current ?? null, rootMargin: '800px 0px' }` chama `onLoadMore` ao intersectar; re-arma quando `loaded`/`more` mudam.
  - Rodapé `<div class="gr-loadmore" role="status">`: texto à esquerda `statusText(loaded, total, more)` → `"100 de 220 serviços"` | `"100+ serviços"` (total null e more) | `"220 serviços"` (fim); à direita: `Spinner` + "Carregando mais…" quando `loadingMore`; botão ghost "Carregar mais" quando `more && !loadingMore && !error`; "Fim da lista" quando `!more && loaded > 0`; em `error`: `Alert tone="danger"` compacto com a mensagem e botão "Tentar novamente" (`onRetry`).
  - Exportar `statusText` puro para teste.
- `GeralTable` recebe `scrollRef` (`RefObject<HTMLDivElement>`) aplicado ao `.gr-grid`; `footer` continua slot (recebe `LoadMore` com `root = scrollRef`).
- `GeralCards` recebe `footer` e o renderiza após a lista (`LoadMore` com `root = null`).
- `GeralPage`: remove `Pagination`, `Select` de tamanho, `PAGE_SIZES`, `goTo`; `meta` do cabeçalho = `statusText(...)`; `Atualizar` → `reload`; `refresh` após formulário. Toolbar "Selecionar carregados" no cabeçalho da tabela.
- CSS: remover `.gr-footer__pages`, `.gr-footer__size`, `.gr-footer .bt-pagination__count`, regra de `.bt-pagination__button`; adicionar `.gr-sentinel { height: 1px }`, `.gr-loadmore { display: flex; align-items: center; justify-content: space-between; gap: var(--bt-space-3); min-height: 40px; padding: 0 var(--bt-space-4); font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary) }`, `.gr-loadmore__right { display: inline-flex; align-items: center; gap: var(--bt-space-2) }`; no celular botão com 44 px.

- [ ] Testes: `LoadMore.test.tsx` — `statusText` nos três casos; renderiza "Carregar mais" e chama `onLoadMore`; estado de erro com "Tentar novamente"; com `IntersectionObserver` stub (classe global que guarda o callback e expõe `trigger()`), montar dispara `onLoadMore` ao `trigger([{ isIntersecting: true }])`. `GeralPage.test.tsx` — substituir asserções `Linhas 1–50…`/`Próxima` por `"100 de 220 serviços"`; clicar "Carregar mais" → 200 linhas → "200 de 220"; depois "220 serviços" e "Fim da lista"; trocar visão volta a 100; com stub de `IntersectionObserver` o `trigger` carrega sem clique; celular: "Carregar mais" tem 44 px (classe touch).
- [ ] Implementar; `pnpm typecheck`; `pnpm --filter @betinhos/shell test` uma vez; commit "Geral: rolagem infinita na tabela e nos cards, rodapé de estado e fim da paginação".

### Tarefa A4: verificação no navegador
- [ ] `http://localhost:36490/#/geral` a 1440×900: 100 linhas e "100 de 220 serviços"; rolar o grid até o fim carrega 100 e depois 20, termina "220 serviços · Fim da lista"; `document.querySelectorAll('[role=row]').length === 221`; ordenar por ID volta a 100 e ao topo; Atualizar mantém 220 e a posição; 375 px com cards idem. Registrar medidas no ledger.
