# Table do DS: colunas que encolhem para caber, barra horizontal no pé e o fim do `VirtualTable`

Data: 18/11/2026. Destino: PR no `design-system-betinhos` (`@betinhos-executive-service/ui`, próxima minor depois da 3.6.0), depois a adoção no shell.

## Por quê

As listas do shell que usam o `Table` do DS o recebem por um invólucro, `apps/shell/src/app/VirtualTable.tsx`, que soma quatro coisas ao `Table`:

| Peça do invólucro | O DS 3.6.0 já tem? |
|---|---|
| Virtualização acima de 100 linhas, rolando no `.bt-shell__main` (`useVirtualRows`, espaçadores `--vt-before`/`--vt-after`) | Sim: `virtual` (`useTableVirtual`), com o mesmo limiar de 100 e rolagem no primeiro ancestral que rola. |
| Loader da marca na primeira carga (`comLoaderDaMarca`, `LoadingTable`) | Não: o DS mostra linhas-esqueleto. |
| Colunas que **encolhem** para caber (`fitTemplate` + `virtual.css`) | Não: o `fluid` faz o contrário (a largura vira mínimo e a coluna cresce). |
| Barra de rolagem horizontal presa ao pé da tela (`BarraHorizontal`) | Não: só existe a barra do `.bt-table__scroll`, no fim da lista. |

Trocar o `VirtualTable` pelo `Table virtual` hoje piora as listas: as colunas param de encolher e quem não rola até o fim volta a não ver as colunas da direita (o caso que originou a barra: Motorista em Despesas com colunas a mais). Este PR leva ao DS as peças que faltam, para o shell apagar o invólucro.

Uso atual no shell:

- `VirtualTable` (virtualização + encolher + barra + loader): OPs, Pagantes, Despesas, Transações (conciliação), Pessoas, Funcionários, Frota Veículos, Frota Registros.
- `LoadingTable` (só o loader): Pendências (Documentos), Infrações, Clientes, Treinamentos, Equipamentos, Logs, Validação do cliente.
- `useVirtualRows` direto: Geral (`GeralTable`) e Composição (`DataTable`). Fora deste PR.

Tudo é opcional no DS: tela que não passa as props novas continua igual.

## 1. Colunas que encolhem para caber (`view.fit`)

```ts
export type TableView = {
  // …
  /**
   * Largura da visão como teto: sem espaço, as colunas encolhem na proporção da largura até o mínimo de cada uma
   * (o texto trunca com reticências); se os mínimos não cabem, a linha passa da borda e a tabela rola na horizontal.
   * Não combina com `fluid` (com os dois, vale `fluid`). Padrão: desligado.
   */
  fit?: boolean
}
```

Regras (as do `fitTemplate` do shell, que viram as do DS):

1. Só encolhe coluna de dados com largura ≥ 64 px. Seleção (40 px), chevron (24 px) e colunas menores que 64 px ficam como estão.
2. Coluna fixa (`pin`) não encolhe: o `left` das fixas seguintes é somado em px e quebraria. A largura dela entra na parte "fixa" do cálculo.
3. Teto: a largura da visão (a salva pelo usuário ou `defaultWidth`/`columnDefaultWidth`). Encolher não altera a visão salva.
4. Mínimo: `min(largura, max(72, round(largura × 0,65)))`.
5. Fatia: proporcional à largura no espaço que sobra da largura visível do rolador, depois do recuo da linha, das colunas que não encolhem e dos espaços entre colunas:
   `max(mínimo, min(largura, calc((100cqw − (n−1) × gap − fixas − recuo) × largura / soma_das_que_encolhem)))`.
   A base é `100cqw` do `.bt-table__scroll` (`container-type: inline-size`), não `%` da linha, para a linha poder passar da borda junto com as colunas.
6. Células com `fit`: `white-space: nowrap`, e o filho direto com `min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis`.
7. Vale também para o modelo compacto (`--bt-table-columns-compact`, 821–1120 px). Até 820 px (layout de lista) nada muda.

**Implementação.**
- `viewLayout` passa a montar o modelo já encolhido quando `fit` está ligado, como já monta o `minmax(…fr)` do `fluid`. Isso tira o `MutationObserver` do shell, que reescrevia `--bt-table-columns` depois de cada render.
- O redimensionamento ao vivo (o trecho que grava `--bt-table-columns` durante o arraste, `Table.tsx` ~577) usa a mesma função, para a coluna arrastada não pular ao soltar.
- A largura de partida do arraste é a desenhada, como já é com `fluid`.

## 2. Barra horizontal presa ao pé (`stickyScrollbar`)

```ts
type TableProps<Row> = {
  // …
  /**
   * Barra de rolagem horizontal presa ao pé da tela (o primeiro ancestral que rola na vertical), sincronizada com a da tabela
   * nos dois sentidos; a da tabela fica escondida. Só aparece quando as colunas passam da largura. Sem efeito com
   * `stickyHeader`/`fill` (a tabela já rola por dentro, com a barra no pé dela) e até 820 px. Padrão: desligado.
   */
  stickyScrollbar?: boolean
}
```

