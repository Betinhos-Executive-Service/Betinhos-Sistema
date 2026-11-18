# Table do DS: agrupar no servidor (contagem e carga por grupo)

Data: 18/11/2026. Destino: PR no `design-system-betinhos` (`@betinhos-executive-service/ui`, próxima minor depois da 3.7.0). Depois, a migração da Tabela Geral para o `Table` do DS, que tem outros pontos (lista no fim).

## Por quê

O `TableGroups` do DS (§10.9.1) agrupa o que já está carregado: recebe `RowGroup = { id, label, rows }`, conta `rows.length` e desenha uma tabela por grupo aberto. Serve para as listas que carregam tudo no cliente (OPs, Pagantes e as outras do `ListTable`).

A Geral não carrega tudo: são dezenas de milhares de serviços. Ela agrupa no servidor, e hoje faz isso dentro do grid próprio (`GeralTable`):

- **Baldes:** um FetchXML agregado (`buildGroupsFetch` em `domain/fetch.ts`, baldes em `domain/grouping.ts`) devolve cada valor com a contagem real. A ordem, o rótulo, o limite de 50 e o balde "Outros" seguem os do DS (`groupRows`, `GROUP_LIMIT`, `OTHERS_GROUP_ID`).
- **Carga por grupo:** abrir um grupo pede a primeira página de 100 só daquele grupo (`source.page({ group })`). Rolar até o fim do grupo pede a próxima. Cada grupo tem estado próprio: `more`, `loading` e `error` (`GroupLoad`, `useGeral.ts`).
- **Desenho:** linha de cabeçalho do grupo com a contagem real; no fim do grupo aberto, o sentinela da rolagem, "Carregando…", o alerta com "Tentar novamente" ou "Nenhum serviço neste grupo".

Enquanto o DS não tiver isso, a Geral não sai do grid próprio. Este spec leva ao DS só o que falta. A consulta ao Dataverse continua na tela.

## Decisão para o Renan

**Um cabeçalho de colunas por grupo (como as outras listas) ou um só para a lista inteira (como a Geral hoje)?**

- **Hoje na Geral:** uma grade só, com o cabeçalho das colunas no topo e os grupos como faixas entre as linhas. As larguras são as mesmas em todos os grupos.
- **No DS (OPs, Pagantes…):** cada grupo aberto é um `Table` com o próprio cabeçalho. As larguras também são as mesmas, porque todos leem a mesma visão.

**Recomendação: seguir o DS (um `Table` por grupo).** As listas ficam iguais, o DS não precisa de um segundo modo de desenho, e redimensionar, mover ou fixar coluna em qualquer grupo já vale para todos. O custo é repetir a linha de títulos em cada grupo aberto, o que já acontece nas outras listas.

O resto do spec supõe essa escolha. Se a escolha for a faixa dentro de uma grade só, o item 1 muda: o `Table` passaria a desenhar as faixas, e o trabalho é maior.

## 1. O que muda no DS

Tudo é opcional: quem passa só `{ id, label, rows }` continua como está.

### Grupo com contagem e carga vindas de fora

```ts
export type RowGroup<Row> = {
  id: string
  label: string
  /** Linhas já carregadas do grupo (todas, quando o agrupamento é no cliente). */
  rows: Row[]
  /** Contagem real (do servidor). Sem ela, vale `rows.length`. */
  count?: number
  /** Há mais linhas do grupo a carregar. */
  more?: boolean
  /** Uma página do grupo está chegando. */
  loading?: boolean
  /** A última página do grupo falhou; a mensagem aparece com "Tentar novamente". */
  error?: string | null
}
```

### `TableGroups` controlado e com carga

```ts
export type TableGroupsProps<Row> = {
  // … o que já existe (groups, children, resetKey, counting, className)
  /** Grupos abertos, quando a tela controla (agrupamento no servidor). Sem esta prop, o próprio componente controla, como hoje. */
  open?: ReadonlySet<string>
  /** Abrir ou fechar um grupo. Com `open`, a tela muda o estado e, ao abrir pela primeira vez, pede a primeira página. */
  onToggle?: (id: string, open: boolean) => void
  /** Fim do grupo aberto chegou à tela e `more` é verdadeiro: a tela pede a próxima página. */
  onLoadMore?: (id: string) => void
  /** "Tentar novamente" depois de um `error`. */
  onRetry?: (id: string) => void
  /** Raiz do observador do fim do grupo (o contêiner que rola). Padrão: a janela. */
  scrollRoot?: Element | null
  /** Texto do grupo vazio. Padrão: "Nenhum registro neste grupo". */
  emptyGroup?: ReactNode
}
```

Comportamento:

1. **Contagem:** o cabeçalho do grupo mostra `count ?? rows.length`, formatado em pt-BR, e o rótulo para leitor de tela usa esse número. `counting` continua mostrando "…".
2. **Abrir:**
   - Sem `open`: igual a hoje.
   - Com `open`: o clique chama `onToggle(id, !aberto)` e quem abre é a tela. O `resetKey` continua fechando tudo na troca de agrupamento; com `open`, quem fecha é a tela.