Comportamento (o da `BarraHorizontal`):

- `position: sticky; bottom: 0` depois do `.bt-table__scroll`, com fundo de superfície e `z-index` acima das linhas.
- A largura do conteúdo da barra é `clientWidth + (scrollWidth − clientWidth)` da tabela. Ela é recalculada por `ResizeObserver` no rolador e no cabeçalho, porque o cabeçalho muda ao mostrar, ocultar ou alargar coluna.
- A sincronia `scroll` ↔ barra ignora diferenças de até 1 px (evita laço).
- Com `scrollLeft > 0` a sombra das colunas fixas continua vindo do `.bt-table__scroll`; a barra só move o mesmo `scrollLeft`.
- Some (`hidden`) quando não há sobra horizontal.

## 3. Loader no lugar das linhas-esqueleto (`loadingContent`)

```ts
type TableProps<Row> = {
  // …
  /** Mostrado no corpo, no lugar das linhas-esqueleto, enquanto `loading` e sem linhas. Com linhas, elas ficam na tela. */
  loadingContent?: ReactNode
}
```

O DS não conhece o `BrandLoader` do shell; recebe o nó. Isso substitui o `comLoaderDaMarca`, que hoje troca `loading` por `false` e põe o loader em `empty`. Esse truque desliga o `aria-busy` e faz o estado vazio aparecer como se fosse carga. Com a prop, o `Table` mantém `aria-busy` e a lógica de "sem linhas".

## 4. Conferir o `virtual` no layout do shell

Sem mudança de API, só testes e, se precisar, correção:

- Rolagem no `.bt-shell__main`, com a barra de comandos (`ViewBar`, chips) acima da tabela mudando de altura. O shell recalcula o `scrollMargin` por `ResizeObserver`; o `useTableVirtual` precisa do mesmo.
- Colunas fixas e a barra do item 2 com as linhas virtualizadas.
- `aria-rowcount` / `aria-rowindex` com a posição real; seleção com Shift e "Selecionar todas" sobre todas as `rows`.
- Troca de densidade remede as linhas.

## Testes no DS

- `viewLayout` com `fit`:
  - modelo gerado para colunas grandes, pequenas, fixas, com seleção e chevron;
  - mínimo de 65 % com piso de 72 px;
  - `fit` + `fluid` = `fluid`;
  - modelo compacto.
- Redimensionar com `fit`: a largura gravada é a de soltar, e Esc volta à de antes.
- `stickyScrollbar`:
  - aparece só com sobra;
  - sincroniza nos dois sentidos;
  - some com `stickyHeader`/`fill`;
  - acompanha mostrar e ocultar colunas.
- `loadingContent`: aparece sem linhas, não aparece com linhas e `aria-busy` fica ligado.
- `virtual` com rolador ancestral e cabeçalho acima de altura variável (item 4).
- Página de documentação do `Table` (§10.9) com as três props novas.

## Adoção no shell (depois do PR do DS)

1. Atualizar `@betinhos/ui` para a 3.7.0.
2. As 15 telas (8 do `VirtualTable`, 7 do `LoadingTable`) passam a usar `app/ListTable.tsx`. É um adaptador de poucas linhas que só liga os padrões das listas no `Table` do DS: `virtual`, `stickyScrollbar`, `loadingContent` com o `BrandLoader` e `view.fit`. Todo o comportamento fica no DS. As 7 telas do `LoadingTable` passam a encolher as colunas e a ter a barra no pé, como as outras.
3. Apagados `VirtualTable`, `LoadingTable`, `comLoaderDaMarca`, `fitTemplate`, `BarraHorizontal` e `virtual.css`. O `useVirtualRows` foi para `app/useVirtualRows.ts` e fica até a Geral e a Composição pararem de usá-lo.
4. Conferido no mock (pacote do DS aplicado localmente):
   - 1440 px e 1000 px nas 17 telas que abrem com tabela. As 8 telas do antigo `VirtualTable` dão as mesmas larguras de antes. As 7 do antigo `LoadingTable` passam a encolher (ex.: Pendências a 1000 px passa de 886 px de sobra para 366).
   - `?volume=5000`: cerca de 38 linhas no DOM entre espaçadores.
   - Coluna fixa com rolagem horizontal pela barra do pé.

Três defeitos do DS apareceram nessa adoção e foram corrigidos no mesmo PR do DS (#68):
- **`virtual` com `view` e sem `stickyHeader`** desenhava a lista inteira: o `overflow-x: auto` da área faz o `overflow-y` calculado virar `auto`.
- **A tabela com `overflow: clip`** perdia o mínimo zero como item de grid. A Treinamentos esticava.
- **O preenchimento da barra** entrava na largura de conteúdo da tabela e criava um laço de largura.

## Fora do escopo

Geral (depende do agrupamento no servidor, da linha de manutenção e da edição na célula; spec à parte). Composição (planilha em TanStack Table com fórmulas e rodapé calculado, fica com a grade própria). Cotações do Planner (abre em kanban; a lista é opcional).