3. **Corpo do grupo aberto:** `children(rows, group)`, como hoje, e depois um rodapé do grupo:
   - `more && !loading && !error`: sentinela invisível (`IntersectionObserver` com `scrollRoot`, margem de 200 px) que chama `onLoadMore(id)` uma vez por página. Uma página nova (mais `rows`) arma o sentinela de novo.
   - `loading`: `Spinner` com "Carregando…". Na primeira página (sem linhas), o rodapé ocupa o lugar da tabela.
   - `error`: `Alert` de perigo com a mensagem e o botão "Tentar novamente" (`onRetry(id)`).
   - Sem linhas, sem `more`, sem `loading` e sem `error`: `emptyGroup`.
4. **Seleção:** `selection.all` passa a ser as linhas carregadas de todos os grupos e `scope`, as carregadas do grupo. O checkbox do cabeçalho do grupo marca o que já carregou, como "Selecionar linhas carregadas" faz hoje na lista sem grupo. Selecionar o grupo inteiro no servidor fica fora (ver Fora do escopo).
5. **Virtualização:** o `Table` de cada grupo já pode usar `virtual`. Com o ancestral que rola (correção da 3.7.0), grupos grandes desenham só as linhas perto da tela.
6. **Acessibilidade:** o rodapé do grupo tem `role="status"` para "Carregando…" e para o vazio, e o alerta tem `role="alert"`. O botão do grupo mantém `aria-expanded`.

### Testes no DS

- Contagem: `count` vence `rows.length`, e sem `count` vale `rows.length`.
- Controlado: com `open`, o clique só chama `onToggle` e quem abre é a tela; sem `open`, comportamento de hoje.
- Rodapé: sentinela com `more`, que chama `onLoadMore` uma vez por página. Também: `loading` com e sem linhas, `error` com "Tentar novamente" chamando `onRetry`, e o vazio.
- Seleção: `all` e `scope` com linhas parciais.
- Vitrine: exemplo com "servidor" falso (atraso de 600 ms, páginas de 20, um grupo que falha na segunda página) ao lado do exemplo atual.

## 2. Na Geral, depois do DS

Com o item 1, a parte de grupos da Geral vira `TableGroups` controlado:

- `buckets` e `groupLoads` (`useGeral.ts`) viram `RowGroup[]` com `count`, `more`, `loading` e `error`. É a mesma conversão que o `GeralPage.tsx` já faz para `GroupView`.
- `toggleGroup`, `loadMoreGroup` e `retryGroup` viram `onToggle`, `onLoadMore` e `onRetry`, e o conjunto de abertos sai de `groupLoads`.
- Cada grupo aberto desenha o `Table` da Geral com as linhas do grupo.

O agrupamento sozinho não tira a Geral do grid próprio. Faltam os pontos que já estavam no spec de 11/11 (`2026-11-11-table-ds-selecao-colunas-fixas.md`, item 3) e na análise de 18/11:

1. **Edição na célula:** o `Cell.tsx` próprio vai para `column.edit` do DS (§10.9.5). É a maior parte do trabalho e o maior risco.
2. **Linha de manutenção:** o desenho próprio (`desenhoDaManutencao`), em que o botão de abrir muda de coluna conforme as colunas visíveis, vira `cell` que olha a linha. Também é preciso decidir se o resumo continua dentro da primeira coluna.
3. **Colunas dos metadados do Dataverse:** um adaptador `Column` → `TableColumn` (`cellKind`, `formatCell`, `ChoiceBadge`, `alias`, colunas virtuais sem ordenação).
4. **Preferências:** `ColumnPrefs` (convertido em `useGeralViewState.ts`) passa a levar `pinned`, ou a Geral passa a gravar `ViewConfig` direto.
5. **Detalhes:**
   - Sim/Não numa trilha fixa de 96 px (`defaultWidth: 96`);
   - o véu do `BrandLoader` na recarga (`loadingContent`);
   - o `aria-label="Serviços"`;
   - a primeira coluna como botão que abre o serviço (`opens`).

Ordem sugerida, um PR por item, cada um com teste lado a lado (Shift, menu, larguras salvas, colunas fixas, grupos e muitas linhas):
1. este PR no DS;
2. adaptador de colunas e preferências na Geral, ainda no grid próprio;
3. edição na célula;
4. manutenção;
5. troca do `GeralTable` pelo `Table` com `TableGroups`;
6. apagar o `GeralTable` e o `useVirtualRows` se a Composição não for a única a usá-lo.

## Fora do escopo

- Selecionar todas as linhas de um grupo, ou da lista, no servidor ("selecionar os 2.340").
- Ordenar os grupos por outra coisa que não a ordem do `groupRows`.
- Grupos aninhados.
- A Composição, que fica com a grade própria.
